import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import {
  BugReportsService,
  TRIAGE_ROLES,
  type RequestingUser,
} from './bug-reports.service';
import { UserNotificationsService } from '../notifications/user-notifications.service';
import { User } from '../users/entities/user.entity';
import { JobRunnerService, runJob } from '../diagnostics/job-runner.service';

@Injectable()
export class BugScreenshotsService {
  private readonly logger = new Logger(BugScreenshotsService.name);
  constructor(
    private readonly ds: DataSource,
    private readonly bugs: BugReportsService,
    @Optional() private readonly notifications?: UserNotificationsService,
    @Optional() private readonly jobs?: JobRunnerService,
  ) {}

  onModuleInit(): void {
    this.jobs?.registerHandler('bugs.screenshot_retention_notice', () => this.notifyEligible());
  }

  private triager(user: RequestingUser) {
    return user.roles?.some((r) => TRIAGE_ROLES.includes(r.name)) ?? false;
  }

  async list(bugId: string, user: RequestingUser) {
    await this.bugs.findOne(bugId, user);
    const items = await this.ds.query(
      `SELECT s.id,s.file_name,s.file_type,s.file_size,s.created_at,s.retention_due_at,s.deleted_at,s.deleted_by,
      concat_ws(' ',u.first_name,u.last_name) AS deleted_by_name,
      (s.deleted_at IS NULL AND s.retention_due_at <= now() AND b.status::text IN ('done','closed')) AS eligible
      FROM bug_report_screenshots s JOIN bug_reports b ON b.id=s.bug_report_id
      LEFT JOIN users u ON u.id=s.deleted_by WHERE s.bug_report_id=$1 ORDER BY s.slot`,
      [bugId],
    );
    return { items, canApproveDeletion: this.triager(user) };
  }

  async content(bugId: string, id: string, user: RequestingUser) {
    await this.bugs.findOne(bugId, user); // Check ticket scope BEFORE fetching bytes.
    const [row] = await this.ds.query(
      `SELECT file_name,file_type,content FROM bug_report_screenshots
      WHERE id=$1 AND bug_report_id=$2 AND deleted_at IS NULL`,
      [id, bugId],
    );
    if (!row) throw new NotFoundException('Screenshot unavailable or deleted');
    return row;
  }

  async approveDeletion(
    bugId: string,
    id: string,
    user: RequestingUser,
    expectedDueAt: string,
  ) {
    if (!this.triager(user))
      throw new ForbiddenException(
        'Only ticket managers can approve screenshot deletion',
      );
    return this.ds.transaction(async (manager) => {
      const [bug] = await manager.query(
        'SELECT status FROM bug_reports WHERE id=$1 FOR UPDATE',
        [bugId],
      );
      if (!bug) throw new NotFoundException('Bug report not found');
      if (!['done', 'closed'].includes(bug.status))
        throw new BadRequestException(
          'Ticket was reopened; screenshot deletion is not eligible',
        );
      const [shot] = await manager.query(
        `SELECT id,retention_due_at,deleted_at,retention_due_at <= now() AS eligible
        FROM bug_report_screenshots WHERE bug_report_id=$1 AND id=$2 FOR UPDATE`,
        [bugId, id],
      );
      if (!shot) throw new NotFoundException('Screenshot not found');
      if (shot.deleted_at) return { alreadyDeleted: true };
      if (
        !shot.eligible ||
        new Date(shot.retention_due_at).getTime() !==
          new Date(expectedDueAt).getTime()
      )
        throw new BadRequestException(
          'Screenshot is not eligible for this approval. Refresh the ticket; 30 days in Done/Closed are required.',
        );
      await manager.query(
        `UPDATE bug_report_screenshots SET content=NULL,deleted_at=clock_timestamp(),deleted_by=$3
        WHERE bug_report_id=$1 AND id=$2`,
        [bugId, id, user.id],
      );
      return { deleted: true };
    });
  }

  // Notification ONLY. This job has no path that removes content.
  @Cron(CronExpression.EVERY_HOUR)
  async notifyEligible(): Promise<void> {
    await runJob(this.jobs, 'bugs.screenshot_retention_notice', async (ctx) => {
      if (!this.notifications) ctx.skip('notifications service not available');
      const recipients = await this.ds
        .getRepository(User)
        .createQueryBuilder('u')
        .innerJoin('u.roles', 'r')
        .where('u.is_active=true')
        .andWhere('r.name IN (:...roles)', { roles: TRIAGE_ROLES })
        .select('u.id', 'id')
        .distinct(true)
        .getRawMany<{ id: string }>();
      if (!recipients.length) ctx.skip('no active triagers to notify');
      await this.ds.transaction(async (manager) => {
        const [lock] = await manager.query(
          'SELECT pg_try_advisory_xact_lock(1791000000) AS acquired',
        );
        if (!lock.acquired) {
          ctx.note('lock', 'held elsewhere');
          return;
        }
        const tickets =
          await manager.query(`SELECT b.id FROM bug_reports b WHERE b.status::text IN ('done','closed')
          AND EXISTS(SELECT 1 FROM bug_report_screenshots s WHERE s.bug_report_id=b.id AND s.deleted_at IS NULL
          AND s.notified_at IS NULL AND s.retention_due_at<=now()) ORDER BY b.id LIMIT 100 FOR UPDATE OF b SKIP LOCKED`);
        ctx.count('tickets', tickets.length);
        for (const bug of tickets) {
          const [group] = await manager.query(
            `SELECT min(retention_due_at) AS due,count(*)::int AS count
            FROM bug_report_screenshots WHERE bug_report_id=$1 AND deleted_at IS NULL AND notified_at IS NULL AND retention_due_at<=now()`,
            [bug.id],
          );
          if (!group.count) continue;
          const sent = await this.notifications!.sendToUsers({
            title: 'Bug screenshots ready for deletion review',
            message: `${group.count} screenshot(s) have reached 30 days in Done/Closed. Review the ticket and confirm deletion; nothing is deleted automatically.`,
            severity: 'info',
            channel: 'in-app',
            entity: 'BugReport',
            entityId: bug.id,
            actionUrl: `/bug-reports?id=${bug.id}`,
            dedupeKey: `bug-shot-cleanup-${bug.id}-${new Date(group.due).getTime()}`,
            userIds: recipients.map((r) => r.id),
          });
          if (sent) {
            ctx.count('notified');
            await manager.query(
              `UPDATE bug_report_screenshots SET notified_at=clock_timestamp()
            WHERE bug_report_id=$1 AND deleted_at IS NULL AND notified_at IS NULL AND retention_due_at<=now()`,
              [bug.id],
            );
          }
        }
      });
    });
  }
}
