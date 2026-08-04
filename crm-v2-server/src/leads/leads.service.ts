import {
  Injectable,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
  ForbiddenException,
  ConflictException,
  Optional,
  Inject,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, EntityManager, In } from 'typeorm';
import { Lead } from './entities/lead.entity';
import {
  LeadStakeholder,
  DecisionRole,
  InfluenceLevel,
} from './entities/lead-stakeholders.entity';
import {
  LeadQualificationCriteria,
  QualificationChecklist,
} from './entities/lead-qualification-criteria.entity';
import { School } from '../schools/entities/schools.entity';
import { Contact } from '../contacts/entities/contact.entity';
import {
  CreateLeadDto,
  UpdateLeadDto,
  QueryLeadDto,
  CreateLeadWithSchoolContactsDto,
  CreateLeadStakeholderDto,
  CreateLeadReversalRequestDto,
  ReviewLeadReversalRequestDto,
} from './dto';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import {
  paginate,
  Pagination,
  IPaginationOptions,
} from 'nestjs-typeorm-paginate';
import { v4 as uuidv4 } from 'uuid';
import { LeadReversalRequest, LeadSLA } from './entities';
import { LeadSLAHistory } from './entities/lead-sla-history.entity';
import { addHours } from 'date-fns';
import { addBusinessHours } from '../common/utils/business-hours';
import type { AppAbility } from '../auth/casl/casl-ability.factory';
import { AbilityScopeService } from '../auth/casl/ability-scope.service';
import { Action } from '../auth/constants/permissions';
import { User } from '../users/entities/user.entity';
import { Deal } from '../deals/entities/deal.entity';
import { Quote } from '../quotes/entities/quote.entity';
import { Invoice } from '../invoices/entities/invoice.entity';
import { Activity, ActivityType } from '../activities/entities/activity.entity';
import { CashRequisition } from '../cash-requisitions/entities/cash-requisition.entity';
import { LeadEscalation } from './entities/lead-escalation.entity';
import {
  LeadAssignmentProposal,
  AssignmentProposalStatus,
} from '../automation/entities/lead-assignment-proposal.entity';
import { EmailQueue } from '../email-sequences/entities/email-queue.entity';
import { DuplicateSuspicion } from './entities/duplicate-suspicion.entity';
import { DocumentItem } from '../document-items/entities/document-item.entity';
import { AppliedPaymentTerm } from '../payment-terms/entities/applied-payment-term.entity';
import { EmailSequenceService } from '../email-sequences/email-sequence.service';
import { ComplianceSettingsService } from '../settings/compliance-settings.service';
import { isTacticalDisqualifyReason } from './constants/reasons';
import { LEAD_STATUSES } from './constants/lead-statuses';
import { canonName, canonCity, canonPhone } from './utils/record-normalization';
import { DuplicateDetectionService } from './services/duplicate-detection.service';

@Injectable()
export class LeadsService {
  private readonly logger = new Logger(LeadsService.name);
  private static readonly LEAD_CONDITION_KEY_MAP: Record<string, string> = {
    id: 'id',
    ownerId: 'assigned_to',
    owner_id: 'assigned_to',
    assignedTo: 'assigned_to',
    assigned_to: 'assigned_to',
    assigneeId: 'assigned_to',
    assignee_id: 'assigned_to',
    schoolId: 'school_id',
    school_id: 'school_id',
    stageId: 'stage_id',
    stage_id: 'stage_id',
    status: 'status',
    source: 'source',
  };

  constructor(
    @InjectRepository(Lead)
    private readonly leadRepository: Repository<Lead>,
    @InjectRepository(LeadStakeholder)
    private readonly leadStakeholderRepository: Repository<LeadStakeholder>,
    @InjectRepository(LeadQualificationCriteria)
    private readonly qualificationRepository: Repository<LeadQualificationCriteria>,
    @InjectRepository(School)
    private readonly schoolRepository: Repository<School>,
    @InjectRepository(Contact)
    private readonly contactRepository: Repository<Contact>,
    private readonly dataSource: DataSource,
    private readonly activityLogsService: ActivityLogsService,
    private readonly abilityScopeService: AbilityScopeService,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(LeadSLAHistory)
    private readonly leadSlaHistoryRepository: Repository<LeadSLAHistory>,
    @InjectRepository(LeadSLA)
    private readonly leadSlaRepository: Repository<LeadSLA>,
    @InjectRepository(LeadReversalRequest)
    private readonly leadReversalRequestRepository: Repository<LeadReversalRequest>,
    private readonly complianceSettings: ComplianceSettingsService,
    private readonly duplicateDetection: DuplicateDetectionService,
    @Optional()
    @Inject(EmailSequenceService)
    private readonly emailSequenceService?: EmailSequenceService,
  ) {}

  async create(createLeadDto: CreateLeadDto, userId: string): Promise<Lead> {
    const lead = this.leadRepository.create(createLeadDto);
    const savedLead = await this.leadRepository.save(lead);

    // Create default qualification record
    await this.ensureQualificationExists(savedLead.id);

    await this.activityLogsService.logCreate(
      'Lead',
      savedLead.id,
      savedLead,
      userId,
      `Created lead: ${savedLead.lead_name}`,
    );

    return this.findOne(savedLead.id);
  }

  /**
   * Create lead with school and contacts in a transaction
   * All or nothing - if any step fails, everything is rolled back
   */
  async createWithSchoolAndContacts(
    input: CreateLeadWithSchoolContactsDto,
    userId: string,
    userRole?: string,
    opts?: { bulkImport?: boolean },
  ): Promise<{
    lead: Lead;
    school: School;
    contacts: Contact[];
    stakeholders: LeadStakeholder[];
  }> {
    const { lead: leadInfo, contacts: contactsList } = input;
    const normalizeText = (value?: string | null): string =>
      value?.trim().toLowerCase().replace(/\s+/g, ' ') ?? '';
    // PH1: canonicalize to the national significant number so the same
    // phone written as +263…, 0…, or spaced/dashed matches and we reuse the
    // existing contact instead of creating a duplicate.
    const normalizePhone = (value?: string | null): string => canonPhone(value);
    const toNullableString = (value?: string | null): string | null => {
      const trimmed = value?.trim();
      return trimmed ? trimmed : null;
    };

    const result = await this.dataSource.transaction(async (manager) => {
      // ===== STEP 1: Handle School (create or use existing) =====
      let school: School;

      if (leadInfo.school_id) {
        // Use existing school
        const existingSchool = await manager.findOne(School, {
          where: { id: leadInfo.school_id },
        });

        if (!existingSchool) {
          throw new BadRequestException('Selected school does not exist');
        }

        school = existingSchool;
      } else {
        // Try reusing an existing school by normalized name + province,
        // refined by city when the caller supplied one. City is optional
        // (owner decision 2026-07-27): without it, a single name+province
        // match is safe to reuse, but several matches are ambiguous and
        // the caller must pick the school explicitly.
        if (!leadInfo.school_name || !leadInfo.province) {
          throw new BadRequestException(
            'School name and province are required to resolve school',
          );
        }

        // SCH1: match on a CANONICAL name (case-folded, punctuation and
        // spacing stripped) so "St. Mary's High School", "St Marys High
        // School" and "St. Mary's  High School" resolve to the SAME school
        // instead of forking a duplicate that splits its leads. Abbreviation
        // expansion (HS → High School) is deliberately NOT done — it would
        // risk merging genuinely distinct schools.
        const canonSchoolName = canonName(leadInfo.school_name);
        const matchingSchools = await manager
          .createQueryBuilder(School, 'school')
          .where(
            "REGEXP_REPLACE(LOWER(school.name), '[^a-z0-9]', '', 'g') = :canonName",
            { canonName: canonSchoolName },
          )
          .andWhere(
            'LOWER(TRIM(school.province::text)) = LOWER(TRIM(:province))',
            { province: leadInfo.province },
          )
          .andWhere('school.deleted_at IS NULL')
          .take(5)
          .getMany();

        let resolvedSchool: School | undefined;
        if (matchingSchools.length === 1) {
          // SCH2: a single name+province match IS the school — reuse it
          // regardless of any city spelling difference. City disambiguates
          // BETWEEN multiple same-name schools; it must not fork a new
          // record over "Harare" vs "Harare CBD" vs "Hre".
          resolvedSchool = matchingSchools[0];
        } else if (matchingSchools.length > 1) {
          // Several genuinely same-named schools in this province — use the
          // city to pick one, compared canonically so spelling variance
          // still matches. If the city is missing or doesn't single one out,
          // the caller must choose explicitly.
          if (leadInfo.city) {
            const canonInputCity = canonCity(leadInfo.city);
            const cityMatches = matchingSchools.filter(
              (s) => canonCity(s.city) === canonInputCity,
            );
            if (cityMatches.length === 1) {
              resolvedSchool = cityMatches[0];
            }
          }
          if (!resolvedSchool) {
            throw new BadRequestException(
              `Several schools named "${leadInfo.school_name}" exist in ${leadInfo.province} — select the school from the suggestions or provide its city`,
            );
          }
        }

        if (resolvedSchool) {
          school = resolvedSchool;
        } else {
          // Create new school only when no existing school matches.
          // City is mandatory for user-created schools. The exception is
          // the bulk import, which runs as admin/admin_support and comes
          // through THIS path (POST /leads) — the same exemption the
          // schools endpoint already had. Without it the Nash import
          // rejected every school whose city the web lookup could not
          // find, which is exactly the case the import exists to handle.
          // City exemption: the bulk import (opts.bulkImport) and the
          // admin/admin_support roles may create a school without a city
          // (it renders "Click here to enter city" for anyone to fill).
          const importRoles = ['admin', 'admin_support'];
          const cityExempt =
            opts?.bulkImport === true || importRoles.includes(userRole ?? '');
          if (!leadInfo.city?.trim() && !cityExempt) {
            throw new BadRequestException(
              'City is required to create a new school',
            );
          }
          if (!leadInfo.region) {
            throw new BadRequestException(
              'School region is required for new school',
            );
          }

          school = await manager.save(School, {
            name: leadInfo.school_name,
            city: toNullableString(leadInfo.city),
            province: leadInfo.province,
            district: leadInfo.district,
            region: leadInfo.region,
            school_type: leadInfo.school_type || 'Other',
            church_denomination: leadInfo.church_denomination || 'Other',
            ownership_type: leadInfo.ownership_type || 'Other',
            is_active: true,
          });
        }
      }

      // ===== STEP 2: Validate and process primary contact =====
      const primaryContact = contactsList.find((c) => c.is_primary);

      if (!primaryContact) {
        throw new BadRequestException('Primary contact is required');
      }

      const schoolContacts = await manager.find(Contact, {
        where: { school_id: school.id },
      });

      const resolveContact = async (
        contactDto: CreateLeadWithSchoolContactsDto['contacts'][number],
        isPrimary: boolean,
      ): Promise<Contact> => {
        if (contactDto.contact_id) {
          const existingById = schoolContacts.find(
            (contact) => contact.id === contactDto.contact_id,
          );

          if (!existingById) {
            throw new BadRequestException(
              'Selected contact does not belong to selected school',
            );
          }

          return existingById;
        }

        const normalizedEmail = normalizeText(contactDto.email);
        if (normalizedEmail) {
          const existingByEmail = schoolContacts.find(
            (contact) => normalizeText(contact.email) === normalizedEmail,
          );
          if (existingByEmail) {
            return existingByEmail;
          }
        }

        const normalizedPhone = normalizePhone(
          contactDto.phone || contactDto.whatsapp_number,
        );
        if (normalizedPhone) {
          const existingByPhone = schoolContacts.find((contact) => {
            const phone = normalizePhone(contact.phone);
            const whatsapp = normalizePhone(contact.whatsapp_number);
            return phone === normalizedPhone || whatsapp === normalizedPhone;
          });
          if (existingByPhone) {
            return existingByPhone;
          }
        }

        const normalizedFirstName = normalizeText(contactDto.first_name);
        const normalizedLastName = normalizeText(contactDto.last_name);
        if (normalizedFirstName && normalizedLastName) {
          const existingByName = schoolContacts.find(
            (contact) =>
              normalizeText(contact.first_name) === normalizedFirstName &&
              normalizeText(contact.last_name) === normalizedLastName,
          );
          if (existingByName) {
            return existingByName;
          }
        }

        const newContact = manager.create(Contact, {
          school_id: school.id,
          first_name: contactDto.first_name,
          last_name: contactDto.last_name,
          email: toNullableString(contactDto.email),
          phone: toNullableString(contactDto.phone),
          secondary_phone: toNullableString(contactDto.secondary_phone),
          whatsapp_number: toNullableString(contactDto.whatsapp_number),
          role: contactDto.role,
          notes: toNullableString(contactDto.notes),
          preferred_contact_method: contactDto.preferred_contact_method || null,
          is_primary: isPrimary,
          is_active: true,
        });

        const savedContact = await manager.save(Contact, newContact);
        schoolContacts.push(savedContact);
        return savedContact;
      };

      // ===== STEP 3: Resolve primary contact (reuse existing by id/match or create new) =====
      const newPrimaryContact = await resolveContact(primaryContact, true);

      const slaConfig = await manager.findOne(LeadSLA, {
        where: {
          status: 'New',
        },
      });

      if (!slaConfig) {
        throw new InternalServerErrorException(
          'An SLA COnfig for status:New is missing',
        );
      }

      // New leads are NOT auto-assigned to whoever created them. A sales
      // rep entering a lead leaves it UNASSIGNED for a sales manager to
      // assign. Only a manager/admin may set the owner at creation (via
      // leadInfo.assigned_to). This is a deliberate change from the old
      // behaviour where every lead was assigned to its creator — reps were
      // silently claiming every lead they typed in.
      const isManagerRole =
        userRole === 'admin' ||
        userRole === 'sales_manager' ||
        userRole === 'manager';
      const assignedTo =
        isManagerRole && leadInfo.assigned_to ? leadInfo.assigned_to : null;

      // ===== STEP 4: Create lead =====
      const newLead = manager.create(Lead, {
        lead_name: leadInfo.name,
        school_id: school.id,
        primary_contact_id: newPrimaryContact.id,
        source: leadInfo.source,
        status: 'New',
        assigned_to: assignedTo,
        current_sla_due_date: addBusinessHours(new Date(), slaConfig.sla_hours),
        estimated_value: leadInfo.estimated_value,
        notes: leadInfo.notes,
        source_campaign_id: leadInfo.source_campaign_id ?? null,
      });

      const savedLead = await manager.save(Lead, newLead);

      // ===== STEP 4b: Create initial SLA history record =====
      const newLeadSLAHistory = manager.create(LeadSLAHistory, {
        lead_id: savedLead.id,
        status: savedLead.status,
        entered_status_at: new Date(),
        sla_due_date: savedLead.current_sla_due_date ?? undefined,
        sla_hours: slaConfig.sla_hours,
      })
      await manager.save(LeadSLAHistory, newLeadSLAHistory);

      // ===== STEP 5: Create primary stakeholder relationship =====
      const primaryStakeholder = new LeadStakeholder();
      primaryStakeholder.id = uuidv4();
      primaryStakeholder.lead_id = savedLead.id;
      primaryStakeholder.contact_id = newPrimaryContact.id;
      primaryStakeholder.role =
        (primaryContact.role || newPrimaryContact.role) as any;
      primaryStakeholder.decision_role =
        (primaryContact.decision_role as DecisionRole) ||
        DecisionRole.INFLUENCER;
      primaryStakeholder.influence_level =
        (primaryContact.influence_level as InfluenceLevel) ||
        InfluenceLevel.MEDIUM;
      primaryStakeholder.is_primary = true;
      primaryStakeholder.notes = primaryContact.notes || '';

      await manager.save(LeadStakeholder, primaryStakeholder);

      // ===== STEP 6: Resolve additional contacts and create stakeholder relationships =====
      const additionalContacts = contactsList.filter((c) => !c.is_primary);
      const insertedContacts: Contact[] = [];
      const insertedContactIds = new Set<string>();
      const allStakeholders: LeadStakeholder[] = [primaryStakeholder];
      const stakeholderContactIds = new Set<string>([newPrimaryContact.id]);

      if (additionalContacts.length > 0) {
        for (const contactDto of additionalContacts) {
          const contact = await resolveContact(contactDto, false);

          if (
            contact.id !== newPrimaryContact.id &&
            !insertedContactIds.has(contact.id)
          ) {
            insertedContacts.push(contact);
            insertedContactIds.add(contact.id);
          }

          // Skip duplicate stakeholder links for already-linked contacts.
          if (stakeholderContactIds.has(contact.id)) {
            continue;
          }

          stakeholderContactIds.add(contact.id);

          const stakeholder = new LeadStakeholder();
          stakeholder.id = uuidv4();
          stakeholder.lead_id = savedLead.id;
          stakeholder.contact_id = contact.id;
          stakeholder.role = (contactDto.role || contact.role) as any;
          stakeholder.decision_role =
            (contactDto.decision_role as DecisionRole) ||
            DecisionRole.INFLUENCER;
          stakeholder.influence_level =
            (contactDto.influence_level as InfluenceLevel) ||
            InfluenceLevel.MEDIUM;
          stakeholder.is_primary = false;
          stakeholder.notes = contactDto.notes || '';

          const savedStakeholder = await manager.save(
            LeadStakeholder,
            stakeholder,
          );
          allStakeholders.push(savedStakeholder);
        }
      }

      // ===== STEP 7: Create default qualification record =====
      await this.ensureQualificationExists(savedLead.id, manager);

      // ===== STEP 8: Log activity =====
      await this.activityLogsService.logCreate(
        'Lead',
        savedLead.id,
        {
          lead: savedLead,
          school: school,
          contacts: [newPrimaryContact, ...insertedContacts],
        },
        userId,
        `Created lead: ${savedLead.lead_name} from ${leadInfo.source}`,
      );

      return {
        lead: savedLead,
        school,
        contacts: [newPrimaryContact, ...insertedContacts],
        stakeholders: allStakeholders,
      };
    });

    // DUP1: after the lead is committed, surface any near-duplicate to the
    // manager review queue. Nothing ever wrote suspicions, so the queue was
    // permanently empty. Best-effort and non-fatal — a detection hiccup must
    // never fail a legitimate create.
    void this.recordLeadDuplicateSuspicion(result.lead, userId);

    return result;
  }

  /**
   * DUP1: peek for near-duplicate leads and record the top match as a
   * pending suspicion for the manager review queue. Swallows all errors so
   * it can be called fire-and-forget after a create.
   */
  private async recordLeadDuplicateSuspicion(
    lead: Lead,
    userId: string,
  ): Promise<void> {
    try {
      const primaryContact = lead.primary_contact_id
        ? await this.contactRepository.findOne({
            where: { id: lead.primary_contact_id },
          })
        : null;
      const candidates = await this.duplicateDetection.peekLead({
        lead_name: lead.lead_name,
        school_id: lead.school_id,
        primary_contact_id: lead.primary_contact_id,
        phone: primaryContact?.phone ?? null,
        email: primaryContact?.email ?? null,
      });
      // peekLead already filters to score >= threshold; exclude the lead
      // itself and record the strongest remaining match.
      const top = candidates.find((c) => c.record.id !== lead.id);
      if (top) {
        await this.duplicateDetection.recordSuspicion({
          record_type: 'lead',
          new_record_id: lead.id,
          existing_record_id: top.record.id,
          score: top.score,
          signals: top.signals,
          raised_by_id: userId,
        });
      }
    } catch (err) {
      this.logger.warn(
        `[DUP1] duplicate suspicion recording failed for lead ${lead.id}: ${
          (err as Error)?.message
        }`,
      );
    }
  }

  async findAll(
    queryLeadDto: QueryLeadDto,
    ability?: AppAbility,
  ): Promise<Pagination<Lead>> {
    const {
      page = '1',
      limit = '10',
      search,
      status,
      source,
      school_id,
      assigned_to,
      assignment_state,
      include_deleted,
      sla_breached,
      province,
      temperature,
      sort_by,
      sort_order,
    } = queryLeadDto;

    const queryBuilder = this.leadRepository
      .createQueryBuilder('lead')
      .leftJoinAndSelect('lead.school', 'school')
      .leftJoinAndSelect('lead.primary_contact', 'primary_contact')
      .leftJoinAndSelect('lead.assignee', 'assignee')
      .leftJoinAndSelect('lead.stage', 'stage');

    if (!include_deleted) {
      queryBuilder.andWhere('lead.deleted_at IS NULL');
    } else {
      queryBuilder.withDeleted();
    }

    if (search) {
      queryBuilder.andWhere(
        '(LOWER(lead.lead_name) LIKE :search OR LOWER(school.name) LIKE :search)',
        { search: `%${search.toLowerCase()}%` },
      );
    }

    if (status) {
      queryBuilder.andWhere('lead.status = :status', { status });
    }

    if (source) {
      queryBuilder.andWhere('lead.source = :source', { source });
    }

    if (province) {
      queryBuilder.andWhere('school.province = :province', { province });
    }

    if (school_id) {
      queryBuilder.andWhere('lead.school_id = :school_id', {
        school_id: school_id,
      });
    }

    if (sla_breached !== undefined) {
      queryBuilder.andWhere('lead.sla_breached = :slaBreached', {
        slaBreached: sla_breached,
      });
    }

    if (assignment_state === 'assigned') {
      queryBuilder.andWhere('lead.assigned_to IS NOT NULL');
    } else if (assignment_state === 'unassigned') {
      queryBuilder.andWhere('lead.assigned_to IS NULL');
    }

    if (assigned_to && assignment_state !== 'unassigned') {
      queryBuilder.andWhere('lead.assigned_to = :assignedTo', {
        assignedTo: assigned_to,
      });
    }

    if (temperature) {
      queryBuilder.andWhere('lead.temperature = :temperature', { temperature });
    }

    if (ability) {
      this.abilityScopeService.applyScopeToQueryBuilder(queryBuilder, ability, {
        action: Action.READ,
        subject: 'Lead',
        queryAlias: 'lead',
        conditionKeyMap: LeadsService.LEAD_CONDITION_KEY_MAP,
      });
    }

    if (sort_by === 'temperature_score') {
      queryBuilder.orderBy('lead.temperature_score', sort_order || 'DESC');
    } else {
      queryBuilder.orderBy('lead.created_at', 'DESC');
    }
    // API2: a deterministic tiebreaker. The primary sort alone is NOT unique
    // — bulk-imported leads share a created_at (and many share a
    // temperature_score), so tied rows came back in arbitrary order and
    // offset pagination silently duplicated some rows and skipped others
    // (measured: 1753 rows / 1577 distinct, 176 leads never appearing).
    // Ordering by id last makes every page boundary stable.
    queryBuilder.addOrderBy('lead.id', 'DESC');

    const options: IPaginationOptions = {
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
    };

    return paginate<Lead>(queryBuilder, options);
  }

  /**
   * Accurate per-status lead totals for the lead-list tab badges.
   *
   * Fixes phase-1 BUG-003 at the source: the tab counts were derived
   * from the current page of results, so every tab showed a wrong
   * (page-sized) number. This returns the real total for each status
   * in a single grouped query, every status seeded to 0 so the UI
   * always renders every tab, plus an `All` total. Honours soft-delete
   * and the caller's CASL scope so a rep sees only their own counts.
   *
   * NOTE: the separate "selecting a stage tab returns 0 leads" symptom
   * is a CLIENT issue — the backend `findAll` status filter is correct
   * (`lead.status = :status`) and `QueryLeadDto` validates `status`
   * against LEAD_STATUSES. The client must send an exact enum value
   * (e.g. "Contacted", not "contacted"/"all"); "All" carries no status.
   */
  async getStatusCounts(
    ability?: AppAbility,
  ): Promise<Record<string, number>> {
    const qb = this.leadRepository
      .createQueryBuilder('lead')
      .select('lead.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .where('lead.deleted_at IS NULL')
      .groupBy('lead.status');

    if (ability) {
      this.abilityScopeService.applyScopeToQueryBuilder(qb, ability, {
        action: Action.READ,
        subject: 'Lead',
        queryAlias: 'lead',
        conditionKeyMap: LeadsService.LEAD_CONDITION_KEY_MAP,
      });
    }

    const rows = await qb.getRawMany<{ status: string; count: string }>();

    const counts: Record<string, number> = {};
    for (const s of LEAD_STATUSES) counts[s] = 0;
    let total = 0;
    for (const r of rows) {
      counts[r.status] = Number(r.count);
      total += Number(r.count);
    }
    counts.All = total;
    return counts;
  }

  async findOne(id: string, ability?: AppAbility): Promise<Lead> {
    const lead = await this.leadRepository.findOne({
      where: { id },
      relations: ['school', 'primary_contact', 'assignee', 'stage'],
    });

    if (!lead) {
      throw new NotFoundException(`Lead with ID ${id} not found`);
    }

    if (ability && !this.canReadLead(ability, lead)) {
      throw new ForbiddenException('You do not have permission to access this lead');
    }

    // Ensure qualification record exists
    await this.ensureQualificationExists(id);

    return lead;
  }

  async findLeadStakeholders(
    id: string,
    ability?: AppAbility,
  ): Promise<LeadStakeholder[]> {
    if (ability) {
      await this.findOne(id, ability);
    }

    const stakeholders = await this.leadStakeholderRepository.find({
      relations: ['contact'],
      where: {
        lead: {
          id,
        },
      },
    });

    return stakeholders;
  }

  /**
   * DEAL-1 family: a rep may only write to a lead assigned to them. A
   * foreign id answers 404 — not 403 — so ids cannot be probed. Elevated
   * roles pass scopeUserId=undefined and skip the check.
   */
  private assertLeadInScope(
    lead: Pick<Lead, 'assigned_to' | 'id'>,
    scopeUserId?: string,
  ): void {
    if (scopeUserId && lead.assigned_to !== scopeUserId) {
      throw new NotFoundException(`Lead with ID ${lead.id} not found`);
    }
  }

  async addStakeholder(
    leadId: string,
    dto: CreateLeadStakeholderDto,
    userId: string,
    scopeUserId?: string,
  ): Promise<LeadStakeholder> {
    const toNullableString = (value?: string): string | null => {
      const trimmed = value?.trim();
      return trimmed ? trimmed : null;
    };

    return this.dataSource.transaction(async (manager) => {
      const leadRepository = manager.getRepository(Lead);
      const contactRepository = manager.getRepository(Contact);
      const stakeholderRepository = manager.getRepository(LeadStakeholder);

      const lead = await leadRepository.findOne({ where: { id: leadId } });
      if (!lead) {
        throw new NotFoundException(`Lead with ID ${leadId} not found`);
      }
      this.assertLeadInScope(lead, scopeUserId);
      if (!lead.school_id) {
        throw new BadRequestException(
          'Lead must be linked to a school before adding stakeholders',
        );
      }

      let contact: Contact;
      if (dto.contact_id) {
        const existingContact = await contactRepository.findOne({
          where: { id: dto.contact_id },
        });
        if (!existingContact) {
          throw new NotFoundException(
            `Contact with ID ${dto.contact_id} not found`,
          );
        }
        if (existingContact.school_id !== lead.school_id) {
          throw new BadRequestException(
            'Selected contact does not belong to this lead school',
          );
        }
        contact = existingContact;
      } else {
        if (!dto.first_name?.trim() || !dto.last_name?.trim()) {
          throw new BadRequestException(
            'first_name and last_name are required when contact_id is not provided',
          );
        }

        const newContact = contactRepository.create({
          school_id: lead.school_id,
          first_name: dto.first_name.trim(),
          last_name: dto.last_name.trim(),
          email: toNullableString(dto.email),
          phone: toNullableString(dto.phone),
          secondary_phone: toNullableString(dto.secondary_phone),
          whatsapp_number: toNullableString(dto.whatsapp_number),
          role: dto.role || null,
          notes: toNullableString(dto.notes),
          preferred_contact_method: dto.preferred_contact_method || null,
          is_primary: false,
          is_active: true,
        });
        contact = await contactRepository.save(newContact);
      }

      const existingStakeholder = await stakeholderRepository.findOne({
        where: {
          lead_id: lead.id,
          contact_id: contact.id,
        },
      });
      if (existingStakeholder) {
        throw new BadRequestException(
          'Contact is already a stakeholder for this lead',
        );
      }

      const shouldBePrimary = !!dto.is_primary;
      if (shouldBePrimary) {
        await stakeholderRepository
          .createQueryBuilder()
          .update(LeadStakeholder)
          .set({ is_primary: false })
          .where('lead_id = :leadId', { leadId: lead.id })
          .execute();

        await contactRepository
          .createQueryBuilder()
          .update(Contact)
          .set({ is_primary: false })
          .where('school_id = :schoolId', { schoolId: lead.school_id })
          .execute();

        await contactRepository.update(contact.id, { is_primary: true });
        await leadRepository.update(lead.id, { primary_contact_id: contact.id });
      }

      const stakeholder = stakeholderRepository.create({
        id: uuidv4(),
        lead_id: lead.id,
        contact_id: contact.id,
        role: (dto.role || contact.role || 'Other') as any,
        decision_role: dto.decision_role || DecisionRole.INFLUENCER,
        influence_level: dto.influence_level || InfluenceLevel.MEDIUM,
        is_primary: shouldBePrimary,
        notes: dto.notes?.trim() || '',
      });

      const savedStakeholder = await stakeholderRepository.save(stakeholder);
      const stakeholderWithContact = await stakeholderRepository.findOne({
        where: { id: savedStakeholder.id },
        relations: ['contact'],
      });

      await this.activityLogsService.logCreate(
        'Lead',
        lead.id,
        { stakeholder: stakeholderWithContact || savedStakeholder },
        userId,
        `Added stakeholder ${contact.first_name} ${contact.last_name} to lead: ${lead.lead_name}`,
      );

      return stakeholderWithContact || savedStakeholder;
    });
  }

  async update(
    id: string,
    updateLeadDto: UpdateLeadDto,
    userId: string,
    userRoles: string[] = [],
    scopeUserId?: string,
  ): Promise<Lead> {
    const lead = await this.findOne(id);
    this.assertLeadInScope(lead, scopeUserId);

    const { disqualify_reason, nurture_reason, other_value, ...rest } =
      updateLeadDto;
    const requestedStatus = (rest as Partial<Lead>).status;
    const statusChanged =
      requestedStatus !== undefined && requestedStatus !== lead.status;

    if (requestedStatus !== undefined) {
      delete (rest as Partial<Lead>).status;
    }

    // ----- Phase A.1: tactical-disqualify approval gate ----------
    // Block sales reps from applying tactical disqualify reasons (no
    // budget / not interested / can't reach / Other) without an
    // approved LeadReversalRequest{kind:'tactical_disqualify'}.
    //
    // Bypass conditions (any one is sufficient):
    //   1. The compliance switch is OFF (admin opted out org-wide).
    //   2. The caller is admin or sales_manager — managers always
    //      retain direct authority.
    //   3. The reason is in the `admin` bucket (duplicate, school
    //      closed, wrong contact, already-has-solution).
    //   4. An approved tactical_disqualify request exists for this
    //      lead — the rep got pre-authorisation.
    //
    // This runs BEFORE persisting so the lead state never moves into
    // 'Disqualified' on a denied request.
    const wantsDisqualify =
      requestedStatus === 'Disqualified' || !!disqualify_reason;
    const isManagerOrAdmin =
      userRoles.includes('admin') ||
      userRoles.includes('sales_manager') ||
      userRoles.includes('admin_support');

    if (
      wantsDisqualify &&
      !isManagerOrAdmin &&
      isTacticalDisqualifyReason(disqualify_reason)
    ) {
      const enforce = await this.complianceSettings.getBoolean(
        'tactical_disqualify_requires_approval',
      );
      if (enforce) {
        const approved = await this.leadReversalRequestRepository.findOne({
          where: {
            lead_id: id,
            kind: 'tactical_disqualify',
            status: 'approved',
          },
        });
        if (!approved) {
          throw new ForbiddenException(
            `Tactical disqualify reason "${disqualify_reason}" requires manager approval. ` +
              `Please submit a tactical disqualify request via the lead detail page.`,
          );
        }
      }
    }

    // ----- Phase A.2: rep-self-reassignment approval gate --------
    // Block sales reps from changing `assigned_to` on a lead through
    // PATCH /leads/:id without an approved reassignment request, OR
    // unless the org-wide `allow_self_reassign` switch is on. Sales
    // managers and admins are unaffected — the dedicated PATCH
    // /leads/:id/assign endpoint already restricts itself to those
    // roles, but PATCH /leads/:id is rep-callable so a determined
    // rep could otherwise dump leads through the back door.
    const incomingAssignee = (rest as Partial<Lead>).assigned_to;
    const reassignAttempt =
      incomingAssignee !== undefined &&
      incomingAssignee !== null &&
      incomingAssignee !== lead.assigned_to;

    if (reassignAttempt && !isManagerOrAdmin) {
      const allow = await this.complianceSettings.getBoolean(
        'allow_self_reassign',
      );
      if (!allow) {
        const approved = await this.leadReversalRequestRepository.findOne({
          where: {
            lead_id: id,
            kind: 'reassignment',
            status: 'approved',
          },
        });
        if (!approved) {
          throw new ForbiddenException(
            'Sales reps cannot reassign leads directly. ' +
              'Please submit a reassignment request for manager approval.',
          );
        }
      }
    }
    // -------------------------------------------------------------

    const oldValues = { ...lead };
    Object.assign(lead, rest);

    if (disqualify_reason === 'Other' || nurture_reason === 'Other') {
      lead.reason = other_value ?? null;
    } else {
      lead.reason = disqualify_reason || nurture_reason || null;
    }

    // triggers...
    // we need if the lead is set to nartured, slas nolonger apply, or SLA is set to follow-up date
    // we want the lead if set to disqualified slas nolonger apply.

    const hasNonStatusChanges =
      Object.keys(rest).length > 0 ||
      disqualify_reason !== undefined ||
      nurture_reason !== undefined ||
      other_value !== undefined;

    let updatedLead = lead;
    if (hasNonStatusChanges) {
      updatedLead = await this.leadRepository.save(lead);

      await this.activityLogsService.logUpdate(
        'Lead',
        updatedLead.id,
        oldValues,
        updatedLead,
        userId,
        `Updated lead: ${updatedLead.lead_name}`,
      );
    }

    if (statusChanged) {
      return this.updateStatus(id, requestedStatus as string, userId);
    }

    return this.findOne(updatedLead.id);
  }

  async remove(id: string, userId: string): Promise<void> {
    const lead = await this.findOne(id);

    await this.leadRepository.softDelete(id);

    // R1: retire any pending auto-assign proposals for this lead so the
    // approval queue doesn't keep an orphan row (which rendered as a bare
    // "ID") once the lead is gone.
    await this.dataSource.getRepository(LeadAssignmentProposal).update(
      { lead_id: id, status: AssignmentProposalStatus.PENDING },
      { status: AssignmentProposalStatus.SUPERSEDED, decided_at: new Date() },
    );

    await this.activityLogsService.logDelete(
      'Lead',
      lead.id,
      lead,
      userId,
      `Deleted lead: ${lead.lead_name}`,
    );
  }

  async restore(id: string, userId: string): Promise<Lead> {
    const lead = await this.leadRepository.findOne({
      where: { id },
      withDeleted: true,
    });

    if (!lead) {
      throw new NotFoundException(`Lead with ID ${id} not found`);
    }

    if (!lead.deleted_at) {
      throw new NotFoundException(`Lead with ID ${id} is not deleted`);
    }

    await this.leadRepository.restore(id);
    const restoredLead = await this.findOne(id);

    await this.activityLogsService.logCreate(
      'Lead',
      restoredLead.id,
      restoredLead,
      userId,
      `Restored lead: ${restoredLead.lead_name}`,
    );

    return restoredLead;
  }

  async createReversalRequest(
    leadId: string,
    dto: CreateLeadReversalRequestDto,
    userId: string,
  ): Promise<LeadReversalRequest> {
    const lead = await this.leadRepository.findOne({
      where: { id: leadId },
    });

    if (!lead) {
      throw new NotFoundException(`Lead with ID ${leadId} not found`);
    }

    // Default `kind` is `status_reversal` for backwards compatibility
    // — older clients don't send the field and expect the original
    // semantics (request to roll back from Converted).
    const kind = dto.kind ?? 'status_reversal';

    // Per-kind validation. Each kind has its own pre-conditions.
    if (kind === 'status_reversal') {
      if (lead.status !== 'Converted') {
        throw new BadRequestException(
          'Status-reversal requests can only be submitted for converted leads',
        );
      }
      if (!dto.status) {
        throw new BadRequestException(
          'status_reversal requests require a target `status`',
        );
      }
      if (dto.status === 'Converted') {
        throw new BadRequestException(
          'Requested status for reversal cannot be Converted',
        );
      }
    } else if (kind === 'reassignment') {
      if (!dto.proposed_assignee_id) {
        throw new BadRequestException(
          'reassignment requests require `proposed_assignee_id`',
        );
      }
    } else if (kind === 'tactical_disqualify') {
      // Tactical disqualify: caller wants to disqualify with a soft
      // reason. The lead must still be live (not already Converted /
      // Disqualified) — once it's Disqualified there's nothing to
      // approve, and once it's Converted the status_reversal flow
      // applies instead.
      if (lead.status === 'Disqualified') {
        throw new BadRequestException(
          'Lead is already Disqualified — no approval needed',
        );
      }
      if (lead.status === 'Converted') {
        throw new BadRequestException(
          'Use a status_reversal request to roll back a Converted lead before disqualifying',
        );
      }
    }

    const existingPendingRequest = await this.leadReversalRequestRepository.findOne(
      {
        where: {
          lead_id: leadId,
          kind,
          status: 'pending',
        },
      },
    );

    if (existingPendingRequest) {
      throw new ConflictException(
        `A pending ${kind} request already exists for this lead`,
      );
    }

    const reversalRequest = this.leadReversalRequestRepository.create({
      lead_id: leadId,
      kind,
      // For non-status_reversal kinds, `requested_status` is captured
      // for audit-trail readability but the review handler only acts
      // on it for the status_reversal kind.
      requested_status:
        dto.status ??
        (kind === 'tactical_disqualify' ? 'Disqualified' : lead.status),
      proposed_assignee_id: dto.proposed_assignee_id ?? null,
      reason: dto.reason.trim(),
      notes: dto.notes?.trim() || null,
      status: 'pending',
      requested_by_id: userId,
      reviewed_by_id: null,
      reviewed_at: null,
      review_note: null,
    });

    const savedRequest =
      await this.leadReversalRequestRepository.save(reversalRequest);

    // Manager-friendly audit summary. Snake_case enums and bare UUIDs
    // are unreadable; convert to the same labels the queue UI uses.
    const friendlyKind = this.friendlyKindLabel(kind);
    let summary = `${friendlyKind} request submitted for "${lead.lead_name}"`;
    if (kind === 'reassignment' && dto.proposed_assignee_id) {
      const target = await this.usersRepository.findOne({
        where: { id: dto.proposed_assignee_id },
        select: ['id', 'first_name', 'last_name', 'email'],
      });
      if (target) {
        const targetName =
          [target.first_name, target.last_name].filter(Boolean).join(' ').trim() ||
          target.email ||
          target.id;
        summary += ` → propose ${targetName}`;
      }
    }
    await this.activityLogsService.logCreate(
      'Lead',
      lead.id,
      { reversal_request: savedRequest },
      userId,
      summary,
    );

    return savedRequest;
  }

  /**
   * Manager-friendly label for a reversal request kind. Used in
   * audit summaries, queue badges, and any user-visible string.
   * Keep in sync with `KIND_BADGE` in
   * `client/src/pages/admin/approval-queue-page.tsx`.
   */
  private friendlyKindLabel(
    kind: 'status_reversal' | 'reassignment' | 'tactical_disqualify',
  ): string {
    switch (kind) {
      case 'tactical_disqualify':
        return 'Soft-reason disqualification';
      case 'reassignment':
        return 'Reassignment';
      case 'status_reversal':
        return 'Reopen / status reversal';
    }
  }

  async findReversalRequestsByLead(
    leadId: string,
  ): Promise<LeadReversalRequest[]> {
    return this.leadReversalRequestRepository.find({
      where: { lead_id: leadId },
      relations: ['requested_by', 'reviewed_by'],
      order: { created_at: 'DESC' },
    });
  }

  /**
   * Phase C.2 — manager queue feed. Cross-lead listing of reversal
   * requests filterable by `status` and/or `kind`. Eager-loads the
   * lead + the proposed assignee so the manager UI can render a
   * single-row summary without N+1 lookups.
   */
  async findReversalRequests(opts: {
    status?: 'pending' | 'approved' | 'rejected';
    kind?: 'status_reversal' | 'reassignment' | 'tactical_disqualify';
    requestedById?: string;
    limit?: number;
  }): Promise<LeadReversalRequest[]> {
    const qb = this.leadReversalRequestRepository
      .createQueryBuilder('r')
      .leftJoinAndSelect('r.requested_by', 'requested_by')
      .leftJoinAndSelect('r.reviewed_by', 'reviewed_by')
      .leftJoin(Lead, 'lead', 'lead.id = r.lead_id')
      .addSelect([
        'lead.id',
        'lead.lead_name',
        'lead.status',
        'lead.assigned_to',
      ])
      .orderBy('r.created_at', 'DESC');

    if (opts.status) qb.andWhere('r.status = :s', { s: opts.status });
    if (opts.kind) qb.andWhere('r.kind = :k', { k: opts.kind });
    if (opts.requestedById)
      qb.andWhere('r.requested_by_id = :rb', { rb: opts.requestedById });
    qb.take(opts.limit ?? 100);

    // Hand-roll the join so we can attach `lead_summary` to each row
    // for the manager UI without forcing the entity relation graph
    // to declare a Lead manyToOne (lead_id is plain uuid here).
    const raw = await qb.getRawAndEntities();
    const rows = raw.entities.map((entity, i) => {
      const r = raw.raw[i];
      const summary = r
        ? {
            id: r.lead_id,
            lead_name: r.lead_lead_name ?? null,
            status: r.lead_status ?? null,
            assigned_to: r.lead_assigned_to ?? null,
          }
        : null;
      (entity as unknown as { lead_summary?: typeof summary }).lead_summary =
        summary;
      return entity;
    });

    // Resolve proposed_assignee_id → friendly name in one batch lookup
    // so the manager queue can render "→ Grace Mutasa" without N+1.
    // Only matters for reassignment rows.
    const targetIds = Array.from(
      new Set(
        rows
          .filter((r) => r.kind === 'reassignment' && r.proposed_assignee_id)
          .map((r) => r.proposed_assignee_id as string),
      ),
    );
    if (targetIds.length > 0) {
      const targets = await this.usersRepository.find({
        where: { id: In(targetIds) },
        select: ['id', 'first_name', 'last_name', 'email'],
      });
      const byId = new Map(targets.map((u) => [u.id, u]));
      for (const row of rows) {
        if (row.kind === 'reassignment' && row.proposed_assignee_id) {
          const u = byId.get(row.proposed_assignee_id);
          (row as unknown as {
            proposed_assignee_summary?: {
              id: string;
              name: string;
              email: string | null;
            };
          }).proposed_assignee_summary = u
            ? {
                id: u.id,
                name:
                  [u.first_name, u.last_name].filter(Boolean).join(' ').trim() ||
                  u.email ||
                  u.id,
                email: u.email ?? null,
              }
            : undefined;
        }
      }
    }
    return rows;
  }

  async findReversalRequestById(id: string): Promise<LeadReversalRequest> {
    const request = await this.leadReversalRequestRepository.findOne({
      where: { id },
      relations: ['requested_by', 'reviewed_by'],
    });

    if (!request) {
      throw new NotFoundException(
        `Lead reversal request with ID ${id} not found`,
      );
    }

    return request;
  }

  /**
   * Manager raises an Enquiry on a review request (#12): appends a question
   * to the thread and marks the request as awaiting the rep's reply. Stays
   * pending — nothing is decided yet, and the manager may ask again later.
   */
  async raiseEnquiry(
    id: string,
    message: string,
    managerId: string,
  ): Promise<LeadReversalRequest> {
    const request = await this.findReversalRequestById(id);
    if (request.status !== 'pending') {
      throw new BadRequestException('This request has already been decided');
    }
    request.enquiry_thread = [
      ...(request.enquiry_thread ?? []),
      {
        by: 'manager',
        by_id: managerId,
        message,
        at: new Date().toISOString(),
      },
    ];
    request.awaiting_rep_response = true;
    return this.leadReversalRequestRepository.save(request);
  }

  /**
   * The rep answers a manager's Enquiry (#12): appends their reply and hands
   * the request back to the manager. Only the rep who raised it may answer.
   */
  async respondToEnquiry(
    id: string,
    message: string,
    userId: string,
  ): Promise<LeadReversalRequest> {
    const request = await this.findReversalRequestById(id);
    if (request.status !== 'pending') {
      throw new BadRequestException('This request has already been decided');
    }
    if (request.requested_by_id && request.requested_by_id !== userId) {
      throw new ForbiddenException(
        'Only the rep who raised this request can answer the enquiry',
      );
    }
    request.enquiry_thread = [
      ...(request.enquiry_thread ?? []),
      { by: 'rep', by_id: userId, message, at: new Date().toISOString() },
    ];
    request.awaiting_rep_response = false;
    return this.leadReversalRequestRepository.save(request);
  }

  async reviewReversalRequest(
    id: string,
    dto: ReviewLeadReversalRequestDto,
    userId: string,
  ): Promise<LeadReversalRequest> {
    const request = await this.leadReversalRequestRepository.findOne({
      where: { id },
    });

    if (!request) {
      throw new NotFoundException(
        `Lead reversal request with ID ${id} not found`,
      );
    }

    if (request.status !== 'pending') {
      throw new BadRequestException(
        `Lead reversal request has already been ${request.status}`,
      );
    }

    if (dto.decision === 'approved') {
      // Per-kind side effects on approval. status_reversal mutates
      // the lead immediately; the others just unlock a future action
      // by the rep (the rep will then call PATCH /leads/:id with the
      // disqualify reason or assign their lead).
      if (request.kind === 'status_reversal') {
        await this.removeLeadDealsAndDependents(request.lead_id);
        await this.updateStatus(
          request.lead_id,
          request.requested_status,
          userId,
        );
      } else if (request.kind === 'reassignment') {
        // Honour the requested target user immediately so the rep
        // doesn't have to make a second call.
        if (request.proposed_assignee_id) {
          await this.assignLead(
            request.lead_id,
            request.proposed_assignee_id,
            userId,
          );
        }
      }
      // tactical_disqualify: no immediate side-effect. The approval
      // simply unlocks the gate in `update()` for any subsequent
      // disqualify call by the rep.
      request.status = 'approved';
    } else {
      request.status = 'rejected';
    }

    request.reviewed_by_id = userId;
    request.reviewed_at = new Date();
    request.review_note = dto.review_note?.trim() || null;

    const saved = await this.leadReversalRequestRepository.save(request);

    // Manager-friendly summary so the lead's audit trail reads
    // naturally: "Soft-reason disqualification request approved"
    // rather than "Reversal request <uuid> approved".
    const friendlyKind = this.friendlyKindLabel(saved.kind);
    const decisionLabel = saved.status === 'approved' ? 'approved' : 'rejected';
    let summary = `${friendlyKind} request ${decisionLabel}`;
    if (saved.review_note) {
      const trimmed = saved.review_note.length > 60
        ? saved.review_note.slice(0, 57) + '…'
        : saved.review_note;
      summary += ` — "${trimmed}"`;
    }
    await this.activityLogsService.logUpdate(
      'Lead',
      request.lead_id,
      { reversal_request_status: 'pending' },
      { reversal_request_status: saved.status },
      userId,
      summary,
    );

    return this.findReversalRequestById(saved.id);
  }

  private async removeLeadDealsAndDependents(leadId: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const dealRepository = manager.getRepository(Deal);
      const quoteRepository = manager.getRepository(Quote);
      const invoiceRepository = manager.getRepository(Invoice);
      const documentItemRepository = manager.getRepository(DocumentItem);
      const appliedPaymentTermRepository =
        manager.getRepository(AppliedPaymentTerm);

      const deals = await dealRepository.find({
        where: { lead_id: leadId },
        select: ['id'],
      });

      if (deals.length === 0) {
        return;
      }

      const dealIds = deals.map((deal) => deal.id);

      const quotes = await quoteRepository.find({
        where: { deal_id: In(dealIds) },
        select: ['id'],
      });
      const invoices = await invoiceRepository.find({
        where: { deal_id: In(dealIds) },
        select: ['id'],
      });

      if (quotes.length > 0) {
        const quoteIds = quotes.map((quote) => quote.id);
        await documentItemRepository.delete({
          document_type: 'Quote',
          document_id: In(quoteIds),
        });
        await appliedPaymentTermRepository.delete({
          document_type: 'quote',
          document_id: In(quoteIds),
        });
      }

      if (invoices.length > 0) {
        const invoiceIds = invoices.map((invoice) => invoice.id);
        await documentItemRepository.delete({
          document_type: 'Invoice',
          document_id: In(invoiceIds),
        });
        await appliedPaymentTermRepository.delete({
          document_type: 'invoice',
          document_id: In(invoiceIds),
        });
      }

      await documentItemRepository.delete({
        document_type: 'Deal',
        document_id: In(dealIds),
      });
      await invoiceRepository.delete({ deal_id: In(dealIds) });
      await quoteRepository.delete({ deal_id: In(dealIds) });
      await dealRepository.delete({ id: In(dealIds) });
    });
  }

  async updateStatus(
    id: string,
    status: string,
    userId: string,
    scopeUserId?: string,
  ): Promise<Lead> {
    if (scopeUserId) {
      const lead = await this.leadRepository.findOne({
        where: { id },
        select: ['id', 'assigned_to'],
      });
      if (!lead) throw new NotFoundException(`Lead with ID ${id} not found`);
      this.assertLeadInScope(lead, scopeUserId);
    }
    const updatedLead = await this.transitionStatus(
      this.leadRepository.manager,
      id,
      status,
      userId,
    );

    return this.findOne(updatedLead.id);
  }

  async updateStatusInTransaction(
    manager: EntityManager,
    id: string,
    status: string,
    userId: string,
  ): Promise<Lead> {
    return this.transitionStatus(manager, id, status, userId);
  }

  private async transitionStatus(
    manager: EntityManager,
    id: string,
    status: string,
    userId: string,
  ): Promise<Lead> {
    const lead = await manager.findOne(Lead, { where: { id } });
    if (!lead) {
      throw new NotFoundException(`Lead with ID ${id} not found`);
    }
    const oldStatus = lead.status;

    if (oldStatus === status) return lead;

    if (status === 'Qualified') {
      await this.assertMinimumViableDataForQualification(manager, id);
    }

    const now = new Date();

    // Close current SLA history record
    await manager
      .createQueryBuilder()
      .update(LeadSLAHistory)
      .set({ exited_status_at: now, sla_met: !lead.sla_breached })
      .where('lead_id = :leadId', { leadId: lead.id })
      .andWhere('status = :status', { status: oldStatus })
      .andWhere('exited_status_at IS NULL')
      .execute();

    // Look up SLA config for new status
    const slaConfig = await manager.findOne(LeadSLA, {
      where: { status: status as any, is_active: true },
    });

    lead.status = status as any;
    lead.sla_breached = false;
    lead.current_sla_due_date = slaConfig ? addBusinessHours(now, slaConfig.sla_hours) : null;

    if (status === 'Converted') {
      lead.converted_at = now;
    }

    const updatedLead = await manager.save(Lead, lead);

    // Create new SLA history record if config exists
    if (slaConfig) {
      await manager.save(
        LeadSLAHistory,
        manager.create(LeadSLAHistory, {
          lead_id: updatedLead.id,
          status: updatedLead.status,
          entered_status_at: now,
          sla_due_date: updatedLead.current_sla_due_date ?? undefined,
          sla_hours: slaConfig.sla_hours,
        }),
      );
    }

    await this.activityLogsService.logUpdate(
      'Lead',
      updatedLead.id,
      { status: oldStatus },
      { status: updatedLead.status },
      userId,
      `Changed lead status from ${oldStatus} to ${status}`,
    );

    // Trigger email sequences for this status change
    if (this.emailSequenceService) {
      this.emailSequenceService
        .triggerSequence(`lead_status_change_to_${status}`, updatedLead.id)
        .catch((err) =>
          this.logger.error(`Failed to trigger email sequence: ${err.message}`),
        );
    }

    return updatedLead;
  }

  private async assertMinimumViableDataForQualification(
    manager: EntityManager,
    leadId: string,
  ): Promise<void> {
    const lead = await manager.findOne(Lead, {
      where: { id: leadId },
      relations: [
        'school',
        'primary_contact',
        'stakeholders',
        'stakeholders.contact',
      ],
    });
    if (!lead) {
      throw new NotFoundException(`Lead with ID ${leadId} not found`);
    }

    const qualification = await manager.findOne(LeadQualificationCriteria, {
      where: { lead_id: leadId },
    });

    const contacts = [
      lead.primary_contact,
      ...(lead.stakeholders || []).map((s) => s.contact),
    ].filter((contact): contact is Contact => !!contact);

    const hasContactPerson = contacts.some(
      (contact) =>
        this.hasText(contact.first_name) || this.hasText(contact.last_name),
    );
    const hasContactChannel = contacts.some(
      (contact) =>
        this.hasText(contact.phone) ||
        this.hasText(contact.whatsapp_number) ||
        this.hasText(contact.email),
    );
    const hasDecisionMaker =
      (lead.stakeholders || []).some(
        (stakeholder) =>
          stakeholder.decision_role === DecisionRole.DECISION_MAKER,
      ) || this.hasText(qualification?.decision_maker_name);

    const hasNeed =
      this.hasText(qualification?.needs) ||
      !!qualification?.qualification_needs?.length;
    const hasBudgetOrPlan =
      !!qualification?.has_budget ||
      qualification?.budget_amount != null ||
      this.hasText(qualification?.budget_indicator) ||
      this.hasText(qualification?.plan_type);
    const hasProductsRequired = !!qualification?.qualification_needs?.length;
    const hasTimeline =
      !!qualification?.has_timeline ||
      this.hasText(qualification?.timeline_type) ||
      !!qualification?.specific_date;

    const openNextAction = await manager
      .getRepository(Activity)
      .createQueryBuilder('activity')
      .where('activity.lead_id = :leadId', { leadId })
      .andWhere('activity.type IN (:...types)', {
        types: [
          ActivityType.TASK,
          ActivityType.CALL,
          ActivityType.EMAIL,
          ActivityType.MEETING,
          ActivityType.WHATSAPP,
        ],
      })
      .andWhere("activity.status NOT IN ('completed','cancelled')")
      .andWhere('activity.completed_at IS NULL')
      .andWhere('activity.due_at IS NOT NULL')
      .andWhere('activity.due_at >= :now', { now: new Date() })
      .getCount();

    const missing: string[] = [];
    if (!this.hasText(lead.school?.name) && !this.hasText(lead.lead_name)) {
      missing.push('school name');
    }
    if (!hasContactPerson) missing.push('contact person');
    if (!hasContactChannel) missing.push('phone/WhatsApp/email');
    if (!hasDecisionMaker) missing.push('decision-maker status');
    if (!hasNeed) missing.push('interest/need');
    if (!hasBudgetOrPlan) missing.push('budget or payment plan');
    if (!hasProductsRequired) missing.push('boards/products required');
    if (!hasTimeline) missing.push('timeline');
    if (openNextAction === 0) missing.push('future next action');

    if (missing.length > 0) {
      throw new BadRequestException(
        `Cannot qualify lead until Minimum Viable Data is complete: ${missing.join(', ')}`,
      );
    }
  }

  private hasText(value: unknown): boolean {
    return typeof value === 'string' && value.trim().length > 0;
  }

  async findRelatedLeads(
    leadId: string,
    ability?: AppAbility,
  ): Promise<{
    leads: Lead[];
    matchReasons: Record<string, string[]>;
  }> {
    // Get the current lead with school and primary contact
    const currentLead = await this.leadRepository.findOne({
      where: { id: leadId },
      relations: ['school', 'primary_contact'],
    });

    if (!currentLead) {
      throw new NotFoundException(`Lead with ID ${leadId} not found`);
    }
    if (ability && !this.canReadLead(ability, currentLead)) {
      throw new ForbiddenException('You do not have permission to access this lead');
    }

    const schoolId = currentLead.school_id;
    const schoolName = currentLead.school?.name;
    const contactPhone = currentLead.primary_contact?.phone;
    const contactEmail = currentLead.primary_contact?.email;

    // If there's nothing to match on, return empty
    if (!schoolId && !schoolName && !contactPhone && !contactEmail) {
      return { leads: [], matchReasons: {} };
    }

    // Build query with OR conditions
    const qb = this.leadRepository
      .createQueryBuilder('lead')
      .leftJoinAndSelect('lead.school', 'school')
      .leftJoinAndSelect('lead.primary_contact', 'primary_contact')
      .leftJoinAndSelect('lead.assignee', 'assignee')
      .leftJoinAndSelect('lead.stage', 'stage')
      .where('lead.id != :currentLeadId', { currentLeadId: leadId })
      .andWhere('lead.deleted_at IS NULL');

    const orConditions: string[] = [];
    const params: Record<string, any> = {};

    if (schoolId) {
      orConditions.push('lead.school_id = :schoolId');
      params.schoolId = schoolId;
    }

    if (schoolName) {
      orConditions.push('school.name = :schoolName');
      params.schoolName = schoolName;
    }

    if (contactPhone) {
      orConditions.push('primary_contact.phone = :contactPhone');
      params.contactPhone = contactPhone;
    }

    if (contactEmail) {
      orConditions.push('primary_contact.email = :contactEmail');
      params.contactEmail = contactEmail;
    }

    if (orConditions.length === 0) {
      return { leads: [], matchReasons: {} };
    }

    qb.andWhere(`(${orConditions.join(' OR ')})`, params);
    if (ability) {
      this.abilityScopeService.applyScopeToQueryBuilder(qb, ability, {
        action: Action.READ,
        subject: 'Lead',
        queryAlias: 'lead',
        conditionKeyMap: LeadsService.LEAD_CONDITION_KEY_MAP,
      });
  }

    qb.orderBy('lead.created_at', 'DESC');

    const relatedLeads = await qb.getMany();

    // Build match reasons per lead
    const matchReasons: Record<string, string[]> = {};
    for (const lead of relatedLeads) {
      const reasons: string[] = [];

      if (schoolId && lead.school_id === schoolId) {
        reasons.push('same_school');
      }

      if (
        schoolName &&
        lead.school?.name === schoolName &&
        lead.school_id !== schoolId
      ) {
        reasons.push('school_name_match');
      }

      if (contactPhone && lead.primary_contact?.phone === contactPhone) {
        reasons.push('same_phone');
      }

      if (contactEmail && lead.primary_contact?.email === contactEmail) {
        reasons.push('same_email');
      }

      matchReasons[lead.id] = reasons;
    }

    return { leads: relatedLeads, matchReasons };
  }

  async assignLead(
    id: string,
    assignedTo: string,
    userId: string,
  ): Promise<Lead> {
    const lead = await this.findOne(id);
    const user = await this.usersRepository.findOne({where: { id: assignedTo, is_active: true }})

    if(!user) {
      throw new InternalServerErrorException('Could not resolve assignee')
    }

    const oldAssignee = lead.assigned_to;
    // Resolve the previous owner's name for the audit summary so the
    // log doesn't dump raw UUIDs at the manager.
    const oldUser = oldAssignee
      ? await this.usersRepository.findOne({
          where: { id: oldAssignee },
          select: ['id', 'first_name', 'last_name', 'email'],
        })
      : null;
    const fmt = (u: typeof user | null) =>
      !u
        ? 'Unassigned'
        : [u.first_name, u.last_name].filter(Boolean).join(' ').trim() ||
          u.email ||
          u.id;

    lead.assigned_to = assignedTo;
    lead.assignee = user;
    await this.leadRepository.save(lead);

    await this.activityLogsService.logUpdate(
      'Lead',
      lead.id,
      { assigned_to: oldAssignee },
      { assigned_to: assignedTo },
      userId,
      `Reassigned lead from ${fmt(oldUser)} to ${fmt(user)}`,
    );

    return this.findOne(id);
  }

  /**
   * DUP2 — TRUE field-level lead merge.
   *
   * Fuses `loserId` into `survivorId` in ONE transaction:
   *   1. FIELD FUSION — survivor keeps every non-empty field; any field
   *      that is empty/null on the survivor is filled from the loser
   *      (survivor-wins, loser fills gaps). Notes are concatenated with
   *      a merge audit line.
   *   2. REPARENT — every child record that carries `lead_id` is moved
   *      from the loser to the survivor (activities, deals — quotes and
   *      invoices follow via deal_id — cash requisitions, stakeholders
   *      [deduped by contact_id], SLA history, escalations, reversal
   *      requests, assignment proposals, queued emails).
   *   3. RETIRE — the loser is marked Disqualified (reason "Merged
   *      (field-level)") and never hard-deleted, so history survives.
   *   4. AUDIT — an activity-log entry records survivor id, loser id,
   *      the fields filled from the loser and the reparent counts.
   *   5. Any duplicate_suspicion row for the pair is marked 'merged'.
   *
   * Guards: survivor != loser; both must exist and be readable by the
   * actor; a loser that is already a merge target is a clear conflict
   * (no double-merge). The whole operation is atomic — any failure
   * rolls everything back, so there is never a partial merge.
   */
  async mergeLeads(
    survivorId: string,
    loserId: string,
    userId: string,
    ability?: AppAbility,
  ): Promise<{
    survivor: Lead;
    filledFields: string[];
    reparented: Record<string, number>;
  }> {
    if (survivorId === loserId) {
      throw new BadRequestException(
        'Survivor and loser must be two different leads.',
      );
    }

    // Existence + read-scope (throws 404/403). Also confirms the actor is
    // allowed to see BOTH records before anything is mutated.
    await this.findOne(survivorId, ability);
    await this.findOne(loserId, ability);

    const MERGE_REASON = 'Merged (field-level)';

    const isEmpty = (v: unknown): boolean =>
      v === null ||
      v === undefined ||
      (typeof v === 'string' && v.trim() === '');

    const result = await this.dataSource.transaction(async (manager) => {
      const leadRepo = manager.getRepository(Lead);

      const survivor = await leadRepo.findOne({ where: { id: survivorId } });
      const loser = await leadRepo.findOne({ where: { id: loserId } });
      if (!survivor) {
        throw new NotFoundException(`Lead with ID ${survivorId} not found`);
      }
      if (!loser) {
        throw new NotFoundException(`Lead with ID ${loserId} not found`);
      }

      // Idempotency guard: a lead already retired by a field-level merge
      // must never be merged again — re-running would double-append notes
      // and re-scan already-moved children. Fail loud with a clear error.
      if (loser.status === 'Disqualified' && loser.reason === MERGE_REASON) {
        throw new ConflictException(
          `Lead ${loserId} has already been merged into another record.`,
        );
      }

      // ---- 1. FIELD FUSION (survivor-wins, loser fills gaps) ----------
      const filledFields: string[] = [];

      const fillScalar = (field: keyof Lead): void => {
        if (isEmpty(survivor[field]) && !isEmpty(loser[field])) {
          (survivor as unknown as Record<string, unknown>)[field] =
            loser[field];
          filledFields.push(field as string);
        }
      };

      // Plain "empty means fill" scalars.
      fillScalar('school_id');
      fillScalar('primary_contact_id');
      fillScalar('source_campaign_id');
      fillScalar('assigned_to');
      fillScalar('stage_id');

      // estimated_value: treat null / 0 as a gap.
      if (
        (survivor.estimated_value == null ||
          Number(survivor.estimated_value) <= 0) &&
        loser.estimated_value != null &&
        Number(loser.estimated_value) > 0
      ) {
        survivor.estimated_value = loser.estimated_value;
        filledFields.push('estimated_value');
      }

      // source: 'Other' is the default placeholder — treat it as a gap so a
      // more specific loser source can fill it.
      if (
        (isEmpty(survivor.source) || survivor.source === 'Other') &&
        !isEmpty(loser.source) &&
        loser.source !== 'Other'
      ) {
        survivor.source = loser.source;
        filledFields.push('source');
      }

      // commercial_intent: once true it stays true; carry the loser's
      // supporting audit fields so the flag remains explainable.
      if (!survivor.commercial_intent && loser.commercial_intent) {
        survivor.commercial_intent = true;
        survivor.commercial_intent_at = loser.commercial_intent_at ?? new Date();
        survivor.commercial_intent_reason =
          loser.commercial_intent_reason ?? 'Carried over from merged duplicate';
        filledFields.push('commercial_intent');
      }

      // demo_status: fill only if the survivor has none.
      if (isEmpty(survivor.demo_status) && !isEmpty(loser.demo_status)) {
        survivor.demo_status = loser.demo_status;
        survivor.demo_status_changed_at =
          loser.demo_status_changed_at ?? new Date();
        filledFields.push('demo_status');
      }

      // notes: always concatenate both, then a merge audit line.
      const stamp = new Date().toISOString();
      const auditLine = `--- Merged (field-level): "${loser.lead_name}" (${loser.id}) fused into this record on ${stamp}. ---`;
      const loserNotes = loser.notes?.trim()
        ? `Notes carried over from "${loser.lead_name}":\n${loser.notes.trim()}`
        : null;
      survivor.notes =
        [survivor.notes?.trim() || null, loserNotes, auditLine]
          .filter(Boolean)
          .join('\n\n') || null;
      if (loserNotes) filledFields.push('notes');

      await leadRepo.save(survivor);

      // ---- 2. REPARENT child records loser -> survivor ---------------
      const reparented: Record<string, number> = {};

      const reparent = async (
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        entity: any,
        label: string,
      ): Promise<void> => {
        const res = await manager
          .getRepository(entity)
          .update({ lead_id: loserId }, { lead_id: survivorId });
        reparented[label] = res.affected ?? 0;
      };

      await reparent(Activity, 'activities');
      await reparent(Deal, 'deals'); // quotes/invoices follow via deal_id
      await reparent(CashRequisition, 'cash_requisitions');
      await reparent(LeadSLAHistory, 'lead_sla_history');
      await reparent(LeadEscalation, 'lead_escalations');
      await reparent(LeadReversalRequest, 'lead_reversal_requests');
      await reparent(LeadAssignmentProposal, 'lead_assignment_proposals');
      await reparent(EmailQueue, 'email_queue');

      // Stakeholders: unique(lead_id, contact_id) — dedupe by contact_id.
      const stakeRepo = manager.getRepository(LeadStakeholder);
      const survivorStakes = await stakeRepo.find({
        where: { lead_id: survivorId },
      });
      const survivorContactIds = new Set(
        survivorStakes.map((s) => s.contact_id),
      );
      const survivorHasPrimary = survivorStakes.some((s) => s.is_primary);
      const loserStakes = await stakeRepo.find({ where: { lead_id: loserId } });
      let movedStakes = 0;
      for (const s of loserStakes) {
        if (survivorContactIds.has(s.contact_id)) {
          // Same contact already a stakeholder on the survivor — drop the
          // loser's duplicate row rather than violate the unique key.
          await stakeRepo.delete({ id: s.id });
          continue;
        }
        s.lead_id = survivorId;
        // Never end up with two primaries on the survivor.
        if (survivorHasPrimary) s.is_primary = false;
        await stakeRepo.save(s);
        survivorContactIds.add(s.contact_id);
        movedStakes += 1;
      }
      reparented.lead_stakeholders = movedStakes;

      // ---- 5. Mark any duplicate_suspicion for this pair 'merged' ----
      const dupRepo = manager.getRepository(DuplicateSuspicion);
      const dupRes = await dupRepo
        .createQueryBuilder()
        .update()
        .set({
          status: 'merged',
          reviewed_by_id: userId,
          reviewed_at: new Date(),
          review_note: `Field-level merge: ${loserId} → ${survivorId}`,
        })
        .where('record_type = :rt', { rt: 'lead' })
        .andWhere('status = :st', { st: 'pending' })
        .andWhere(
          '(new_record_id = :lid OR existing_record_id = :lid OR new_record_id = :sid OR existing_record_id = :sid)',
          { lid: loserId, sid: survivorId },
        )
        .execute();
      reparented.duplicate_suspicions = dupRes.affected ?? 0;

      // ---- 3. RETIRE the loser (kept for history, never deleted) -----
      loser.status = 'Disqualified';
      loser.reason = MERGE_REASON;
      const loserRetireLine = `--- Retired ${stamp}: fields fused into "${survivor.lead_name}" (${survivor.id}). See survivor for the combined record. ---`;
      loser.notes =
        [loser.notes?.trim() || null, loserRetireLine].filter(Boolean).join('\n\n') ||
        null;
      loser.assigned_to = null;
      await leadRepo.save(loser);

      return { survivor, loser, filledFields, reparented };
    });

    // ---- 4. AUDIT TRAIL (outside the tx; the merge itself is done) ---
    await this.activityLogsService.logUpdate(
      'Lead',
      survivorId,
      { id: loserId, status: result.loser.status },
      {
        merged_from: loserId,
        filled_fields: result.filledFields,
        reparented: result.reparented,
      },
      userId,
      `Field-level merge: "${result.loser.lead_name}" (${loserId}) fused into "${result.survivor.lead_name}" (${survivorId})`,
      {
        survivor_id: survivorId,
        loser_id: loserId,
        filled_fields: result.filledFields,
        reparented: result.reparented,
      },
    );
    // Also stamp the retired loser's own trail so its history page shows why.
    await this.activityLogsService.logUpdate(
      'Lead',
      loserId,
      { status: 'active' },
      { status: 'Disqualified', reason: MERGE_REASON, merged_into: survivorId },
      userId,
      `Retired by field-level merge into "${result.survivor.lead_name}" (${survivorId})`,
      { survivor_id: survivorId, loser_id: loserId },
    );

    const survivor = await this.findOne(survivorId);
    return {
      survivor,
      filledFields: result.filledFields,
      reparented: result.reparented,
    };
  }

  /**
   * Ensure a qualification record exists for a lead.
   * If not, create one with all boolean fields set to false.
   */
  async ensureQualificationExists(
    leadId: string,
    manager?: EntityManager,
  ): Promise<LeadQualificationCriteria> {
    const repo = manager
      ? manager.getRepository(LeadQualificationCriteria)
      : this.qualificationRepository;

    const existing = await repo.findOne({
      where: { lead_id: leadId },
    });

    if (existing) {
      return existing;
    }

    const defaultChecklist: QualificationChecklist = {
      phone_verified: false,
      email_verified: false,
      province_verified: false,
    };

    const qualification = repo.create({
      lead_id: leadId,
      needs: null,
      has_needs: false,
      plan_type: null,
      has_plan_type: false,
      timeline_type: null,
      specific_date: null,
      has_timeline: false,
      budget_indicator: null,
      budget_amount: null,
      has_budget: false,
      has_verified_contact: false,
      decision_maker_name: null,
      decision_maker_title: null,
      has_influential_contact: false,
      checklist: defaultChecklist,
      qualification_score: 0,
      is_qualified: false,
    });

    return await repo.save(qualification);
  }

  private canReadLead(ability: AppAbility, lead: Lead): boolean {
    return this.abilityScopeService.canAccessRecord(
      ability,
      lead as unknown as Record<string, unknown>,
      {
        action: Action.READ,
        subject: 'Lead',
        conditionKeyMap: LeadsService.LEAD_CONDITION_KEY_MAP,
      },
    );
  }
}
