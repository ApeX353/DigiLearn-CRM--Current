import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Optional,
  Inject,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Repository,
  DataSource,
  Between,
  In,
  LessThanOrEqual,
  MoreThanOrEqual,
  EntityManager,
  Brackets,
} from 'typeorm';
import { paginate, Pagination } from 'nestjs-typeorm-paginate';
import {
  Activity,
  ActivityType,
  ActivityStatus,
  ActivityOutcome,
} from './entities/activity.entity';
import { Task, TaskPriority, TaskStatus } from './entities/tasks.entity';
import { Note } from './entities/notes.entity';
import { Call } from './entities/calls.entity';
import { Email } from './entities/emails.entity';
import { Meeting, MeetingPlatform } from './entities/meetings.entity';
import {
  WhatsAppDirection,
  WhatsAppMessage,
  WhatsAppMessageType,
} from './entities/whats-app.entity';
import { Demo } from './entities/demos.entity';
import { ActivityAttachment } from './entities/activity-attachments.entity';
import { ActivityComment } from './entities/activity-comments.entity';
import { Lead } from '../leads/entities/lead.entity';
import { Deal } from '../deals/entities/deal.entity';
import { User } from '../users/entities/user.entity';
import { Contact } from '../contacts/entities/contact.entity';
import { CreateActivityDto } from './dto/create-activity.dto';
import { UpdateActivityDto } from './dto/update-activity.dto';
import { CreateActivityCommentDto } from './dto/create-activity-comment.dto';
import {
  QueryActivityDto,
  ActivitySummaryQueryDto,
  LeadActivityStatsResponseDto,
} from './dto/query-activity.dto';
import { CreateAttachmentDto } from './dto/create-attachment.dto';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import { NotificationsService } from '../notifications';
import { LeadTemperatureService } from '../leads/services/lead-temperature.service';
import { LeadsService } from '../leads/leads.service';
import { MeetingCancellationService } from '../calendar-sync/services/meeting-cancellation.service';
import { ComplianceSettingsService } from '../settings/compliance-settings.service';
import { UserEmailSenderService } from '../user-email/services/user-email-sender.service';

// Activity types that count as "contact" activities
// Activity types that count as outbound "contact" with the
// customer and therefore SHOULD bump `lead.last_contacted_at` when
// completed. Audit (Apr 2026) caught MEETING missing from this
// list — completing a customer meeting didn't move the contact
// timestamp, which broke stale-lead detection and
// "New Leads Touched Within SLA" on the dashboard for every deal
// closed via a meeting. Tasks deliberately stay out: a task can
// be internal (prep, paperwork) and using it as contact would
// let reps game the freshness metrics.
const CONTACT_ACTIVITY_TYPES: ActivityType[] = [
  ActivityType.CALL,
  ActivityType.EMAIL,
  ActivityType.WHATSAPP,
  ActivityType.MEETING,
  // A demo touchpoint is contact in every sense that matters to the
  // New → Contacted rule: the school heard from us.
  ActivityType.DEMO_BOOKING,
  ActivityType.DEMO_DELIVERY,
  ActivityType.DEMO_FOLLOWUP,
];

@Injectable()
export class ActivitiesService {
  constructor(
    @InjectRepository(Activity)
    private readonly activityRepository: Repository<Activity>,
    @InjectRepository(Task)
    private readonly taskRepository: Repository<Task>,
    @InjectRepository(Note)
    private readonly noteRepository: Repository<Note>,
    @InjectRepository(Call)
    private readonly callRepository: Repository<Call>,
    @InjectRepository(Email)
    private readonly emailRepository: Repository<Email>,
    @InjectRepository(Meeting)
    private readonly meetingRepository: Repository<Meeting>,
    @InjectRepository(WhatsAppMessage)
    private readonly whatsappRepository: Repository<WhatsAppMessage>,
    @InjectRepository(ActivityAttachment)
    private readonly attachmentRepository: Repository<ActivityAttachment>,
    @InjectRepository(ActivityComment)
    private readonly activityCommentRepository: Repository<ActivityComment>,
    private readonly dataSource: DataSource,
    private readonly activityLogsService: ActivityLogsService,
    private readonly notificationsService: NotificationsService,
    private readonly complianceSettings: ComplianceSettingsService,
    private readonly leadsService: LeadsService,
    @Optional()
    @Inject(UserEmailSenderService)
    private readonly userEmailSender?: UserEmailSenderService,
    @Optional()
    @Inject(LeadTemperatureService)
    private readonly leadTemperatureService?: LeadTemperatureService,
    // Optional so the activities module can still spin up in test
    // harnesses that don't wire the calendar-sync module (the subscriber
    // is opt-in per the Section 2 cancellation flow).
    @Optional()
    @Inject(MeetingCancellationService)
    private readonly meetingCancellation?: MeetingCancellationService,
  ) {}

  /**
   * Phase B — write-time activity discipline gate.
   *
   * A user marking an actionable activity (call/email/meeting/whatsapp/task)
   * completed must include a `next_step` follow-up payload unless the record
   * itself is being closed. An unrelated existing task does not describe the
   * future created by this completion, and elevated roles follow the same
   * discipline when doing sales work.
   *
   * Returns silently if the gate is satisfied; throws BadRequestException
   * with an actionable message otherwise.
   */
  private async assertNextStepCompliance(
    activity: Activity,
    nextStepProvided: boolean,
    userRoles: string[],
  ): Promise<void> {
    const ACTIONABLE: ActivityType[] = [
      ActivityType.TASK,
      ActivityType.CALL,
      ActivityType.EMAIL,
      ActivityType.MEETING,
      ActivityType.WHATSAPP,
    ];
    if (!ACTIONABLE.includes(activity.type)) return; // notes are exempt

    void userRoles;

    // No parent record means there's no place to schedule a next
    // step — the gate doesn't apply (e.g. an internal-only task with
    // no lead/deal). Bail out gracefully rather than building an
    // empty SQL Brackets clause that TypeORM rejects.
    if (!activity.lead_id && !activity.deal_id) return;
    if (
      activity.lead?.status === 'Disqualified' ||
      activity.lead?.status === 'Converted' ||
      activity.deal?.closeStatus === 'won' ||
      activity.deal?.closeStatus === 'lost'
    ) {
      return;
    }
    if (nextStepProvided) return;

    throw new BadRequestException(
      'Next-step compliance: every completed activity on an active lead or deal requires its own `next_step` follow-up payload.',
    );
  }

  // ============================================================
  // Demo + Commercial-Intent derivation
  // ============================================================
  //
  // The CRM separates "the rep ran a demo" from "this lead is ready
  // to become a deal". Demo activities (DEMO_BOOKING /
  // DEMO_DELIVERY / DEMO_FOLLOWUP) accumulate signals; this method
  // re-reads all demo activity rows for a lead and recomputes:
  //
  //   lead.demo_status               = 'demo_scheduled' | 'demo_completed' | null
  //   lead.demo_status_changed_at    = now if status changed
  //   lead.commercial_intent         = true once any documented signal lands
  //   lead.commercial_intent_at      = now when it first flips
  //   lead.commercial_intent_reason  = which signal triggered it (audit)
  //
  // It's deliberately idempotent — call it after any create/update
  // on a demo activity and it converges to the right state. Never
  // sets commercial_intent BACK to false (you can't un-prove
  // intent), but does keep demo_status accurate.
  //
  // Commercial-intent signals (per spec):
  //   • DEMO_DELIVERY outcome = QUOTE_REQUESTED
  //   • DEMO_FOLLOWUP outcome = QUOTE_REQUESTED |
  //     SDC_MEETING_REQUESTED | PAYMENT_PLAN_DISCUSSION_REQUESTED
  //   • Any DEMO_DELIVERY row with quantity_discussed filled in
  //   • Any DEMO_DELIVERY row with payment_plan_discussed = true
  //   • Any DEMO_DELIVERY row with sdc_discussion = true

  /** Public for use by the SLA cron + tests. */
  public async deriveDemoEffectsForLead(
    leadId: string,
    actorUserId?: string,
  ): Promise<void> {
    const lead = await this.dataSource
      .getRepository(Lead)
      .findOne({ where: { id: leadId } });
    if (!lead) return;

    // Pull every demo-typed activity on the lead with its sub-row.
    const demoActivities = await this.activityRepository.find({
      where: { lead_id: leadId },
      relations: ['demo'],
      order: { created_at: 'ASC' },
    });
    const demos = demoActivities.filter((a) =>
      [
        ActivityType.DEMO_BOOKING,
        ActivityType.DEMO_DELIVERY,
        ActivityType.DEMO_FOLLOWUP,
      ].includes(a.type),
    );
    if (demos.length === 0) return;

    // ---- demo_status -----------------------------------------
    // demo_completed wins over demo_scheduled. Any DEMO_DELIVERY
    // with status = COMPLETED puts the lead in demo_completed.
    // Else any DEMO_BOOKING with status SCHEDULED/IN_PROGRESS or
    // outcome DEMO_SCHEDULED puts it in demo_scheduled.
    const hasDelivered = demos.some(
      (a) =>
        a.type === ActivityType.DEMO_DELIVERY &&
        a.status === ActivityStatus.COMPLETED,
    );
    const hasScheduled = demos.some(
      (a) =>
        a.type === ActivityType.DEMO_BOOKING &&
        (a.status === ActivityStatus.SCHEDULED ||
          a.status === ActivityStatus.IN_PROGRESS ||
          a.completion_outcome === ActivityOutcome.DEMO_SCHEDULED),
    );
    const newDemoStatus: typeof lead.demo_status = hasDelivered
      ? 'demo_completed'
      : hasScheduled
        ? 'demo_scheduled'
        : null;

    // ---- commercial_intent -----------------------------------
    let intentReason: string | null = null;
    for (const a of demos) {
      const o = a.completion_outcome;
      const d = a.demo;
      if (
        a.type === ActivityType.DEMO_DELIVERY &&
        o === ActivityOutcome.QUOTE_REQUESTED
      ) {
        intentReason = 'demo_delivery_quote_requested';
        break;
      }
      if (
        a.type === ActivityType.DEMO_FOLLOWUP &&
        (o === ActivityOutcome.QUOTE_REQUESTED ||
          o === ActivityOutcome.SDC_MEETING_REQUESTED ||
          o === ActivityOutcome.PAYMENT_PLAN_DISCUSSION_REQUESTED)
      ) {
        intentReason = `followup_${o}`;
        break;
      }
      if (a.type === ActivityType.DEMO_DELIVERY && d) {
        if (d.quantity_discussed && d.quantity_discussed.trim() !== '') {
          intentReason = 'demo_delivery_quantity_discussed';
          break;
        }
        if (d.payment_plan_discussed === true) {
          intentReason = 'demo_delivery_payment_plan_discussed';
          break;
        }
        if (d.sdc_discussion === true) {
          intentReason = 'demo_delivery_sdc_discussion';
          break;
        }
      }
    }

    // ---- Persist (only if something changed) -----------------
    const updates: Partial<Lead> = {};
    if (lead.demo_status !== newDemoStatus) {
      updates.demo_status = newDemoStatus;
      updates.demo_status_changed_at = new Date();
    }
    if (intentReason && !lead.commercial_intent) {
      updates.commercial_intent = true;
      updates.commercial_intent_at = new Date();
      updates.commercial_intent_reason = intentReason;
    }
    if (Object.keys(updates).length === 0) return;

    await this.dataSource.getRepository(Lead).update(lead.id, updates);

    // Manager-friendly audit trail: log a clear summary so the lead
    // history shows WHY commercial intent triggered, not just that a
    // boolean flipped.
    const summaryBits: string[] = [];
    if (updates.demo_status) {
      summaryBits.push(
        updates.demo_status === 'demo_scheduled'
          ? 'Demo Scheduled'
          : 'Demo Completed',
      );
    }
    if (updates.commercial_intent) {
      summaryBits.push(`Commercial Intent — ${intentReason}`);
    }
    if (summaryBits.length > 0) {
      await this.activityLogsService.logUpdate(
        'Lead',
        leadId,
        {
          demo_status: lead.demo_status,
          commercial_intent: lead.commercial_intent,
        },
        {
          demo_status: updates.demo_status ?? lead.demo_status,
          commercial_intent:
            updates.commercial_intent ?? lead.commercial_intent,
        },
        actorUserId ??
          lead.assigned_to ??
          '00000000-0000-0000-0000-000000000000',
        `Lead updated: ${summaryBits.join(' · ')}`,
      );
    }
  }

  // ========================
  // Create Activity
  // ========================

  /**
   * ACT2 — write-time "every open activity has a when" gate.
   *
   * Reported by the owner: WhatsApps, emails and calls were being
   * saved with no follow-up or due date. On production 89% of all
   * activities carried neither `due_at` nor `scheduled_at`, which
   * makes them invisible to every date-driven view.
   *
   * The rule is deliberately narrower than "all activities must have
   * a date". A COMPLETED activity is work that already happened — a
   * call that ended — and needs a next step, not a due date; that is
   * the next-step rule's job. What must carry a date is an activity
   * left OPEN, because that is a commitment with no "when".
   *
   * Gated by `compliance.policy.require_activity_due_date` so an
   * admin can switch it back off in Settings → Compliance without a
   * deploy if it proves too strict in the field.
   */
  private async assertOpenActivityHasDate(
    type: ActivityType | undefined,
    status: ActivityStatus | undefined,
    dueAt?: string | Date | null,
    scheduledAt?: string | Date | null,
  ): Promise<void> {
    const ACTIONABLE: ActivityType[] = [
      ActivityType.TASK,
      ActivityType.CALL,
      ActivityType.EMAIL,
      ActivityType.MEETING,
      ActivityType.WHATSAPP,
    ];
    if (!type || !ACTIONABLE.includes(type)) return; // notes exempt
    // Work that is already done (or abandoned) needs no due date.
    if (
      status === ActivityStatus.COMPLETED ||
      status === ActivityStatus.CANCELLED
    ) {
      return;
    }
    const plannedFor = dueAt ?? scheduledAt;
    if (plannedFor) {
      if (new Date(plannedFor).getTime() <= Date.now()) {
        throw new BadRequestException(
          'Planned activities must be scheduled for a future date and time',
        );
      }
      return;
    }

    const enforce = await this.complianceSettings.getBoolean(
      'require_activity_due_date',
    );
    if (!enforce) return;

    throw new BadRequestException(
      'This activity is being left open, so it needs a date. Add a due date for when the follow-up should happen — or mark it completed if it has already been done.',
    );
  }

  /**
   * C-02 (write paths): a sales_rep may only attach an activity to a
   * lead or deal that is currently assigned to them. Elevated roles
   * (scopeUserId undefined) bypass. A foreign / unknown parent reads as
   * 404 so ids can't be probed — mirrors the read-scope in findOne and
   * the finance `assertDealAttachable` pattern.
   */
  private async assertParentInScope(
    manager: EntityManager,
    leadId: string | null | undefined,
    dealId: string | null | undefined,
    scopeUserId?: string,
  ): Promise<void> {
    if (!scopeUserId) return;
    if (leadId) {
      const lead = await manager
        .getRepository(Lead)
        .findOne({ where: { id: leadId } });
      if (!lead || lead.assigned_to !== scopeUserId) {
        throw new NotFoundException(`Lead ${leadId} not found`);
      }
    }
    if (dealId) {
      const deal = await manager
        .getRepository(Deal)
        .findOne({ where: { id: dealId } });
      if (!deal || deal.assigned_to !== scopeUserId) {
        throw new NotFoundException(`Deal ${dealId} not found`);
      }
    }
  }

  /**
   * C-02 (bulk): confirm every id in a bulk operation is in the rep's
   * scope (own work, or on a lead/deal assigned to them) BEFORE any row
   * is mutated. Runs one query and never attaches relations to the
   * entities the caller saves, so it can't trigger cascade writes. Any
   * id outside scope reads as 404, same as the single path.
   */
  private async assertActivitiesInScope(
    manager: EntityManager,
    ids: string[],
    scopeUserId: string,
  ): Promise<void> {
    const rows = await manager
      .getRepository(Activity)
      .createQueryBuilder('a')
      .leftJoin('a.lead', 'lead')
      .leftJoin('a.deal', 'deal')
      .select('a.id', 'id')
      .where('a.id IN (:...ids)', { ids })
      .andWhere(
        new Brackets((qb) => {
          qb.where('a.created_by_id = :uid', { uid: scopeUserId })
            .orWhere('a.assigned_to_id = :uid', { uid: scopeUserId })
            .orWhere('lead.assigned_to = :uid', { uid: scopeUserId })
            .orWhere('deal.assigned_to = :uid', { uid: scopeUserId });
        }),
      )
      .getRawMany<{ id: string }>();
    const allowed = new Set(rows.map((r) => r.id));
    const foreign = ids.filter((id) => !allowed.has(id));
    if (foreign.length) {
      throw new NotFoundException(
        `Activities not found: ${foreign.join(', ')}`,
      );
    }
  }

  async create(
    dto: CreateActivityDto,
    userId: string,
    scopeUserId?: string,
  ): Promise<Activity> {
    await this.assertOpenActivityHasDate(
      dto.type,
      dto.status,
      dto.due_at,
      dto.scheduled_at,
    );
    return this.dataSource.transaction(async (manager) => {
      // C-02: a rep cannot file an activity onto someone else's record.
      await this.assertParentInScope(
        manager,
        dto.lead_id,
        dto.deal_id,
        scopeUserId,
      );
      const {
        task,
        note,
        call,
        email,
        meeting,
        whatsapp,
        demo,
        completion_outcome,
        completion_note,
        ...activityData
      } = dto;

      // Creating an activity is not a reassignment operation. Keep work with
      // the lead/deal owner; only an unowned record falls back to its creator.
      const [parentLead, parentDeal] = await Promise.all([
        dto.lead_id
          ? manager.findOne(Lead, { where: { id: dto.lead_id } })
          : null,
        dto.deal_id
          ? manager.findOne(Deal, { where: { id: dto.deal_id } })
          : null,
      ]);
      const automaticAssigneeId =
        parentDeal?.assigned_to ?? parentLead?.assigned_to ?? userId;

      const activity = manager.create(Activity, {
        ...activityData,
        assigned_to_id: automaticAssigneeId,
        // A "log a past interaction" create may carry the outcome and the
        // account of what happened. A scheduled create cannot have an
        // outcome yet, so both are stripped (not errored) unless the
        // create arrives completed.
        ...(dto.status === ActivityStatus.COMPLETED
          ? {
              completion_outcome: completion_outcome ?? null,
              completion_note: completion_note ?? null,
            }
          : {}),
        created_by_id: userId,
        scheduled_at: dto.scheduled_at ? new Date(dto.scheduled_at) : undefined,
        due_at: dto.due_at ? new Date(dto.due_at) : undefined,
        // "Log a past interaction" creates arrive already completed
        // (e.g. a call that just ended). Stamp completed_at so feeds
        // and discipline metrics that sort/filter on it see the entry.
        // ACT4: if the logged interaction carries a past date, the
        // completion keeps that date rather than the moment of typing.
        completed_at:
          dto.status === ActivityStatus.COMPLETED
            ? this.completionMoment({
                due_at: dto.due_at ? new Date(dto.due_at) : undefined,
                scheduled_at: dto.scheduled_at
                  ? new Date(dto.scheduled_at)
                  : undefined,
              } as Activity)
            : undefined,
      });

      const savedActivity = await manager.save(Activity, activity);

      // Create type-specific record
      switch (dto.type) {
        case ActivityType.TASK:
          if (task) {
            const taskEntity = manager.create(Task, {
              ...task,
              activity_id: savedActivity.id,
            });
            await manager.save(Task, taskEntity);
          }
          break;

        case ActivityType.NOTE:
          if (note) {
            // Spec Section 3: notes are strictly internal. We strip any
            // visibility hint the client might have sent and hard-code
            // `is_internal = true` so nothing leaks into customer docs.
            const { visibility: _discardedVisibility, ...noteRest } = note;
            void _discardedVisibility;
            const noteEntity = manager.create(Note, {
              ...noteRest,
              activity_id: savedActivity.id,
              is_internal: true,
            });
            await manager.save(Note, noteEntity);
          }
          break;

        case ActivityType.CALL:
          if (call) {
            const callEntity = manager.create(Call, {
              ...call,
              activity_id: savedActivity.id,
              follow_up_date: call.follow_up_date
                ? new Date(call.follow_up_date)
                : undefined,
            });
            await manager.save(Call, callEntity);
            if (call.follow_up_date) {
              const followUpActivity = manager.create(Activity, {
                type: ActivityType.TASK,
                subject: `Follow-up: ${savedActivity.subject}`,
                lead_id: savedActivity.lead_id,
                deal_id: savedActivity.deal_id,
                contact_id: savedActivity.contact_id,
                created_by_id: userId,
                assigned_to_id: savedActivity.assigned_to_id,
                due_at: new Date(call.follow_up_date),
              });
              const savedFollowUp = await manager.save(
                Activity,
                followUpActivity,
              );

              const taskEntity = manager.create(Task, {
                priority: TaskPriority.HIGH,
                status: TaskStatus.TODO,
                activity_id: savedFollowUp.id,
              });
              await manager.save(Task, taskEntity);
            }
          }
          break;

        case ActivityType.EMAIL:
          if (email) {
            const creator = await manager.findOne(User, {
              where: { id: userId },
            });
            if (!creator) {
              throw new NotFoundException(`User ${userId} not found`);
            }

            const emailEntity = manager.create(Email, {
              ...email,
              from_email: email.from_email || creator.email,
              activity_id: savedActivity.id,
            });
            const savedEmail = await manager.save(Email, emailEntity);
            // A future email next step is a commitment, not an instruction to
            // send immediately. Logged/sent email activities arrive completed;
            // scheduled email activities retain their subtype without dispatch.
            if (savedActivity.status === ActivityStatus.COMPLETED) {
              await this.sendActivityEmail(manager, savedEmail, userId);
            }
          }
          break;

        case ActivityType.MEETING:
          if (meeting) {
            // Duration default: 30 minutes after start. Applied when
            // the caller (e.g. follow-up-prompt dialog) only supplies
            // start_time. Prevents the `new Date(undefined)` →
            // Invalid Date path that was 400-ing the whole request.
            const startDate = new Date(meeting.start_time);
            const endDate = meeting.end_time
              ? new Date(meeting.end_time)
              : new Date(startDate.getTime() + 30 * 60 * 1000);
            const meetingEntity = manager.create(Meeting, {
              ...meeting,
              activity_id: savedActivity.id,
              start_time: startDate,
              end_time: endDate,
            });
            await manager.save(Meeting, meetingEntity);
            // DURATION1: derive the activity's duration from the meeting
            // window — the source of truth for a meeting — so the Duration
            // field shows a real figure instead of a permanent "--".
            const meetingMins = Math.max(
              1,
              Math.round((endDate.getTime() - startDate.getTime()) / 60000),
            );
            savedActivity.duration = meetingMins;
            await manager.save(Activity, savedActivity);
          }
          break;

        case ActivityType.WHATSAPP:
          if (whatsapp) {
            const whatsappEntity = manager.create(WhatsAppMessage, {
              ...whatsapp,
              activity_id: savedActivity.id,
              follow_up_date: whatsapp.follow_up_date
                ? new Date(whatsapp.follow_up_date)
                : undefined,
            });
            await manager.save(WhatsAppMessage, whatsappEntity);

            if (whatsapp.follow_up_date) {
              const followUpActivity = manager.create(Activity, {
                type: ActivityType.TASK,
                subject: `Follow-up: ${savedActivity.subject}`,
                lead_id: savedActivity.lead_id,
                deal_id: savedActivity.deal_id,
                contact_id: savedActivity.contact_id,
                created_by_id: userId,
                assigned_to_id: savedActivity.assigned_to_id,
                due_at: new Date(whatsapp.follow_up_date),
              });
              const savedFollowUp = await manager.save(
                Activity,
                followUpActivity,
              );

              const taskEntity = manager.create(Task, {
                priority: TaskPriority.HIGH,
                status: TaskStatus.TODO,
                activity_id: savedFollowUp.id,
              });
              await manager.save(Task, taskEntity);
            }
          }
          break;

        // ----- Demo lifecycle -------------------------------------
        // The same handler covers all three demo activity types.
        // Required-field rules are activity-type-specific:
        //   DEMO_BOOKING  → planned_at is required
        //   DEMO_DELIVERY → no planned_at requirement; rep records
        //                   actual_at + outcome on completion
        //   DEMO_FOLLOWUP → followup_channel + next_activity_date
        //                   (unless outcome = NOT_INTERESTED, which is
        //                   enforced by the completion gate, not here)
        case ActivityType.DEMO_BOOKING:
        case ActivityType.DEMO_DELIVERY:
        case ActivityType.DEMO_FOLLOWUP: {
          if (dto.type === ActivityType.DEMO_BOOKING && !demo?.planned_at) {
            throw new BadRequestException(
              'Demo Booking requires a planned date/time',
            );
          }
          const demoEntity = manager.create(Demo, {
            ...(demo ?? {}),
            activity_id: savedActivity.id,
            planned_at: demo?.planned_at ? new Date(demo.planned_at) : null,
            actual_at: demo?.actual_at ? new Date(demo.actual_at) : null,
            next_activity_date: demo?.next_activity_date
              ? new Date(demo.next_activity_date)
              : null,
          });
          await manager.save(Demo, demoEntity);
          // Schedule a derivation pass after the transaction commits.
          // We can't run it inside this txn because it needs to read
          // the just-saved row through a Repository (different
          // connection), so we mark the parent activity for post-
          // commit derivation by storing the lead id locally and
          // running the pass after the transaction returns below.
          (savedActivity as any).__deriveDemoForLeadId = savedActivity.lead_id;
          break;
        }
      }

      // PRODUCT RULE: Dual-clock. The rep's chosen follow-up due date
      // (Clock 1 — execution commitment) and the lead's SLA / stage
      // aging timer (Clock 2 — management control) are independent.
      //
      // Previously this block pushed the SLA deadline out to match the
      // rep's follow-up date AND cleared `sla_breached`, which let a
      // rep silence SLA discipline by scheduling a far-future task.
      // That's a loophole. A follow-up is a rep commitment; the SLA
      // is a company control; they never override each other.
      //
      // SLA now only moves via the dedicated SLA service (stage
      // transitions, config changes, manual admin actions). Activity
      // creation logs a commitment but does not touch the SLA clock.

      // Update lead contact status if this is a contact activity.
      // Activities that are CREATED already in the 'completed'
      // state (e.g. "log a past call I already made") propagate as
      // `complete` so `last_contacted_at` actually moves. Normal
      // scheduled-for-the-future creates propagate as `create` and
      // only touch `last_action_at` + the New→Contacted flip.
      const createMode: 'create' | 'complete' =
        savedActivity.status === ActivityStatus.COMPLETED
          ? 'complete'
          : 'create';
      await this.updateLeadContactStatus(manager, savedActivity, createMode);

      await this.activityLogsService.logCreate(
        'Activity',
        savedActivity.id,
        { type: dto.type, subject: dto.subject },
        userId,
        `Created ${dto.type} activity: ${dto.subject}`,
      );

      // Recalculate lead temperature after activity creation
      if (savedActivity.lead_id && this.leadTemperatureService) {
        this.leadTemperatureService
          .recalculate(savedActivity.lead_id)
          .catch(() => {});
      }

      // Demo + Commercial-Intent derivation. Only fires when the
      // activity is a demo type AND the lead is known. Idempotent —
      // safe to call on every demo create. We launch outside the
      // current transaction so subsequent calls see the just-saved
      // demo subrow through a fresh repository read.
      const deriveLeadId =
        savedActivity.lead_id &&
        (savedActivity.type === ActivityType.DEMO_BOOKING ||
          savedActivity.type === ActivityType.DEMO_DELIVERY ||
          savedActivity.type === ActivityType.DEMO_FOLLOWUP)
          ? savedActivity.lead_id
          : null;
      if (deriveLeadId) {
        // Don't await — this is a side-effect and a slow lead lookup
        // shouldn't block the activity-create response. Errors are
        // swallowed because they're non-fatal to the create flow but
        // still visible in the audit log via console.warn.
        this.deriveDemoEffectsForLead(deriveLeadId, userId).catch((err) => {
          console.warn(
            `[ActivitiesService.create] demo derivation failed for lead ${deriveLeadId}: ${err?.message}`,
          );
        });
      }

      return activity;
    });
  }

  // ========================
  // Find All with Pagination
  // ========================

  async findAll(
    query: QueryActivityDto,
    scopeUserId?: string,
  ): Promise<Pagination<Activity>> {
    const {
      page = '1',
      limit = '10',
      type,
      status,
      lead_id,
      deal_id,
      contact_id,
      school_id,
      created_by_id,
      assigned_to_id,
      start_date,
      end_date,
      due_from,
      due_to,
      created_from,
      created_to,
      open_only,
      is_pinned,
      include_details,
      search,
      sort,
    } = query;

    const qb = this.activityRepository
      .createQueryBuilder('activity')
      .leftJoinAndSelect('activity.created_by', 'created_by')
      .leftJoinAndSelect('activity.assigned_to', 'assigned_to')
      .leftJoinAndSelect('activity.lead', 'lead')
      .leftJoinAndSelect('lead.primary_contact', 'lead_primary_contact')
      .leftJoinAndSelect('activity.deal', 'deal')
      .leftJoinAndSelect('deal.lead', 'deal_lead')
      .leftJoinAndSelect(
        'deal_lead.primary_contact',
        'deal_lead_primary_contact',
      )
      .leftJoinAndSelect('activity.contact', 'contact')
      .leftJoinAndSelect('lead.school', 'school');

    if (include_details) {
      qb.leftJoinAndSelect('activity.task', 'task')
        .leftJoinAndSelect('activity.note', 'note')
        .leftJoinAndSelect('activity.call', 'call')
        .leftJoinAndSelect('activity.email', 'email')
        .leftJoinAndSelect('activity.meeting', 'meeting')
        .leftJoinAndSelect('activity.whatsapp_message', 'whatsapp_message');
    }

    // R15 (owner ruling 2026-07-27): a rep sees a record's activity only
    // once that record is theirs. Record timelines used to stay wide open
    // "for collaboration", which meant every rep could read every lead's
    // history; the owner ruled that visibility follows the assignment.
    //
    // Because the test is on the lead's CURRENT owner, reassigning a lead
    // hands the new rep its full history — including the previous rep's
    // calls and notes — which is the continuity the ruling asks for, and
    // it disappears from the previous rep's view at the same moment.
    //
    // Their own work stays visible either way, so an activity they logged
    // before a lead moved on does not vanish from their record.
    //
    // Bracketed deliberately: a bare .orWhere() here would detach every
    // filter added below it — the exact defect fixed as C2.
    if (scopeUserId) {
      qb.andWhere(
        new Brackets((w) => {
          w.where('activity.created_by_id = :scopeUserId', { scopeUserId })
            .orWhere('activity.assigned_to_id = :scopeUserId', { scopeUserId })
            .orWhere('lead.assigned_to = :scopeUserId', { scopeUserId })
            .orWhere('deal.assigned_to = :scopeUserId', { scopeUserId });
        }),
      );
    }

    if (type) {
      qb.andWhere('activity.type = :type', { type });
    }

    if (status) {
      qb.andWhere('activity.status = :status', { status });
    }

    // A deal that came from a lead queries with BOTH ids — its feed is
    // "everything on the deal plus the lead's history". The OR must be
    // bracketed: a bare .orWhere() at the top level detaches every
    // filter added after it (status, open_only, dates), which is what
    // corrupted the Done/Planned tabs on lead-originated deals.
    if (lead_id && deal_id) {
      qb.andWhere(
        new Brackets((w) => {
          w.where('activity.deal_id = :deal_id', { deal_id }).orWhere(
            'activity.lead_id = :lead_id',
            { lead_id },
          );
        }),
      );
    } else if (lead_id) {
      qb.andWhere('activity.lead_id = :lead_id', { lead_id });
    } else if (deal_id) {
      qb.andWhere('activity.deal_id = :deal_id', { deal_id });
    }

    if (contact_id) {
      qb.andWhere('activity.contact_id = :contact_id', { contact_id });
    }

    // school_id is an indirect filter — Activities live on leads, but
    // a rep on a school detail page wants every interaction tied to
    // any of that school's leads. We already left-join `lead` above,
    // so adding this predicate keeps the plan to one SQL execution.
    if (school_id) {
      qb.andWhere('lead.school_id = :school_id', { school_id });
    }

    // API1: honour each owner filter literally and independently. The
    // previous heuristic collapsed both params into one userId and routed
    // TASKS to assigned_to_id — so `?created_by_id=<rep>` silently dropped
    // the rep's own unassigned "next step" tasks (assigned_to_id IS NULL),
    // hiding exactly the follow-up evidence reps had logged.
    if (created_by_id) {
      qb.andWhere('activity.created_by_id = :created_by_id', {
        created_by_id,
      });
    }
    if (assigned_to_id) {
      qb.andWhere('activity.assigned_to_id = :assigned_to_id', {
        assigned_to_id,
      });
    }

    if (start_date) {
      qb.andWhere('activity.created_at >= :start_date', { start_date });
    }

    if (end_date) {
      qb.andWhere('activity.created_at <= :end_date', { end_date });
    }

    // Date-context filters used by the Activities page tabs (Today /
    // Overdue / This week, etc). The COALESCE chain used to stop at
    // `due_at, scheduled_at` — which meant NOTES (which have neither
    // field) always resolved to NULL and were silently excluded from
    // every date-windowed tab. Falling through to `created_at` treats
    // a timeless note as "dated the day it was logged", so a note
    // logged today shows under the Today tab exactly as the user
    // expects. Dated activities (task / call / meeting) still resolve
    // via due_at → scheduled_at first, so their filtering is unchanged.
    if (due_from) {
      qb.andWhere(
        'COALESCE(activity.due_at, activity.scheduled_at, activity.created_at) >= :due_from',
        { due_from },
      );
    }

    if (due_to) {
      qb.andWhere(
        'COALESCE(activity.due_at, activity.scheduled_at, activity.created_at) <= :due_to',
        { due_to },
      );
    }

    // "Logged today" — filters on when the activity was RECORDED, not
    // when it falls due. A manager asking "what did the team do today"
    // wants this; "Due today" answers the different question "what is
    // on my list for today". Both tabs now exist so neither has to be
    // approximated by scrolling the All list.
    if (created_from) {
      qb.andWhere('activity.created_at >= :created_from', { created_from });
    }

    if (created_to) {
      qb.andWhere('activity.created_at <= :created_to', { created_to });
    }

    // open_only is the cheap "hide done & cancelled" toggle most date
    // tabs want. We keep it independent of the explicit `status` filter
    // so callers can still ask for a specific status when they need it.
    // Defence in depth: we ALSO require `completed_at IS NULL`. A
    // status/completed_at drift in the DB (e.g. an older row where
    // `completed_at` was set without flipping status) would otherwise
    // leak into every "next step" surface and render as "Completed · …"
    // on pipeline cards and planned lists.
    if (open_only) {
      qb.andWhere('activity.status NOT IN (:...closedStatuses)', {
        closedStatuses: ['completed', 'cancelled'],
      });
      qb.andWhere('activity.completed_at IS NULL');
    }

    if (is_pinned !== undefined) {
      qb.andWhere('activity.is_pinned = :is_pinned', { is_pinned });
    }

    // Whole-table search. The client's search box sends this; matching only
    // the loaded page in the browser missed everything past page one. The
    // subtype content lives in the detail tables, so when the caller didn't
    // ask for details we still JOIN (without selecting) purely to search.
    if (search?.trim()) {
      if (!include_details) {
        qb.leftJoin('activity.task', 'task')
          .leftJoin('activity.note', 'note')
          .leftJoin('activity.call', 'call')
          .leftJoin('activity.email', 'email')
          .leftJoin('activity.meeting', 'meeting')
          .leftJoin('activity.whatsapp_message', 'whatsapp_message');
      }
      qb.andWhere(
        new Brackets((w) => {
          w.where('activity.subject ILIKE :search', {
            search: `%${search.trim()}%`,
          })
            .orWhere('activity.description ILIKE :search')
            .orWhere('activity.completion_note ILIKE :search')
            .orWhere('note.content ILIKE :search')
            .orWhere('call.summary ILIKE :search')
            .orWhere('email.subject ILIKE :search')
            .orWhere('email.body ILIKE :search')
            .orWhere('meeting.agenda ILIKE :search')
            .orWhere('meeting.minutes_notes ILIKE :search')
            .orWhere('whatsapp_message.message ILIKE :search');
        }),
      );
    }

    if (sort === 'work_queue') {
      // Work-queue ordering — the Activities module is a to-do list, not a
      // diary: open work above closed, the most-overdue open item first,
      // undated open items after every dated one, closed history newest
      // first underneath. (`recent` — the default — is the diary ordering
      // below, unchanged.)
      qb.orderBy(
        `CASE WHEN activity.status IN ('completed','cancelled') THEN 1 ELSE 0 END`,
        'ASC',
      );
      qb.addOrderBy(
        `CASE WHEN activity.status IN ('completed','cancelled') THEN NULL ELSE COALESCE(activity.due_at, activity.scheduled_at) END`,
        'ASC',
        'NULLS LAST',
      );
      if (include_details) {
        // Same-dated open tasks tie-break by urgency (see ACT1 note below).
        qb.addOrderBy(
          `CASE
            WHEN activity.type = 'task' THEN
              CASE task.priority
                WHEN '${TaskPriority.URGENT}' THEN 1
                WHEN '${TaskPriority.HIGH}'   THEN 2
                WHEN '${TaskPriority.MEDIUM}' THEN 3
                WHEN '${TaskPriority.LOW}'    THEN 4
                ELSE 5
              END
            ELSE 5
          END`,
        );
      }
      qb.addOrderBy(
        'COALESCE(activity.due_at, activity.scheduled_at, activity.created_at)',
        'DESC',
      );
    } else if (include_details) {
      // ACT1 — the Activities page ("All" tab) reads this list.
      //
      // The previous clause ordered by
      //   CASE WHEN type='task' THEN due_at ELSE NULL END  DESC
      // which had three faults. Postgres DESC defaults to NULLS
      // FIRST, so every non-task and every undated task sorted to the
      // FRONT and the tasks that actually carried a due date were
      // pushed to the BACK — on production that put today's work on
      // page 110 of 112. Non-tasks were forced to NULL so they never
      // sorted by their own date at all, and within the dated group
      // DESC surfaced the furthest-future task ahead of today's.
      //
      // Order by the activity's EFFECTIVE date instead, newest first,
      // falling back to created_at so an activity with no date still
      // sorts by when it was logged. That lands both senses of
      // "today's activities" — due today, and logged today — on page
      // one, which is what the page is asked for.
      qb.orderBy(
        'COALESCE(activity.due_at, activity.scheduled_at, activity.created_at)',
        'DESC',
      );
      // Tie-break same-dated rows by task urgency. Postgres has no
      // FIELD(); emulate it with a nested CASE so task rows sort
      // URGENT → HIGH → MEDIUM → LOW and non-tasks fall to the end.
      qb.addOrderBy(
        `CASE
          WHEN activity.type = 'task' THEN
            CASE task.priority
              WHEN '${TaskPriority.URGENT}' THEN 1
              WHEN '${TaskPriority.HIGH}'   THEN 2
              WHEN '${TaskPriority.MEDIUM}' THEN 3
              WHEN '${TaskPriority.LOW}'    THEN 4
              ELSE 5
            END
          ELSE 5
        END`,
      );
    }
    qb.addOrderBy('activity.created_at', 'DESC');
    // API2: unique tiebreaker so tied rows don't reorder between pages
    // (offset pagination silently drops/duplicates rows without it).
    qb.addOrderBy('activity.id', 'DESC');

    return paginate<Activity>(qb, {
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
    });
  }

  // ========================
  // Find One
  // ========================

  /**
   * R14: a single activity was readable by ANY signed-in user, with the
   * call/email/note bodies attached — the R6 fix scoped the list but not
   * this door.
   *
   * `scopeUserId` is set for sales_rep only and mirrors the list policy
   * exactly (findAll, above): their own work, plus anything on a lead or
   * deal currently assigned to them (R15 ruling). Misses read as 404, so
   * ids cannot be probed — same treatment as R4 on payments.
   */
  async findOne(id: string, scopeUserId?: string): Promise<Activity> {
    const activity = await this.activityRepository.findOne({
      where: { id },
      relations: [
        'created_by',
        'assigned_to',
        'lead',
        'lead.primary_contact',
        'deal',
        'deal.lead',
        'deal.lead.primary_contact',
        'contact',
        'task',
        'note',
        'call',
        'email',
        'meeting',
        'whatsapp_message',
        'demo',
        'attachments',
        'comments',
        'comments.commented_by',
      ],
    });

    if (!activity) {
      throw new NotFoundException(`Activity ${id} not found`);
    }

    if (scopeUserId) {
      const isOwn =
        activity.created_by_id === scopeUserId ||
        activity.assigned_to_id === scopeUserId;
      const onMyRecord =
        activity.lead?.assigned_to === scopeUserId ||
        activity.deal?.assigned_to === scopeUserId;
      if (!isOwn && !onMyRecord) {
        throw new NotFoundException(`Activity ${id} not found`);
      }
    }

    return activity;
  }

  // ========================
  // Activity Comments
  // ========================

  async addComment(
    activityId: string,
    dto: CreateActivityCommentDto,
    userId: string,
    scopeUserId?: string,
  ): Promise<ActivityComment> {
    // AUD-H05: a rep may only comment on an activity they can access
    // (own/assigned/parent-record). findOne 404s otherwise.
    await this.findOne(activityId, scopeUserId);

    const commentText = dto.comment.trim();
    if (!commentText) {
      throw new BadRequestException('Comment cannot be empty');
    }

    const comment = this.activityCommentRepository.create({
      activity_id: activityId,
      comment: commentText,
      commented_by_id: userId,
    });

    const saved = await this.activityCommentRepository.save(comment);

    await this.activityLogsService.logCreate(
      'ActivityComment',
      saved.id,
      { activity_id: activityId, comment: commentText },
      userId,
      'Added activity comment',
    );

    const createdComment = await this.activityCommentRepository.findOne({
      where: { id: saved.id },
      relations: ['commented_by'],
    });

    if (!createdComment) {
      throw new NotFoundException(`Activity comment ${saved.id} not found`);
    }

    return createdComment;
  }

  // ========================
  // Update Activity
  // ========================

  async update(
    id: string,
    dto: UpdateActivityDto,
    userId: string,
    scopeUserId?: string,
    userRoles: string[] = [],
  ): Promise<Activity> {
    return this.dataSource.transaction(async (manager) => {
      // C-02: a rep can only edit an activity in their own scope. A
      // foreign id 404s here, before any write.
      const activity = await this.findOne(id, scopeUserId);
      const oldValues = { ...activity };
      // Capture the pre-edit status so we can detect an edit that
      // transitions the activity INTO completed (FIX #1 / FIX #2).
      const oldStatus = activity.status;

      const { task, note, call, email, meeting, whatsapp, ...activityData } =
        dto;

      // Update main activity
      if (activityData.scheduled_at) {
        (activityData as any).scheduled_at = new Date(
          activityData.scheduled_at,
        );
      }
      if (activityData.due_at) {
        (activityData as any).due_at = new Date(activityData.due_at);
      }

      Object.assign(activity, activityData);

      // FIX #3 — require_activity_due_date on the edit path. Mirrors the
      // create-time gate: if this edit leaves the activity OPEN with no
      // date and the setting is on, reject. Runs inside the transaction
      // so the throw rolls the edit back before any row is written.
      await this.assertOpenActivityHasDate(
        activity.type,
        activity.status,
        activity.due_at,
        activity.scheduled_at,
      );

      // FIX #1 / FIX #2 — an edit that transitions the activity INTO
      // completed must satisfy the same completion discipline the
      // status endpoints already enforce. Both checks run BEFORE the
      // save so a rejected edit never persists.
      if (
        activity.status === ActivityStatus.COMPLETED &&
        oldStatus !== ActivityStatus.COMPLETED
      ) {
        // FIX #1 — enforce_outcome_on_completion (default false, so this
        // is inert until an admin toggles it on). The UpdateActivityDto
        // carries no completion_outcome field, so after the Object.assign
        // above `activity.completion_outcome` reflects either a value the
        // payload merged in or the previously-stored one; if neither is
        // present the completion has no outcome.
        const enforceOutcome = await this.complianceSettings.getBoolean(
          'enforce_outcome_on_completion',
        );
        if (enforceOutcome && !activity.completion_outcome) {
          throw new BadRequestException(
            'outcome is required when marking an activity completed',
          );
        }

        // Generic edit DTOs do not carry next_step. The client therefore
        // persists a blocking stage="next-step" obligation after a successful
        // transition. The dedicated status route remains the atomic path.
      }

      await manager.save(Activity, activity);

      // Update type-specific details
      if (task && activity.task) {
        Object.assign(activity.task, task);
        await manager.save(Task, activity.task);
      }

      if (note && activity.note) {
        Object.assign(activity.note, note);
        await manager.save(Note, activity.note);
      }

      if (call && activity.call) {
        if (call.follow_up_date) {
          (call as any).follow_up_date = new Date(call.follow_up_date);
        }
        Object.assign(activity.call, call);
        await manager.save(Call, activity.call);
      }

      if (email && activity.email) {
        Object.assign(activity.email, email);
        await manager.save(Email, activity.email);
      }

      if (meeting && activity.meeting) {
        if (meeting.start_time) {
          (meeting as any).start_time = new Date(meeting.start_time);
        }
        if (meeting.end_time) {
          (meeting as any).end_time = new Date(meeting.end_time);
        }
        Object.assign(activity.meeting, meeting);
        await manager.save(Meeting, activity.meeting);
      }

      if (whatsapp && activity.whatsapp_message) {
        Object.assign(activity.whatsapp_message, whatsapp);
        await manager.save(WhatsAppMessage, activity.whatsapp_message);
      }

      await this.activityLogsService.logUpdate(
        'Activity',
        id,
        oldValues,
        activity,
        userId,
        `Updated ${activity.type} activity: ${activity.subject}`,
      );

      return this.findOne(id);
    });
  }

  // ========================
  // Update Status
  // ========================

  async updateStatus(
    id: string,
    status: ActivityStatus,
    userId: string,
    outcome?: ActivityOutcome,
    completionNote?: string,
    nextStep?: {
      type: ActivityType;
      subject: string;
      due_at: string;
      description?: string;
      contact_id?: string;
    },
    userRoles: string[] = [],
    scopeUserId?: string,
  ): Promise<Activity> {
    // C-02: a rep can only transition an activity in their own scope.
    const activity = await this.findOne(id, scopeUserId);
    const oldStatus = activity.status;

    // CRM discipline rule — server-side enforcement. A transition to
    // `completed` must carry an outcome. Notes are log entries and
    // bypass "completed" in normal UI flows, but if a request
    // explicitly marks a note completed we still demand the outcome
    // so the server is the last line of defence (never trust the
    // frontend alone).
    if (status === ActivityStatus.COMPLETED && !outcome) {
      throw new BadRequestException(
        'outcome is required when marking an activity completed',
      );
    }

    // A next step is future work. Enforce this at the write boundary so a
    // stale browser, direct API call, or elevated role cannot schedule an
    // already-overdue follow-up. Historical timestamps remain valid on the
    // completed source activity; only the new next_step is constrained.
    if (
      status === ActivityStatus.COMPLETED &&
      nextStep &&
      new Date(nextStep.due_at).getTime() <= Date.now()
    ) {
      throw new BadRequestException(
        'The next-step due date must be later than now',
      );
    }

    // Phase B — next-step compliance gate. Runs BEFORE persistence so
    // a denied request never moves the activity into completed.
    if (
      status === ActivityStatus.COMPLETED &&
      oldStatus !== ActivityStatus.COMPLETED
    ) {
      await this.assertNextStepCompliance(activity, !!nextStep, userRoles);
    }

    const parentPrimaryContact =
      activity.lead?.primary_contact ??
      activity.deal?.lead?.primary_contact ??
      (activity.lead?.primary_contact_id
        ? await this.dataSource.manager.findOne(Contact, {
            where: { id: activity.lead.primary_contact_id },
          })
        : activity.deal?.lead?.primary_contact_id
          ? await this.dataSource.manager.findOne(Contact, {
              where: { id: activity.deal.lead.primary_contact_id },
            })
          : null);
    const selectedNextStepContact = nextStep?.contact_id
      ? await this.dataSource.manager.findOne(Contact, {
          where: { id: nextStep.contact_id },
        })
      : null;
    if (nextStep?.contact_id && !selectedNextStepContact) {
      throw new BadRequestException(
        'The selected next-step contact no longer exists',
      );
    }
    const parentSchoolId =
      activity.lead?.school_id ?? activity.deal?.lead?.school_id;
    if (
      selectedNextStepContact &&
      parentSchoolId &&
      selectedNextStepContact.school_id !== parentSchoolId
    ) {
      throw new BadRequestException(
        'The selected next-step contact does not belong to this lead',
      );
    }
    const nextStepContact =
      selectedNextStepContact ?? activity.contact ?? parentPrimaryContact;
    const nextStepPhone =
      nextStep?.type === ActivityType.WHATSAPP
        ? (nextStepContact?.whatsapp_number ??
          nextStepContact?.phone ??
          (!nextStepContact
            ? (activity.whatsapp_message?.phone_number ??
              activity.call?.phone_number)
            : undefined))
        : (nextStepContact?.phone ??
          nextStepContact?.whatsapp_number ??
          (!nextStepContact
            ? (activity.call?.phone_number ??
              activity.whatsapp_message?.phone_number)
            : undefined));
    const nextStepEmail = nextStepContact?.email ?? null;
    if (
      (nextStep?.type === ActivityType.WHATSAPP ||
        nextStep?.type === ActivityType.CALL) &&
      !nextStepPhone
    ) {
      throw new BadRequestException(
        `This contact needs a phone number before scheduling a ${nextStep.type} next step`,
      );
    }
    if (nextStep?.type === ActivityType.EMAIL && !nextStepEmail) {
      throw new BadRequestException(
        'This contact needs an email address before scheduling an email next step',
      );
    }

    activity.status = status;

    if (status === ActivityStatus.COMPLETED) {
      activity.completed_at = this.completionMoment(activity);
      activity.completion_outcome = outcome as ActivityOutcome;
      activity.completion_note = completionNote ?? null;
    }

    // Save the completion and its correctly-typed follow-up as one unit.
    // Any subtype failure rolls the source completion back too.
    if (
      status === ActivityStatus.COMPLETED &&
      nextStep &&
      (activity.lead_id || activity.deal_id)
    ) {
      try {
        await this.dataSource.transaction(async (statusManager) => {
          await statusManager.save(Activity, activity);
          const followUp = statusManager.create(Activity, {
            type: nextStep.type,
            subject: nextStep.subject,
            description: nextStep.description ?? undefined,
            due_at: new Date(nextStep.due_at),
            status: ActivityStatus.SCHEDULED,
            lead_id: activity.lead_id ?? undefined,
            deal_id: activity.deal_id ?? undefined,
            contact_id: nextStep.contact_id ?? activity.contact_id ?? undefined,
            // Follow-up ownership is automatic: keep work with the deal/lead
            // owner, or give an unowned record to the person entering the task.
            assigned_to_id:
              activity.deal?.assigned_to ??
              activity.lead?.assigned_to ??
              userId,
            created_by_id: userId,
          });
          const savedFollowUp = await statusManager.save(Activity, followUp);
          if (nextStep.type === ActivityType.TASK) {
            await statusManager.save(
              Task,
              statusManager.create(Task, {
                activity_id: savedFollowUp.id,
                status: TaskStatus.TODO,
                priority: TaskPriority.MEDIUM,
              }),
            );
          }
          if (nextStep.type === ActivityType.CALL && nextStepPhone) {
            await statusManager.save(
              Call,
              statusManager.create(Call, {
                activity_id: savedFollowUp.id,
                phone_number: nextStepPhone,
                outcome: null,
                notes: nextStep.description,
                follow_up_required: false,
              }),
            );
          }
          if (nextStep.type === ActivityType.MEETING) {
            const start = new Date(nextStep.due_at);
            await statusManager.save(
              Meeting,
              statusManager.create(Meeting, {
                activity_id: savedFollowUp.id,
                title: nextStep.subject,
                platform: MeetingPlatform.OTHER,
                start_time: start,
                end_time: new Date(start.getTime() + 30 * 60 * 1000),
              }),
            );
          }
          if (nextStep.type === ActivityType.EMAIL && nextStepEmail) {
            const creator = await statusManager.findOne(User, {
              where: { id: userId },
            });
            if (!creator) {
              throw new NotFoundException(`User ${userId} not found`);
            }
            await statusManager.save(
              Email,
              statusManager.create(Email, {
                activity_id: savedFollowUp.id,
                subject: nextStep.subject,
                body: nextStep.description?.trim() || nextStep.subject,
                to_recipients: JSON.stringify([{ email: nextStepEmail }]),
                from_email: creator.email,
              }),
            );
          }
          if (nextStep.type === ActivityType.WHATSAPP && nextStepPhone) {
            await statusManager.save(
              WhatsAppMessage,
              statusManager.create(WhatsAppMessage, {
                activity_id: savedFollowUp.id,
                phone_number: nextStepPhone,
                message: nextStep.description?.trim() || nextStep.subject,
                direction: WhatsAppDirection.OUTBOUND,
                message_type: WhatsAppMessageType.TEXT,
              }),
            );
          }
        });
      } catch (e: any) {
        // Never report success when the promised next step was not created.
        // The shared transaction has also rolled the source completion back.
        throw new BadRequestException(
          `Could not schedule the next step: ${e?.message ?? 'unknown error'}`,
        );
      }
    } else {
      await this.activityRepository.save(activity);
    }

    // When a contact activity actually completes, propagate to the
    // parent lead — bumps `last_contacted_at` and `last_action_at`.
    // Previously only the CREATE path called this helper, so
    // completing a previously-scheduled call never updated the
    // lead's contact timestamps.
    if (
      status === ActivityStatus.COMPLETED &&
      oldStatus !== ActivityStatus.COMPLETED
    ) {
      await this.activityRepository.manager.transaction(async (manager) => {
        await this.updateLeadContactStatus(manager, activity, 'complete');
      });
    }

    await this.activityLogsService.logUpdate(
      'Activity',
      id,
      { status: oldStatus },
      {
        status,
        ...(status === ActivityStatus.COMPLETED
          ? { completion_outcome: outcome }
          : {}),
      },
      userId,
      `Updated activity status from ${oldStatus} to ${status}`,
    );

    // Demo + Commercial-Intent re-derivation. Status changes (esp.
    // SCHEDULED → COMPLETED with a demo outcome) are the most
    // common trigger for commercial intent. Idempotent — fires for
    // every demo activity status flip.
    if (
      activity.lead_id &&
      (activity.type === ActivityType.DEMO_BOOKING ||
        activity.type === ActivityType.DEMO_DELIVERY ||
        activity.type === ActivityType.DEMO_FOLLOWUP)
    ) {
      await this.deriveDemoEffectsForLead(activity.lead_id, userId).catch(
        (err) => {
          console.warn(
            `[ActivitiesService.updateStatus] demo derivation failed for lead ${activity.lead_id}: ${err?.message}`,
          );
        },
      );
    }

    return this.findOne(id);
  }

  // ========================
  // Bulk Update Status
  // ========================

  /**
   * Mark many activities at once. Used by the Tasks Hub "select N, mark
   * done" flow described in Section 1 of the activity spec.
   *
   * Performs the update inside a single transaction so callers never see
   * a half-applied state, and returns the list of activities that should
   * trigger a follow-up prompt (meetings / calls / tasks freshly completed
   * — we don't prompt on notes, emails, or whatsapp messages since those
   * aren't "dispositions" the user decides after the fact).
   */
  async bulkUpdateStatus(
    ids: string[],
    status: ActivityStatus,
    userId: string,
    outcome?: ActivityOutcome,
    completionNote?: string,
    scopeUserId?: string,
    userRoles: string[] = [],
  ): Promise<{
    updated: Activity[];
    followUpCandidates: Activity[];
  }> {
    if (!ids.length) {
      return { updated: [], followUpCandidates: [] };
    }

    // Same discipline rule as single status update — every bulk
    // completion must carry an outcome, applied uniformly to every
    // row in the batch. Bulk reopen or bulk cancel don't need one.
    if (status === ActivityStatus.COMPLETED && !outcome) {
      throw new BadRequestException(
        'outcome is required when bulk-marking activities completed',
      );
    }

    const updatedIds: string[] = [];
    // AUD-M01: demo-type leads whose completion should re-derive commercial
    // intent after the transaction, mirroring the single-completion path.
    const demoLeadIds = new Set<string>();

    await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(Activity);
      const activities = await repo.findByIds(ids);

      if (activities.length !== ids.length) {
        const found = new Set(activities.map((a) => a.id));
        const missing = ids.filter((id) => !found.has(id));
        throw new NotFoundException(
          `Activities not found: ${missing.join(', ')}`,
        );
      }

      // C-02: a rep can only bulk-update activities in their own scope.
      // Check every id up front (foreign ids 404) so no partial batch
      // mutates another rep's work.
      if (scopeUserId) {
        await this.assertActivitiesInScope(manager, ids, scopeUserId);
      }

      const now = new Date();
      for (const activity of activities) {
        const oldStatus = activity.status;
        // Skip no-ops so we don't pollute the audit log or overwrite
        // an earlier completed_at with a fresh timestamp.
        if (oldStatus === status) continue;

        activity.status = status;

        // Bulk has one common outcome/note but each active parent needs its own
        // future. The response identifies candidates and the client persists a
        // blocking stage="next-step" obligation for each one.

        if (status === ActivityStatus.COMPLETED && !activity.completed_at) {
          // ACT4: same rule as the single path — overdue history keeps
          // its own date instead of being stamped with today.
          activity.completed_at = this.completionMoment(activity);
          activity.completion_outcome = outcome as ActivityOutcome;
          activity.completion_note = completionNote ?? null;
        }
        await repo.save(activity);
        updatedIds.push(activity.id);

        // AUD-M01: bring bulk in line with the single-completion path. A
        // fresh completion propagates to the parent lead (bumps
        // last_contacted_at / last_action_at and flips New -> Contacted);
        // bulk previously skipped this, so bulk-completing calls/meetings
        // left the lead's contact state stale and broke stale-lead
        // detection. The helper is idempotent and forward-only, so it's
        // safe to run per row. (`oldStatus === status` no-ops already
        // `continue`d above, so COMPLETED here is always a fresh finish.)
        if (status === ActivityStatus.COMPLETED) {
          await this.updateLeadContactStatus(manager, activity, 'complete');
          if (
            activity.lead_id &&
            (activity.type === ActivityType.DEMO_BOOKING ||
              activity.type === ActivityType.DEMO_DELIVERY ||
              activity.type === ActivityType.DEMO_FOLLOWUP)
          ) {
            demoLeadIds.add(activity.lead_id);
          }
        }

        // Keep log writes inside the transaction so a failure rolls
        // back the status change AND its audit row together.
        await this.activityLogsService.logUpdate(
          'Activity',
          activity.id,
          { status: oldStatus },
          { status },
          userId,
          `Bulk updated activity status from ${oldStatus} to ${status}`,
        );
      }
    });

    // AUD-M01: demo / commercial-intent re-derivation, mirroring the single
    // path — run after the transaction, idempotent and best-effort so a
    // derivation hiccup never fails the completed batch.
    for (const leadId of demoLeadIds) {
      await this.deriveDemoEffectsForLead(leadId, userId).catch((err) => {
        console.warn(
          `[ActivitiesService.bulkUpdateStatus] demo derivation failed for lead ${leadId}: ${err?.message}`,
        );
      });
    }

    // Re-fetch with relations so the response mirrors the shape of
    // single-item updates (callers render the updated cards directly).
    const updated = await Promise.all(updatedIds.map((id) => this.findOne(id)));

    const FOLLOW_UP_TYPES: ActivityType[] = [
      ActivityType.MEETING,
      ActivityType.CALL,
      ActivityType.TASK,
      ActivityType.WHATSAPP,
      ActivityType.EMAIL,
    ];
    const followUpCandidates =
      status === ActivityStatus.COMPLETED
        ? updated.filter((a) => FOLLOW_UP_TYPES.includes(a.type))
        : [];

    return { updated, followUpCandidates };
  }

  // ========================
  // Delete Activity
  // ========================

  async remove(id: string, userId: string): Promise<void> {
    const activity = await this.findOne(id);

    // If this was a meeting, fan out to the calendar-sync + cancellation
    // email pipeline BEFORE we drop the row — we need the Meeting
    // subrecord (attendees, start time) to render the notice.
    if (activity.type === ActivityType.MEETING && this.meetingCancellation) {
      await this.meetingCancellation.cancelMeetingForActivity(id, userId);
    }

    await this.activityRepository.remove(activity);

    await this.activityLogsService.logDelete(
      'Activity',
      id,
      { type: activity.type, subject: activity.subject },
      userId,
      `Deleted ${activity.type} activity: ${activity.subject}`,
    );
  }

  // ========================
  // Attachments
  // ========================

  async addAttachment(
    dto: CreateAttachmentDto,
    userId: string,
    scopeUserId?: string,
  ): Promise<ActivityAttachment> {
    // AUD-H05: verify the caller can access the parent activity (own/
    // assigned/parent-record). findOne 404s for a foreign activity.
    await this.findOne(dto.activity_id, scopeUserId);

    const attachment = this.attachmentRepository.create({
      ...dto,
      uploaded_by_id: userId,
    });

    const saved = await this.attachmentRepository.save(attachment);

    await this.activityLogsService.logCreate(
      'ActivityAttachment',
      saved.id,
      { file_name: saved.file_name, activity_id: saved.activity_id },
      userId,
      `Added attachment ${saved.file_name} to activity`,
    );

    return saved;
  }

  async removeAttachment(
    id: string,
    userId: string,
    scopeUserId?: string,
  ): Promise<void> {
    const attachment = await this.attachmentRepository.findOne({
      where: { id },
    });

    if (!attachment) {
      throw new NotFoundException(`Attachment ${id} not found`);
    }

    // AUD-H05: a rep may only remove an attachment on an activity they can
    // access — check the parent activity's ownership scope first.
    await this.findOne(attachment.activity_id, scopeUserId);

    await this.attachmentRepository.remove(attachment);

    await this.activityLogsService.logDelete(
      'ActivityAttachment',
      id,
      { fileName: attachment.file_name },
      userId,
      `Removed attachment ${attachment.file_name}`,
    );
  }

  async getAttachments(
    activity_id: string,
    scopeUserId?: string,
  ): Promise<ActivityAttachment[]> {
    // AUD-H05: enforce the activity's ownership scope before returning file
    // metadata/URLs (previously any authenticated user could read any
    // activity's attachments).
    await this.findOne(activity_id, scopeUserId);
    return this.attachmentRepository.find({
      where: { activity_id },
      relations: ['uploadedBy'],
      order: { created_at: 'DESC' },
    });
  }

  // ========================
  // Summary Endpoint
  // ========================

  async getSummary(
    query: ActivitySummaryQueryDto,
    scopeUserId?: string,
  ): Promise<{
    items: any[];
    meta: any;
    summary: {
      total: number;
      byType: Record<string, number>;
      byStatus: Record<string, number>;
    };
  }> {
    const {
      lead_id,
      deal_id,
      contact_id,
      created_by_id,
      assigned_to_id,
      start_date,
      end_date,
      page = '1',
      limit = '20',
    } = query;

    const qb = this.activityRepository
      .createQueryBuilder('activity')
      .select([
        'activity.id',
        'activity.type',
        'activity.status',
        'activity.subject',
        'activity.created_at',
        'activity.scheduled_at',
        'activity.due_at',
        'activity.completed_at',
        'activity.lead_id',
        'activity.deal_id',
        'activity.contact_id',
      ])
      .leftJoin('activity.created_by', 'created_by')
      .addSelect([
        'created_by.id',
        'created_by.first_name',
        'created_by.last_name',
      ])
      .leftJoin('activity.assigned_to', 'assigned_to')
      .addSelect([
        'assigned_to.id',
        'assigned_to.first_name',
        'assigned_to.last_name',
      ]);

    // Same rep scoping as findAll: global summaries are limited to the
    // caller's own activities; record-filtered summaries stay open.
    if (scopeUserId && !lead_id && !deal_id && !contact_id) {
      qb.andWhere(
        '(activity.created_by_id = :scopeUserId OR activity.assigned_to_id = :scopeUserId)',
        { scopeUserId },
      );
    }

    if (lead_id) {
      qb.andWhere('activity.lead_id = :lead_id', { lead_id });
    }

    if (deal_id) {
      qb.andWhere('activity.deal_id = :deal_id', { deal_id });
    }

    if (contact_id) {
      qb.andWhere('activity.contact_id = :contact_id', { contact_id });
    }

    if (created_by_id) {
      qb.andWhere('activity.created_by_id = :created_by_id', { created_by_id });
    }

    if (assigned_to_id) {
      qb.andWhere('activity.assigned_to_id = :assigned_to_id', {
        assigned_to_id,
      });
    }

    if (start_date) {
      qb.andWhere('activity.created_at >= :start_date', { start_date });
    }

    if (end_date) {
      qb.andWhere('activity.created_at <= :end_date', { end_date });
    }

    qb.orderBy('activity.created_at', 'DESC');
    qb.addOrderBy('activity.id', 'DESC'); // API2: deterministic tiebreaker

    const paginatedResult = await paginate<Activity>(qb, {
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
    });

    // Get summary counts
    const summaryQb = this.activityRepository.createQueryBuilder('activity');

    if (lead_id) summaryQb.andWhere('activity.lead_id = :lead_id', { lead_id });
    if (deal_id) summaryQb.andWhere('activity.deal_id = :deal_id', { deal_id });
    if (contact_id)
      summaryQb.andWhere('activity.contact_id = :contact_id', { contact_id });
    if (created_by_id)
      summaryQb.andWhere('activity.created_by_id = :created_by_id', {
        created_by_id,
      });
    if (assigned_to_id)
      summaryQb.andWhere('activity.assigned_to_id = :assigned_to_id', {
        assigned_to_id,
      });
    if (start_date)
      summaryQb.andWhere('activity.created_at >= :start_date', { start_date });
    if (end_date)
      summaryQb.andWhere('activity.created_at <= :end_date', { end_date });

    const total = await summaryQb.getCount();

    // By type
    const byTypeRaw = await this.activityRepository
      .createQueryBuilder('activity')
      .select('activity.type', 'type')
      .addSelect('COUNT(*)', 'count')
      .where(summaryQb.getQuery().split('WHERE')[1] || '1=1')
      .setParameters(summaryQb.getParameters())
      .groupBy('activity.type')
      .getRawMany();

    const byType: Record<string, number> = {};
    byTypeRaw.forEach((r) => {
      byType[r.type] = parseInt(r.count, 10);
    });

    // By status
    const byStatusRaw = await this.activityRepository
      .createQueryBuilder('activity')
      .select('activity.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .where(summaryQb.getQuery().split('WHERE')[1] || '1=1')
      .setParameters(summaryQb.getParameters())
      .groupBy('activity.status')
      .getRawMany();

    const byStatus: Record<string, number> = {};
    byStatusRaw.forEach((r) => {
      byStatus[r.status] = parseInt(r.count, 10);
    });

    return {
      items: paginatedResult.items,
      meta: paginatedResult.meta,
      summary: {
        total,
        byType,
        byStatus,
      },
    };
  }

  // ========================
  // Lead Activity Stats
  // ========================

  async getLeadActivityStats(
    lead_id: string,
    scopeUserId?: string,
  ): Promise<LeadActivityStatsResponseDto> {
    // Get the lead
    const lead = await this.dataSource.getRepository(Lead).findOne({
      where: { id: lead_id },
    });

    if (!lead) {
      throw new NotFoundException(`Lead ${lead_id} not found`);
    }

    // R15: these are engagement numbers for one lead — touches, time to
    // first contact, staleness. A rep gets them for the leads assigned to
    // them and no others (owner ruling 2026-07-27). Reads as 404 rather
    // than 403 so the endpoint cannot be used to prove a lead exists.
    if (scopeUserId && lead.assigned_to !== scopeUserId) {
      throw new NotFoundException(`Lead ${lead_id} not found`);
    }

    // Get all activities for this lead, ordered by creation date ASC
    const activities = await this.activityRepository.find({
      where: { lead_id },
      relations: ['call', 'meeting'],
      order: { created_at: 'ASC' },
    });

    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Touches in last 7 days
    const touchesLast7Days = activities.filter(
      (a) => a.created_at && a.created_at >= sevenDaysAgo,
    ).length;

    // Time to first touch (in hours from lead creation)
    const firstActivity = activities[0];
    let timeToFirstTouch: number | null = null;
    if (firstActivity?.created_at) {
      const diffMs =
        firstActivity.created_at.getTime() - lead.created_at.getTime();
      timeToFirstTouch = Math.round(diffMs / (1000 * 60 * 60));
    }

    // Meetings booked count - meetings with status scheduled or completed
    const meetingsBookedCount = activities.filter(
      (a) =>
        a.type === ActivityType.MEETING &&
        (a.status === ActivityStatus.SCHEDULED ||
          a.status === ActivityStatus.COMPLETED),
    ).length;

    // Incomplete logs - activities (excluding notes) that are missing follow-up info
    const incompleteLogsCount = activities.filter((a) => {
      // Notes don't require follow-up
      if (a.type === ActivityType.NOTE) return false;

      // Calls: check if followUpRequired is true but no nextSteps
      if (a.type === ActivityType.CALL && a.call) {
        return a.call.follow_up_required && !a.call.next_steps;
      }

      // Meetings: check if no minutesNotes and no actionItems
      if (a.type === ActivityType.MEETING && a.meeting) {
        return !a.meeting.minutes_notes && !a.meeting.action_items;
      }

      // Other types: check if completed without description
      return a.status === ActivityStatus.COMPLETED && !a.description;
    }).length;

    // Last activity date
    const lastActivity =
      activities.length > 0 ? activities[activities.length - 1] : null;
    const lastActivityAt = lastActivity?.created_at || null;

    // Is stale (no activity in last 7 days)
    const isStale = !lastActivityAt || lastActivityAt < sevenDaysAgo;

    // Breakdown by type
    const byType: Record<string, number> = {};
    activities.forEach((a) => {
      byType[a.type] = (byType[a.type] || 0) + 1;
    });

    return {
      touchesLast7Days,
      timeToFirstTouch,
      meetingsBookedCount,
      incompleteLogsCount,
      isStale,
      lastActivityAt,
      totalActivities: activities.length,
      byType,
    };
  }

  // ========================
  // Private Helpers
  // ========================

  private async sendActivityEmail(
    manager: EntityManager,
    emailEntity: Email,
    userId: string,
  ): Promise<void> {
    const toRecipients = this.parseEmailRecipients(emailEntity.to_recipients);
    if (toRecipients.length === 0) {
      return;
    }

    if (this.userEmailSender?.send) {
      const result = await this.userEmailSender.send({
        userId,
        to: toRecipients,
        cc: this.parseEmailRecipients(emailEntity.cc_recipients),
        bcc: this.parseEmailRecipients(emailEntity.bcc_recipients),
        subject: emailEntity.subject,
        body_html: emailEntity.body,
        body_text: emailEntity.body,
      });

      emailEntity.sent_at = new Date();
      emailEntity.message_id = result.messageId;
      emailEntity.from_email = result.fromAddress;
      await manager.save(Email, emailEntity);
      return;
    }

    try {
      const response = await this.notificationsService.sendEmail({
        to: this.formatRequiredRecipients(toRecipients),
        cc: this.formatOptionalRecipients(
          this.parseEmailRecipients(emailEntity.cc_recipients),
        ),
        bcc: this.formatOptionalRecipients(
          this.parseEmailRecipients(emailEntity.bcc_recipients),
        ),
        subject: emailEntity.subject,
        html: emailEntity.body,
        text: emailEntity.body,
        from: emailEntity.from_email,
      });

      if (response.success) {
        emailEntity.sent_at = new Date();
        if (response.messageId) {
          emailEntity.message_id = response.messageId;
        }
        await manager.save(Email, emailEntity);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // Log but don't fail activity creation if email sending fails.
      console.error('Failed to send activity email:', message);
    }
  }

  private parseEmailRecipients(value?: string): string[] {
    if (!value) {
      return [];
    }

    const trimmed = value.trim();
    if (!trimmed) {
      return [];
    }

    const normalizeEntry = (entry: unknown): string | null => {
      if (!entry) {
        return null;
      }
      if (typeof entry === 'string') {
        const cleaned = entry.trim();
        return cleaned ? cleaned : null;
      }
      if (typeof entry === 'object') {
        const email = (entry as { email?: string | null }).email;
        const name = (entry as { name?: string | null }).name;
        if (!email) {
          return null;
        }
        const cleanedEmail = String(email).trim();
        if (!cleanedEmail) {
          return null;
        }
        const cleanedName = typeof name === 'string' ? name.trim() : undefined;
        return cleanedName ? `${cleanedName} <${cleanedEmail}>` : cleanedEmail;
      }
      return null;
    };

    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        const mapped = parsed
          .map(normalizeEntry)
          .filter((entry): entry is string => !!entry);
        if (mapped.length > 0) {
          return mapped;
        }
      } else {
        const single = normalizeEntry(parsed);
        if (single) {
          return [single];
        }
      }
    } catch {
      // Fall back to comma-separated parsing below.
    }

    return trimmed
      .split(',')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
  }

  private formatRequiredRecipients(recipients: string[]): string | string[] {
    return recipients.length === 1 ? recipients[0] : recipients;
  }

  private formatOptionalRecipients(
    recipients: string[],
  ): string | string[] | undefined {
    if (!recipients.length) {
      return undefined;
    }
    return recipients.length === 1 ? recipients[0] : recipients;
  }

  // `adjustLeadSlaDueDate` was removed when the dual-clock rule landed.
  // The rep's follow-up due date must never override the SLA timer — see
  // the comment in the `create` transaction above this helper.

  /**
   * Updates lead's contact status when a contact activity (call, email, whatsapp)
   * is created. If the lead is still New, mark it as Contacted.
   */
  /**
   * Propagate an activity event back to its parent lead.
   *
   * Mode matters:
   *
   *   - `mode = 'create'` — the activity was just scheduled (may be
   *     in the future, may be in the past as a retrospective log).
   *     Bumps `last_action_at` (schedule IS an action) and flips a
   *     'New' lead to 'Contacted' (lifecycle signal: rep has
   *     committed to making contact, lead is no longer untouched).
   *     DOES NOT bump `last_contacted_at` — that represents ACTUAL
   *     contact, and a scheduled call hasn't happened yet. Audit
   *     (Apr 2026) caught this bumping at schedule-time, which made
   *     "Leads Touched Within SLA" fire on scheduling and skewed
   *     the stale-lead detector.
   *
   *   - `mode = 'complete'` — the activity just transitioned to
   *     `completed`. THIS is when `last_contacted_at` moves, and
   *     `last_action_at` too.
   *
   * The 'New' → 'Contacted' flip happens in BOTH modes. It used to be
   * in the 'create' branch alone, which meant an activity created
   * already completed (a rep logging a call they had made) never moved
   * the lead off 'New'.
   *
   *   - Exception: when an activity is CREATED already in the
   *     `completed` state (e.g. "log a past call I already made"),
   *     callers should pass `mode = 'complete'` so the contact
   *     bump fires correctly.
   */
  /**
   * ACT4: the moment a completion is stamped with. Completing something
   * recent means the work happened now. Completing something whose due
   * date is more than a day gone is a rep tidying up history — the work
   * keeps its own date, exactly as ruled for the restored Lobengula
   * records (their completed_at was set to due/scheduled, never to the
   * day of the click). Without this, clearing the 2,364 stuck open
   * activities would stamp today onto months-old work.
   */
  private completionMoment(activity: Activity): Date {
    const anchor = activity.due_at ?? activity.scheduled_at ?? null;
    const now = new Date();
    const DAY_MS = 24 * 60 * 60 * 1000;
    if (anchor && now.getTime() - new Date(anchor).getTime() > DAY_MS) {
      return new Date(anchor);
    }
    return now;
  }

  private async updateLeadContactStatus(
    manager: EntityManager,
    activity: Activity,
    mode: 'create' | 'complete' = 'create',
  ): Promise<void> {
    if (!CONTACT_ACTIVITY_TYPES.includes(activity.type)) return;
    if (!activity.lead_id) return;

    const lead = await manager.findOne(Lead, {
      where: { id: activity.lead_id },
    });
    if (!lead) return;

    const now = new Date();

    if (mode === 'complete') {
      // Contact actually happened. The completed_at the service just
      // stamped is the canonical contact moment — and THIS is when a New
      // lead becomes Contacted (signal-driven, Mr Dube 8 Aug: REAL contact
      // advances the lead; a scheduled call is a plan and does not).
      // Ms Mpofu's rule holds through it: logging a completed call always
      // flips New → Contacted.
      //
      // ACT4: the contact date only ever moves FORWARD. Completing old
      // history must neither claim the school was contacted today (the
      // moment is the activity's own date now) nor drag a fresher
      // last_contacted_at backwards.
      const contactMoment = activity.completed_at ?? now;
      const existing = lead.last_contacted_at
        ? new Date(lead.last_contacted_at)
        : null;
      const update: Partial<Lead> = { last_action_at: now };
      if (!existing || contactMoment.getTime() > existing.getTime()) {
        update.last_contacted_at = contactMoment;
      }
      await manager.update(Lead, { id: lead.id }, update);
      // transitionStatus() is a no-op when the status already matches, and
      // it closes the SLA history record properly.
      if (lead.status === 'New') {
        await this.leadsService.updateStatusInTransaction(
          manager,
          lead.id,
          'Contacted',
          activity.created_by_id,
        );
      }
      return;
    }

    // mode === 'create' — schedule event. A scheduled call is a plan,
    // not contact: only bump the action clock, leave the status alone.
    await manager.update(Lead, { id: lead.id }, { last_action_at: now });
  }
}
