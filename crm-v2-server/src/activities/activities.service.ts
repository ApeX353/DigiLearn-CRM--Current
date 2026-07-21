import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Repository,
  DataSource,
  Between,
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
} from './entities/activity.entity';
import { Task, TaskPriority, TaskStatus } from './entities/tasks.entity';
import { Note } from './entities/notes.entity';
import { Call } from './entities/calls.entity';
import { Email } from './entities/emails.entity';
import { Meeting } from './entities/meetings.entity';
import { WhatsAppMessage } from './entities/whats-app.entity';
import { ActivityAttachment } from './entities/activity-attachments.entity';
import { ActivityComment } from './entities/activity-comments.entity';
import { Lead } from '../leads/entities/lead.entity';
import { LeadSLAHistory } from '../leads/entities/lead-sla-history.entity';
import { User } from '../users/entities/user.entity';
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

// Activity types that count as "contact" activities
const CONTACT_ACTIVITY_TYPES: ActivityType[] = [
  ActivityType.CALL,
  ActivityType.EMAIL,
  ActivityType.WHATSAPP,
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
  ) {}

  // ========================
  // Create Activity
  // ========================

  async create(dto: CreateActivityDto, userId: string): Promise<Activity> {
    return this.dataSource.transaction(async (manager) => {
      const { task, note, call, email, meeting, whatsapp, ...activityData } =
        dto;

      const activity = manager.create(Activity, {
        ...activityData,
        created_by_id: userId,
        scheduled_at: dto.scheduled_at ? new Date(dto.scheduled_at) : undefined,
        due_at: dto.due_at ? new Date(dto.due_at) : undefined,
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
            const noteEntity = manager.create(Note, {
              ...note,
              activity_id: savedActivity.id,
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
            await this.sendActivityEmail(manager, savedEmail);
          }
          break;

        case ActivityType.MEETING:
          if (meeting) {
            const meetingEntity = manager.create(Meeting, {
              ...meeting,
              activity_id: savedActivity.id,
              start_time: new Date(meeting.start_time),
              end_time: new Date(meeting.end_time),
            });
            await manager.save(Meeting, meetingEntity);
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
      }

      // Adjust lead SLA due date if activity has a future date
      if (savedActivity.lead_id) {
        let futureDate: Date | null = null;

        switch (dto.type) {
          case ActivityType.TASK:
            futureDate = savedActivity.due_at;
            break;
          case ActivityType.CALL:
            futureDate = call?.follow_up_date
              ? new Date(call.follow_up_date)
              : null;
            break;
          case ActivityType.MEETING:
            futureDate = meeting?.start_time
              ? new Date(meeting.start_time)
              : null;
            break;
          case ActivityType.WHATSAPP:
            futureDate = whatsapp?.follow_up_date
              ? new Date(whatsapp.follow_up_date)
              : null;
            break;
        }

        if (futureDate) {
          await this.adjustLeadSlaDueDate(
            manager,
            savedActivity.lead_id,
            futureDate,
          );
        }
      }

      // Update lead contact status if this is a contact activity
      await this.updateLeadContactStatus(manager, savedActivity);

      await this.activityLogsService.logCreate(
        'Activity',
        savedActivity.id,
        { type: dto.type, subject: dto.subject },
        userId,
        `Created ${dto.type} activity: ${dto.subject}`,
      );

      return activity;
    });
  }

  // ========================
  // Find All with Pagination
  // ========================

  async findAll(query: QueryActivityDto): Promise<Pagination<Activity>> {
    const {
      page = '1',
      limit = '10',
      type,
      status,
      lead_id,
      deal_id,
      contact_id,
      created_by_id,
      assigned_to_id,
      start_date,
      end_date,
      is_pinned,
      include_details,
    } = query;

    const qb = this.activityRepository
      .createQueryBuilder('activity')
      .leftJoinAndSelect('activity.created_by', 'created_by')
      .leftJoinAndSelect('activity.assigned_to', 'assigned_to')
      .leftJoinAndSelect('activity.lead', 'lead')
      .leftJoinAndSelect('activity.deal', 'deal')
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

    if (type) {
      qb.andWhere('activity.type = :type', { type });
    }

    if (status) {
      qb.andWhere('activity.status = :status', { status });
    }

    if (lead_id) {
      qb.andWhere('activity.lead_id = :lead_id', { lead_id });
    }

    if (deal_id) {
      qb.andWhere('activity.deal_id = :deal_id', { deal_id });
    }

    // if both deal and lead ids exist, add an or
    if (deal_id && lead_id) {
      qb.orWhere(
        '(activity.deal_id = :deal_id OR activity.lead_id = :lead_id)',
        { deal_id, lead_id },
      );
    }

    if (contact_id) {
      qb.andWhere('activity.contact_id = :contact_id', { contact_id });
    }

    // if (created_by_id) {
    //   qb.andWhere('activity.created_by_id = :created_by_id', { created_by_id });
    // }

    // if (assigned_to_id) {
    //   qb.andWhere('activity.assigned_to_id = :assigned_to_id', {
    //     assigned_to_id,
    //   });
    // }

    if (created_by_id || assigned_to_id) {
      const userId = assigned_to_id || created_by_id;

      qb.andWhere(
        new Brackets((qb1) => {
          // TASKS → filter by assigned_to
          qb1.where(
            'activity.type = :taskType AND activity.assigned_to_id = :userId',
            { taskType: 'task', userId },
          );

          // NON-TASKS → filter by created_by
          qb1.orWhere(
            'activity.type != :taskType AND activity.created_by_id = :userId',
            { taskType: 'task', userId },
          );
        }),
      );
    }

    if (start_date) {
      qb.andWhere('activity.created_at >= :start_date', { start_date });
    }

    if (end_date) {
      qb.andWhere('activity.created_at <= :end_date', { end_date });
    }

    if (is_pinned !== undefined) {
      qb.andWhere('activity.is_pinned = :is_pinned', { is_pinned });
    }

    if (include_details) {
      qb.orderBy(
        `CASE 
        WHEN activity.type = 'task' THEN activity.due_at 
        ELSE NULL 
        END`,
        'DESC',
      );
      qb.addOrderBy(
        `CASE 
        WHEN activity.type = 'task' 
        THEN FIELD(task.priority, '${TaskPriority.URGENT}', '${TaskPriority.HIGH}', '${TaskPriority.MEDIUM}', '${TaskPriority.LOW}')
        ELSE 5
        END`,
      );
    }
    qb.addOrderBy('activity.created_at', 'DESC');

    return paginate<Activity>(qb, {
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
    });
  }

  // ========================
  // Find One
  // ========================

  async findOne(id: string): Promise<Activity> {
    const activity = await this.activityRepository.findOne({
      where: { id },
      relations: [
        'created_by',
        'assigned_to',
        'lead',
        'deal',
        'contact',
        'task',
        'note',
        'call',
        'email',
        'meeting',
        'whatsapp_message',
        'attachments',
        'comments',
        'comments.commented_by',
      ],
    });

    if (!activity) {
      throw new NotFoundException(`Activity ${id} not found`);
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
  ): Promise<ActivityComment> {
    await this.findOne(activityId);

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
  ): Promise<Activity> {
    return this.dataSource.transaction(async (manager) => {
      const activity = await this.findOne(id);
      const oldValues = { ...activity };

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
  ): Promise<Activity> {
    const activity = await this.findOne(id);
    const oldStatus = activity.status;

    activity.status = status;

    if (status === ActivityStatus.COMPLETED) {
      activity.completed_at = new Date();
    }

    await this.activityRepository.save(activity);

    await this.activityLogsService.logUpdate(
      'Activity',
      id,
      { status: oldStatus },
      { status },
      userId,
      `Updated activity status from ${oldStatus} to ${status}`,
    );

    return this.findOne(id);
  }

  // ========================
  // Delete Activity
  // ========================

  async remove(id: string, userId: string): Promise<void> {
    const activity = await this.findOne(id);

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
  ): Promise<ActivityAttachment> {
    // Verify activity exists
    await this.findOne(dto.activity_id);

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

  async removeAttachment(id: string, userId: string): Promise<void> {
    const attachment = await this.attachmentRepository.findOne({
      where: { id },
    });

    if (!attachment) {
      throw new NotFoundException(`Attachment ${id} not found`);
    }

    await this.attachmentRepository.remove(attachment);

    await this.activityLogsService.logDelete(
      'ActivityAttachment',
      id,
      { fileName: attachment.file_name },
      userId,
      `Removed attachment ${attachment.file_name}`,
    );
  }

  async getAttachments(activity_id: string): Promise<ActivityAttachment[]> {
    return this.attachmentRepository.find({
      where: { activity_id },
      relations: ['uploadedBy'],
      order: { created_at: 'DESC' },
    });
  }

  // ========================
  // Summary Endpoint
  // ========================

  async getSummary(query: ActivitySummaryQueryDto): Promise<{
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
  ): Promise<LeadActivityStatsResponseDto> {
    // Get the lead
    const lead = await this.dataSource.getRepository(Lead).findOne({
      where: { id: lead_id },
    });

    if (!lead) {
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
  ): Promise<void> {
    const toRecipients = this.parseEmailRecipients(emailEntity.to_recipients);
    if (toRecipients.length === 0) {
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

  /**
   * Adjusts the lead's SLA due date when an activity with a future date is created.
   * Also updates the open SLA history record and resets the breach flag.
   */
  private async adjustLeadSlaDueDate(
    manager: EntityManager,
    leadId: string,
    newDueDate: Date,
  ): Promise<void> {
    if (!leadId || !newDueDate || newDueDate <= new Date()) return;

    await manager.update(
      Lead,
      { id: leadId },
      {
        current_sla_due_date: newDueDate,
        sla_breached: false,
      },
    );

    await manager
      .createQueryBuilder()
      .update(LeadSLAHistory)
      .set({ sla_due_date: newDueDate })
      .where('lead_id = :leadId', { leadId })
      .andWhere('exited_status_at IS NULL')
      .execute();
  }

  /**
   * Updates lead's contact status when a contact activity (call, email, whatsapp)
   * is created. If the lead is still New, mark it as Contacted.
   */
  private async updateLeadContactStatus(
    manager: EntityManager,
    activity: Activity,
  ): Promise<void> {
    // Only process if this is a contact activity type
    if (!CONTACT_ACTIVITY_TYPES.includes(activity.type)) {
      return;
    }

    // Only process if a lead_id is associated
    if (!activity.lead_id) {
      return;
    }

    const now = new Date();
    // Determine the contact date (use due_at, scheduled_at, or now)
    const contactDate = activity.due_at || activity.scheduled_at || now;

    const lead = await manager.findOne(Lead, {
      where: { id: activity.lead_id },
    });

    if (!lead) {
      return;
    }

    // Only update for non-new leads when contact date is now or in the past.
    if (lead.status !== 'New' && contactDate > now) {
      return;
    }

    const effectiveContactDate = contactDate > now ? now : contactDate;

    // Update lead fields
    const updates: Partial<Lead> = {
      last_contacted_at: effectiveContactDate,
      last_action_at: now,
    };

    // Only update status to 'Contacted' if currently 'New'
    if (lead.status === 'New') {
      updates.status = 'Contacted';
    }

    await manager.update(Lead, { id: lead.id }, updates);
  }
}
