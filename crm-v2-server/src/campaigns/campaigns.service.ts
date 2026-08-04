import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import { Campaign } from './entities/campaign.entity';
import { Lead } from '../leads/entities/lead.entity';
import { Deal } from '../deals/entities/deal.entity';
import { CashRequisition } from '../cash-requisitions/entities/cash-requisition.entity';
import { CreateCampaignDto, UpdateCampaignDto } from './dto/campaign.dto';

/** Canonical UUID v1–v5 shape — used to tell a raw id from a slug. */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface CurrencyBucket {
  currency: string;
  in_approval: string;
  paid: string;
  total: string;
}

export interface CampaignRoiPerCurrency {
  currency: string;
  spend_paid: string;
  spend_committed: string;
  /** spend ÷ leads sourced — null when no leads yet (never divide by 0) */
  cost_per_lead: string | null;
  /** spend ÷ won deals — null when no won deals yet */
  cost_per_won_deal: string | null;
}

export interface CampaignWonDealCost {
  deal_id: string;
  title: string;
  deal_value: string;
  deal_currency: string;
  currency: string;
  campaign_share: string;
  direct_cost: string;
  true_cost: string;
}

@Injectable()
export class CampaignsService {
  constructor(
    @InjectRepository(Campaign)
    private readonly campaignRepo: Repository<Campaign>,
    @InjectRepository(Lead)
    private readonly leadRepo: Repository<Lead>,
    @InjectRepository(Deal)
    private readonly dealRepo: Repository<Deal>,
    @InjectRepository(CashRequisition)
    private readonly requisitionRepo: Repository<CashRequisition>,
  ) {}

  async create(dto: CreateCampaignDto, userId: string): Promise<Campaign> {
    const campaign = this.campaignRepo.create({
      ...dto,
      currency: dto.currency ?? 'USD',
      // R6: default the entry date to today when not supplied.
      entry_date: dto.entry_date ?? new Date().toISOString().slice(0, 10),
      slug: await this.uniqueSlug(dto.name),
      created_by_id: userId,
    });
    return this.campaignRepo.save(campaign);
  }

  findAll(): Promise<Campaign[]> {
    return this.campaignRepo.find({
      relations: ['created_by'],
      order: { start_date: 'DESC' },
    });
  }

  /**
   * Resolve a campaign by uuid OR slug. Postgres would raise a cast error if
   * we passed a non-uuid string into the uuid `id` column, so we branch on
   * the shape of the identifier: a canonical uuid looks up by id, anything
   * else looks up by slug. Existing uuid links keep working unchanged.
   */
  async findOne(idOrSlug: string): Promise<Campaign> {
    const where = UUID_RE.test(idOrSlug)
      ? { id: idOrSlug }
      : { slug: idOrSlug };
    const campaign = await this.campaignRepo.findOne({
      where,
      relations: ['created_by'],
    });
    if (!campaign)
      throw new NotFoundException(`Campaign ${idOrSlug} not found`);
    return campaign;
  }

  /**
   * Slugify a name into a URL-safe token: lowercased, accents stripped,
   * non-alphanumerics collapsed to single dashes, trimmed. Falls back to
   * `campaign` if the name has no usable characters.
   */
  private slugify(name: string): string {
    const base = name
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 180);
    return base || 'campaign';
  }

  /**
   * Produce a slug that is unique across campaigns. On collision, append
   * `-2`, `-3`, … `excludeId` lets an update keep/refresh its own slug
   * without colliding with itself.
   */
  private async uniqueSlug(name: string, excludeId?: string): Promise<string> {
    const base = this.slugify(name);
    let candidate = base;
    let n = 2;
    // Loop is bounded in practice — collisions are rare and each iteration
    // narrows toward a free suffix.
    for (;;) {
      const existing = await this.campaignRepo.findOne({
        where: { slug: candidate },
        select: ['id'],
      });
      if (!existing || existing.id === excludeId) return candidate;
      candidate = `${base}-${n++}`;
    }
  }

  /** Edit a campaign — fixes a wrong date, name, type, etc. (TEST-BACKLOG #17). */
  async update(id: string, dto: UpdateCampaignDto): Promise<Campaign> {
    const campaign = await this.findOne(id);
    if (dto.name !== undefined) {
      campaign.name = dto.name;
      // Refresh the slug from the new name, keeping it unique (and allowing
      // this campaign to retain its own slug rather than colliding with it).
      campaign.slug = await this.uniqueSlug(dto.name, campaign.id);
    }
    if (dto.type !== undefined) campaign.type = dto.type;
    if (dto.start_date !== undefined) campaign.start_date = dto.start_date;
    if (dto.end_date !== undefined) campaign.end_date = dto.end_date ?? null;
    if (dto.currency !== undefined) campaign.currency = dto.currency;
    return this.campaignRepo.save(campaign);
  }

  /**
   * Delete a campaign — refused while anything is still attached, so a live
   * campaign is never yanked out from under its leads/requisitions. Detach
   * those first (or the campaign was a mistake with nothing attached).
   */
  async remove(id: string): Promise<void> {
    await this.findOne(id); // 404 if missing
    const leads = await this.leadRepo.count({
      where: { source_campaign_id: id } as never,
    });
    const reqs = await this.requisitionRepo.count({
      where: { campaign_id: id } as never,
    });
    if (leads > 0 || reqs > 0) {
      throw new BadRequestException(
        `Cannot delete: ${leads} sourced lead(s) and ${reqs} requisition(s) are attached. Detach them first.`,
      );
    }
    await this.campaignRepo.delete(id);
  }

  /**
   * Leads sourced from this campaign (tag survives conversion). When
   * `scopeUserId` is supplied (a sales_rep), only the leads assigned to
   * that rep are returned; elevated roles pass undefined and see all.
   */
  async findLeads(id: string, scopeUserId?: string): Promise<Lead[]> {
    await this.findOne(id);
    return this.leadRepo.find({
      where: {
        source_campaign_id: id,
        ...(scopeUserId ? { assigned_to: scopeUserId } : {}),
      },
      relations: ['school', 'assignee'],
      order: { created_at: 'DESC' },
    });
  }

  /**
   * Campaign spend, one bucket per currency — never merged.
   *
   * Elevated roles (scopeUserId undefined) see campaign-level spend:
   * requisitions raised directly against the campaign.
   *
   * A sales_rep (scopeUserId set) sees only spend DERIVED FROM their own
   * campaign records — requisitions attached to a lead/deal that is both
   * sourced from this campaign and assigned to them. Campaign-level
   * requisitions are org costs not attributable to a single rep, so they
   * are not surfaced in the scoped view.
   */
  async getSpend(id: string, scopeUserId?: string): Promise<CurrencyBucket[]> {
    await this.findOne(id);

    const qb = this.requisitionRepo
      .createQueryBuilder('req')
      .select('req.currency', 'currency')
      .addSelect(
        `COALESCE(SUM(CASE WHEN req.status IN ('SUBMITTED','MANAGER_APPROVED','FINANCE_APPROVED') THEN req.total_amount ELSE 0 END), 0)`,
        'in_approval',
      )
      .addSelect(
        `COALESCE(SUM(CASE WHEN req.status = 'PAID' THEN req.total_amount ELSE 0 END), 0)`,
        'paid',
      );

    if (scopeUserId) {
      const [leadRows, dealRows] = await Promise.all([
        this.leadRepo.find({
          where: { source_campaign_id: id, assigned_to: scopeUserId },
          select: ['id'],
        }),
        this.dealRepo.find({
          where: { source_campaign_id: id, assigned_to: scopeUserId } as never,
          select: ['id'],
        }),
      ]);
      const leadIds = leadRows.map((l) => l.id);
      const dealIds = dealRows.map((d) => d.id);
      if (leadIds.length === 0 && dealIds.length === 0) {
        return [];
      }
      qb.where(
        new Brackets((b) => {
          if (leadIds.length) {
            b.orWhere('req.lead_id IN (:...leadIds)', { leadIds });
          }
          if (dealIds.length) {
            b.orWhere('req.deal_id IN (:...dealIds)', { dealIds });
          }
        }),
      );
    } else {
      qb.where('req.campaign_id = :id', { id });
    }

    const rows: Array<{
      currency: string;
      in_approval: string | null;
      paid: string | null;
    }> = await qb
      .andWhere(`req.status NOT IN ('DRAFT','REJECTED')`)
      .groupBy('req.currency')
      .getRawMany();

    return rows.map((r) => {
      const inApproval = Number(r.in_approval ?? 0);
      const paid = Number(r.paid ?? 0);
      return {
        currency: r.currency,
        in_approval: inApproval.toFixed(2),
        paid: paid.toFixed(2),
        total: (inApproval + paid).toFixed(2),
      };
    });
  }

  /**
   * Campaign ROI:
   *  - spend per currency (paid + committed)
   *  - leads sourced; cost per lead = spend ÷ leads
   *  - won deals among them; cost per won deal = spend ÷ won deals
   *  - per won deal: true cost = EVEN-SPLIT share of campaign spend
   *    (spend ÷ total leads sourced) + the deal's own direct costs.
   *    Value-weighting the split was considered and deliberately
   *    deferred: even split keeps every deal's number stable as other
   *    leads close, and matches the precision of the underlying data.
   *  - zero-lead / zero-won cases return null rates — never divide by 0.
   */
  async getRoi(id: string) {
    const campaign = await this.findOne(id);
    const spend = await this.getSpend(id);

    const leadCount = await this.leadRepo.count({
      where: { source_campaign_id: id },
    });

    const wonDeals = await this.dealRepo
      .createQueryBuilder('deal')
      .where('deal.source_campaign_id = :id', { id })
      .andWhere(`deal.close_status = 'won'`)
      .getMany();

    const perCurrency: CampaignRoiPerCurrency[] = spend.map((bucket) => {
      const committed = Number(bucket.total);
      return {
        currency: bucket.currency,
        spend_paid: bucket.paid,
        spend_committed: bucket.total,
        cost_per_lead:
          leadCount > 0 ? (committed / leadCount).toFixed(2) : null,
        cost_per_won_deal:
          wonDeals.length > 0
            ? (committed / wonDeals.length).toFixed(2)
            : null,
      };
    });

    // Per-won-deal true cost, one row per (deal, currency): the deal's
    // even-split share of campaign spend in that currency plus the
    // deal's own direct requisition spend in that currency.
    const wonDealCosts: CampaignWonDealCost[] = [];
    if (wonDeals.length > 0) {
      const directRows: Array<{
        deal_id: string;
        currency: string;
        direct: string;
      }> = await this.requisitionRepo
        .createQueryBuilder('req')
        .select('req.deal_id', 'deal_id')
        .addSelect('req.currency', 'currency')
        .addSelect(
          `COALESCE(SUM(CASE WHEN req.status NOT IN ('DRAFT','REJECTED') THEN req.total_amount ELSE 0 END), 0)`,
          'direct',
        )
        .where('req.deal_id IN (:...ids)', {
          ids: wonDeals.map((d) => d.id),
        })
        .groupBy('req.deal_id')
        .addGroupBy('req.currency')
        .getRawMany();

      for (const deal of wonDeals) {
        // Currencies relevant to this deal: campaign spend currencies +
        // any currency the deal has direct costs in.
        const currencies = new Set<string>([
          ...spend.map((s) => s.currency),
          ...directRows
            .filter((r) => r.deal_id === deal.id)
            .map((r) => r.currency),
        ]);
        for (const currency of currencies) {
          const bucket = spend.find((s) => s.currency === currency);
          const share =
            bucket && leadCount > 0 ? Number(bucket.total) / leadCount : 0;
          const direct = Number(
            directRows.find(
              (r) => r.deal_id === deal.id && r.currency === currency,
            )?.direct ?? 0,
          );
          if (share === 0 && direct === 0) continue;
          wonDealCosts.push({
            deal_id: deal.id,
            title: deal.title,
            deal_value: Number(deal.value).toFixed(2),
            deal_currency: deal.currency,
            currency,
            campaign_share: share.toFixed(2),
            direct_cost: direct.toFixed(2),
            true_cost: (share + direct).toFixed(2),
          });
        }
      }
    }

    return {
      campaign: {
        id: campaign.id,
        name: campaign.name,
        type: campaign.type,
        start_date: campaign.start_date,
        end_date: campaign.end_date,
      },
      spend,
      leads_sourced: leadCount,
      won_deals: wonDeals.length,
      per_currency: perCurrency,
      won_deal_costs: wonDealCosts,
    };
  }
}
