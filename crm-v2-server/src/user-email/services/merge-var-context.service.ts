import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { format } from 'date-fns';
import { Lead } from '../../leads/entities/lead.entity';
import { Deal } from '../../deals/entities/deal.entity';
import { Contact } from '../../contacts/entities/contact.entity';
import { User } from '../../users/entities/user.entity';

/**
 * Builds the merge-variable "scope" passed to the Mustache engine when
 * an email template is rendered.
 *
 * Every scope has the same top-level shape so authors can write
 * templates once and rely on the keys always being present (falsy
 * values become empty strings rather than undefined references, which
 * is what Mustache does naturally anyway):
 *
 *   {
 *     contact: { first_name, last_name, full_name, email, phone, ... },
 *     lead:    { lead_name, status, temperature, ... } | null,
 *     deal:    { name, amount, stage, close_date, ... } | null,
 *     user:    { first_name, last_name, full_name, email, ... },  // sender
 *     today:   { iso, long, short },
 *   }
 *
 * The resolver looks up only the entities it actually needs, so sending
 * an email "to a lead" with no deal doesn't pay a JOIN tax for deals.
 */
export interface MergeVarScope {
  contact: Record<string, string | number | null> | null;
  lead: Record<string, string | number | null> | null;
  deal: Record<string, string | number | null> | null;
  user: Record<string, string | number | null>;
  today: { iso: string; long: string; short: string };
}

interface BuildScopeInput {
  senderUserId: string;
  leadId?: string;
  dealId?: string;
  contactId?: string;
}

@Injectable()
export class MergeVarContextService {
  constructor(
    @InjectRepository(Lead)
    private readonly leadRepo: Repository<Lead>,
    @InjectRepository(Deal)
    private readonly dealRepo: Repository<Deal>,
    @InjectRepository(Contact)
    private readonly contactRepo: Repository<Contact>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  async buildScope(input: BuildScopeInput): Promise<MergeVarScope> {
    const [sender, lead, deal, contact] = await Promise.all([
      this.userRepo.findOne({ where: { id: input.senderUserId } }),
      input.leadId
        ? this.leadRepo.findOne({
            where: { id: input.leadId },
            relations: ['school'],
          })
        : Promise.resolve(null),
      input.dealId
        ? this.dealRepo.findOne({ where: { id: input.dealId } })
        : Promise.resolve(null),
      input.contactId
        ? this.contactRepo.findOne({ where: { id: input.contactId } })
        : Promise.resolve(null),
    ]);

    const now = new Date();

    return {
      contact: contact ? this.contactScope(contact) : null,
      lead: lead ? this.leadScope(lead) : null,
      deal: deal ? this.dealScope(deal) : null,
      user: this.userScope(sender),
      today: {
        iso: now.toISOString(),
        long: format(now, "EEEE, MMMM d, yyyy"),
        short: format(now, 'MMM d, yyyy'),
      },
    };
  }

  private contactScope(
    contact: Contact,
  ): Record<string, string | number | null> {
    const anyContact = contact as unknown as Record<string, unknown>;
    const firstName = (anyContact.first_name ?? '') as string;
    const lastName = (anyContact.last_name ?? '') as string;
    return {
      id: contact.id ?? null,
      first_name: firstName,
      last_name: lastName,
      full_name: `${firstName} ${lastName}`.trim(),
      email: (anyContact.email ?? null) as string | null,
      phone: (anyContact.phone ?? null) as string | null,
      title: (anyContact.title ?? null) as string | null,
    };
  }

  private leadScope(lead: Lead): Record<string, string | number | null> {
    const anyLead = lead as unknown as Record<string, unknown>;
    return {
      id: lead.id ?? null,
      lead_name: (anyLead.lead_name ?? '') as string,
      status: (anyLead.status ?? '') as string,
      temperature: (anyLead.temperature ?? null) as string | null,
      temperature_score: (anyLead.temperature_score ?? null) as number | null,
      school: (anyLead.school as { name?: string } | undefined)?.name ?? null,
    };
  }

  private dealScope(deal: Deal): Record<string, string | number | null> {
    const anyDeal = deal as unknown as Record<string, unknown>;
    return {
      id: deal.id ?? null,
      name:
        ((anyDeal.deal_name ?? anyDeal.title ?? anyDeal.name) as string) || '',
      amount: (anyDeal.amount ?? anyDeal.value ?? null) as number | null,
      stage: (anyDeal.stage ?? null) as string | null,
      close_date: (anyDeal.close_date ?? null) as string | null,
    };
  }

  private userScope(
    user: User | null,
  ): Record<string, string | number | null> {
    if (!user) {
      return {
        id: null,
        first_name: '',
        last_name: '',
        full_name: '',
        email: '',
      };
    }
    const anyUser = user as unknown as Record<string, unknown>;
    const firstName = (anyUser.first_name ?? '') as string;
    const lastName = (anyUser.last_name ?? '') as string;
    return {
      id: user.id ?? null,
      first_name: firstName,
      last_name: lastName,
      full_name: `${firstName} ${lastName}`.trim(),
      email: (anyUser.email ?? '') as string,
    };
  }
}
