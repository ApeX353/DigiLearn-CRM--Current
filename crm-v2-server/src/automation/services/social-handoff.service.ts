import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LeadsService } from '../../leads/leads.service';
import { CreateLeadWithSchoolContactsDto } from '../../leads/dto';
import { Lead } from '../../leads/entities/lead.entity';

/**
 * #9 — Social→sales handoff (marketing-triaged inbound → CRM lead).
 *
 * Marketing's lead-triage produces handoff packs that a human re-keys
 * into the CRM, feeding the unassigned-lead problem (#2). This wraps
 * the existing transactional lead-create so a triaged inbound becomes
 * a real CRM lead with `source = Social Media`, then leaves it for the
 * #2 auto-router to assign and start the SLA clock.
 *
 * Reuses LeadsService.createWithSchoolAndContacts so school resolution,
 * contact handling, and SLA-history seeding all behave identically to a
 * hand-entered lead. Final dedupe across near-identical leads is the job
 * of the existing duplicate-detection service (duplicate-suspicion).
 */
@Injectable()
export class SocialHandoffService {
  private readonly logger = new Logger(SocialHandoffService.name);

  constructor(
    private readonly leadsService: LeadsService,
    @InjectRepository(Lead)
    private readonly leadRepository: Repository<Lead>,
  ) {}

  async handoff(dto: CreateLeadWithSchoolContactsDto, userId: string) {
    // Tag the source on the way in (honoured by create if supported)...
    (dto.lead as unknown as Record<string, unknown>).source ??= 'Social Media';

    const result = await this.leadsService.createWithSchoolAndContacts(
      dto,
      userId,
    );

    // ...and enforce it after, so attribution (#12) is reliable
    // regardless of whether the create path propagated the field.
    if (result?.lead?.id) {
      await this.leadRepository.update(result.lead.id, {
        source: 'Social Media' as Lead['source'],
      });
      this.logger.log(
        `Social handoff: created lead ${result.lead.id} (source=Social Media)`,
      );
    }

    return result;
  }
}
