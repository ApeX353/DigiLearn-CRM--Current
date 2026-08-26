import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, In, IsNull } from 'typeorm';
import { Lead } from '../leads/entities/lead.entity';
import { LeadSLA } from '../leads/entities/lead-sla.entity';
import { LeadSLAHistory } from '../leads/entities/lead-sla-history.entity';
import { Deal } from '../deals/entities/deal.entity';
import { Stage } from '../pipelines/entities/stage.entity';
import { User } from '../users/entities/user.entity';
import { UserNotificationsService } from '../notifications/user-notifications.service';

@Injectable()
export class SlaBreachService {
  private readonly logger = new Logger(SlaBreachService.name);

  constructor(
    @InjectRepository(Lead)
    private readonly leadRepository: Repository<Lead>,
    @InjectRepository(LeadSLA)
    private readonly leadSlaRepository: Repository<LeadSLA>,
    @InjectRepository(LeadSLAHistory)
    private readonly leadSlaHistoryRepository: Repository<LeadSLAHistory>,
    @InjectRepository(Deal)
    private readonly dealRepository: Repository<Deal>,
    @InjectRepository(Stage)
    private readonly stageRepository: Repository<Stage>,
    private readonly dataSource: DataSource,
    private readonly userNotificationsService: UserNotificationsService,
  ) {}

  // ========================
  // Lead SLA Breach Check
  // ========================

  async checkLeadSlaBreaches() {
    const activeSlaConfigs = await this.leadSlaRepository.find({
      where: { is_active: true },
    });

    if (activeSlaConfigs.length === 0) {
      return { breachedCount: 0, leads: [] };
    }

    const now = new Date();
    const breachedLeads: any[] = [];

    for (const slaConfig of activeSlaConfigs) {
      // Find leads in this status that have a due date in the past and haven't been flagged yet
      const leads = await this.leadRepository
        .createQueryBuilder('lead')
        .leftJoinAndSelect('lead.assignee', 'assignee')
        .where('lead.status = :status', { status: slaConfig.status })
        .andWhere('lead.current_sla_due_date IS NOT NULL')
        .andWhere('lead.current_sla_due_date < :now', { now })
        .andWhere('lead.sla_breached = :breached', { breached: false })
        .andWhere('lead.deleted_at IS NULL')
        .getMany();

      if (leads.length === 0) continue;

      const adminManagerIds = await this.getAdminAndManagerUserIds();

      for (const lead of leads) {
        // Update lead breach fields
        await this.leadRepository.update(lead.id, {
          sla_breached: true,
          sla_breach_count: () => 'sla_breach_count + 1',
        });

        // Ensure SLA history record exists (upsert for legacy leads)
        const existingHistory = await this.leadSlaHistoryRepository.findOne({
          where: { lead_id: lead.id, status: slaConfig.status, exited_status_at: IsNull() },
        });

        if (!existingHistory) {
          await this.leadSlaHistoryRepository.save(
            this.leadSlaHistoryRepository.create({
              lead_id: lead.id,
              status: slaConfig.status,
              entered_status_at: lead.current_sla_due_date
                ? new Date(lead.current_sla_due_date.getTime() - slaConfig.sla_hours * 3600000)
                : now,
              sla_due_date: lead.current_sla_due_date ?? undefined,
              sla_hours: slaConfig.sla_hours,
              sla_breached: true,
              breached_at: now,
            }),
          );
        } else {
          await this.leadSlaHistoryRepository
            .createQueryBuilder()
            .update(LeadSLAHistory)
            .set({
              sla_breached: true,
              breached_at: now,
            })
            .where('lead_id = :leadId', { leadId: lead.id })
            .andWhere('status = :status', { status: slaConfig.status })
            .andWhere('exited_status_at IS NULL')
            .execute();
        }

        // Build target user IDs: assignee + admins + sales_managers
        const targetUserIds = new Set<string>(adminManagerIds);
        if (lead.assigned_to) {
          targetUserIds.add(lead.assigned_to);
        }

        // Send notification (dedupe_key prevents duplicates)
        const dedupeKey = `lead-sla-breach-${lead.id}-${slaConfig.status}`;
        try {
          await this.userNotificationsService.sendToUsers({
            title: 'Lead SLA Breached',
            message: `Lead "${lead.lead_name}" has breached the SLA for status "${slaConfig.status}" (limit: ${slaConfig.sla_hours}h)`,
            severity: 'warning',
            entity: 'Lead',
            entityId: lead.id,
            dedupeKey,
            actionUrl: `/leads/${lead.id}`,
            userIds: [...targetUserIds],
          });
        } catch (error) {
          // Duplicate dedupe_key means notification already exists — skip
          if (error?.code === 'ER_DUP_ENTRY' || error?.message?.includes('duplicate')) {
            this.logger.debug(`Notification already exists for ${dedupeKey}`);
          } else {
            this.logger.error(`Failed to send notification for lead ${lead.id}: ${error.message}`);
          }
        }

        breachedLeads.push({
          id: lead.id,
          lead_name: lead.lead_name,
          status: slaConfig.status,
          assigned_to: lead.assigned_to,
          sla_hours: slaConfig.sla_hours,
          sla_due_date: lead.current_sla_due_date,
        });
      }
    }

    return {
      breachedCount: breachedLeads.length,
      leads: breachedLeads,
    };
  }

  // ========================
  // Deal SLA Breach Check
  // ========================

  async checkDealSlaBreaches() {
    const now = new Date();

    // Find ongoing deals with stages that have sla_days > 0
    const deals = await this.dealRepository
      .createQueryBuilder('deal')
      .leftJoinAndSelect('deal.current_stage', 'stage')
      .leftJoinAndSelect('deal.assigned_user', 'assignee')
      .where('deal.close_status = :status', { status: 'ongoing' })
      .andWhere('stage.sla_days > 0')
      .getMany();

    if (deals.length === 0) {
      return { breachedCount: 0, deals: [] };
    }

    const adminManagerIds = await this.getAdminAndManagerUserIds();
    const breachedDeals: any[] = [];

    for (const deal of deals) {
      const stage = deal.current_stage;
      const deadline = new Date(deal.currentStageSince);
      deadline.setDate(deadline.getDate() + stage.sla_days);

      if (now <= deadline) continue;

      if (!deal.sla_breached) {
        await this.dealRepository.update(deal.id, {
          sla_breached: true,
          last_breached_at: now,
        });
      }

      // Build target user IDs: assignee + admins + sales_managers
      const targetUserIds = new Set<string>(adminManagerIds);
      if (deal.assigned_to) {
        targetUserIds.add(deal.assigned_to);
      }

      // Send notification (dedupe_key prevents duplicates per deal-stage combo)
      const dedupeKey = `deal-sla-breach-${deal.id}-${stage.id}`;
      try {
        await this.userNotificationsService.sendToUsers({
          title: 'Deal SLA Breached',
          message: `Deal "${deal.title}" has exceeded the SLA for stage "${stage.name}" (limit: ${stage.sla_days} days)`,
          severity: 'warning',
          entity: 'Deal',
          entityId: deal.id,
          dedupeKey,
          actionUrl: `/deals/${deal.id}`,
          userIds: [...targetUserIds],
        });
      } catch (error) {
        if (error?.code === 'ER_DUP_ENTRY' || error?.message?.includes('duplicate')) {
          this.logger.debug(`Notification already exists for ${dedupeKey}`);
        } else {
          this.logger.error(`Failed to send notification for deal ${deal.id}: ${error.message}`);
        }
      }

      breachedDeals.push({
        id: deal.id,
        title: deal.title,
        stage_name: stage.name,
        assigned_to: deal.assigned_to,
        sla_days: stage.sla_days,
        currentStageSince: deal.currentStageSince,
        deadline,
      });
    }

    return {
      breachedCount: breachedDeals.length,
      deals: breachedDeals,
    };
  }

  // ========================
  // Read-only breach summaries
  // ========================

  async getLeadBreachSummary() {
    const leads = await this.leadRepository
      .createQueryBuilder('lead')
      .leftJoinAndSelect('lead.assignee', 'assignee')
      .where('lead.sla_breached = :breached', { breached: true })
      .andWhere('lead.deleted_at IS NULL')
      // A closed record cannot be late: archived (disqualified) and
      // converted leads owe no response, so they never inflate the
      // "N leads have exceeded their SLA" banner.
      .andWhere("lead.status NOT IN ('Disqualified','Converted')")
      .orderBy('lead.current_sla_due_date', 'ASC')
      .getMany();

    return {
      totalBreached: leads.length,
      leads: leads.map((lead) => ({
        id: lead.id,
        lead_name: lead.lead_name,
        status: lead.status,
        assigned_to: lead.assigned_to,
        assignee_name: lead.assignee
          ? `${lead.assignee.first_name} ${lead.assignee.last_name}`
          : null,
        sla_breach_count: lead.sla_breach_count,
        sla_due_date: lead.current_sla_due_date,
      })),
    };
  }

  async getDealBreachSummary() {
    const now = new Date();

    const deals = await this.dealRepository
      .createQueryBuilder('deal')
      .leftJoinAndSelect('deal.current_stage', 'stage')
      .leftJoinAndSelect('deal.assigned_user', 'assignee')
      .where('deal.close_status = :status', { status: 'ongoing' })
      .andWhere('stage.sla_days > 0')
      .getMany();

    const breachedDeals = deals.filter((deal) => {
      const deadline = new Date(deal.currentStageSince);
      deadline.setDate(deadline.getDate() + deal.current_stage.sla_days);
      return now > deadline;
    });

    return {
      totalBreached: breachedDeals.length,
      deals: breachedDeals.map((deal) => {
        const deadline = new Date(deal.currentStageSince);
        deadline.setDate(deadline.getDate() + deal.current_stage.sla_days);
        const daysOverdue = Math.floor(
          (now.getTime() - deadline.getTime()) / (1000 * 60 * 60 * 24),
        );

        return {
          id: deal.id,
          title: deal.title,
          stage_name: deal.current_stage.name,
          assigned_to: deal.assigned_to,
          assignee_name: deal.assigned_user
            ? `${deal.assigned_user.first_name} ${deal.assigned_user.last_name}`
            : null,
          sla_days: deal.current_stage.sla_days,
          currentStageSince: deal.currentStageSince,
          deadline,
          daysOverdue,
        };
      }),
    };
  }

  // ========================
  // Helper: get admin + sales_manager user IDs
  // ========================

  private async getAdminAndManagerUserIds(): Promise<string[]> {
    const users = await this.dataSource
      .createQueryBuilder()
      .select('DISTINCT user.id', 'id')
      .from('users', 'user')
      .innerJoin('user_roles', 'ur', 'ur.user_id = user.id')
      .innerJoin('roles', 'role', 'role.id = ur.role_id')
      .where('role.name IN (:...roles)', { roles: ['admin', 'sales_manager'] })
      .andWhere('user.is_active = :active', { active: true })
      .getRawMany();

    return users.map((u: any) => u.id);
  }
}
