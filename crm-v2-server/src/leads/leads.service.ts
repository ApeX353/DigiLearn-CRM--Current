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
import type { AppAbility } from '../auth/casl/casl-ability.factory';
import { AbilityScopeService } from '../auth/casl/ability-scope.service';
import { Action } from '../auth/constants/permissions';
import { User } from '../users/entities/user.entity';
import { Deal } from '../deals/entities/deal.entity';
import { Quote } from '../quotes/entities/quote.entity';
import { Invoice } from '../invoices/entities/invoice.entity';
import { Activity, ActivityType } from '../activities/entities/activity.entity';
import { DocumentItem } from '../document-items/entities/document-item.entity';
import { AppliedPaymentTerm } from '../payment-terms/entities/applied-payment-term.entity';
import { EmailSequenceService } from '../email-sequences/email-sequence.service';
import { ComplianceSettingsService } from '../settings/compliance-settings.service';
import { isTacticalDisqualifyReason } from './constants/reasons';
import { LEAD_STATUSES } from './constants/lead-statuses';

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
  ): Promise<{
    lead: Lead;
    school: School;
    contacts: Contact[];
    stakeholders: LeadStakeholder[];
  }> {
    const { lead: leadInfo, contacts: contactsList } = input;
    const normalizeText = (value?: string | null): string =>
      value?.trim().toLowerCase().replace(/\s+/g, ' ') ?? '';
    const normalizePhone = (value?: string | null): string =>
      value ? value.replace(/\D/g, '') : '';
    const toNullableString = (value?: string | null): string | null => {
      const trimmed = value?.trim();
      return trimmed ? trimmed : null;
    };

    return await this.dataSource.transaction(async (manager) => {
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
        // Try reusing an existing school by normalized name + province + city.
        if (!leadInfo.school_name || !leadInfo.city || !leadInfo.province) {
          throw new BadRequestException(
            'School name, city, and province are required to resolve school',
          );
        }

        const existingSchoolByLocation = await manager
          .createQueryBuilder(School, 'school')
          .where('LOWER(TRIM(school.name)) = LOWER(TRIM(:schoolName))', {
            schoolName: leadInfo.school_name,
          })
          .andWhere('LOWER(TRIM(school.province::text)) = LOWER(TRIM(:province))', {
            province: leadInfo.province,
          })
          .andWhere('LOWER(TRIM(school.city)) = LOWER(TRIM(:city))', {
            city: leadInfo.city,
          })
          .andWhere('school.deleted_at IS NULL')
          .getOne();

        if (existingSchoolByLocation) {
          school = existingSchoolByLocation;
        } else {
          // Create new school only when no existing school matches.
          if (!leadInfo.region) {
            throw new BadRequestException(
              'School region is required for new school',
            );
          }

          school = await manager.save(School, {
            name: leadInfo.school_name,
            city: leadInfo.city,
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

      // ===== STEP 4: Create lead =====
      const newLead = manager.create(Lead, {
        lead_name: leadInfo.name,
        school_id: school.id,
        primary_contact_id: newPrimaryContact.id,
        source: leadInfo.source,
        status: 'New',
        assigned_to: userId,
        current_sla_due_date: addHours(new Date(), slaConfig.sla_hours),
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

  async addStakeholder(
    leadId: string,
    dto: CreateLeadStakeholderDto,
    userId: string,
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
  ): Promise<Lead> {
    const lead = await this.findOne(id);

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
      userRoles.includes('admin') || userRoles.includes('sales_manager');

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
  ): Promise<Lead> {
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
    lead.current_sla_due_date = slaConfig ? addHours(now, slaConfig.sla_hours) : null;

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
