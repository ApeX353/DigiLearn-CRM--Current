import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike, EntityManager } from 'typeorm';
import {
  paginate,
  Pagination,
  IPaginationOptions,
} from 'nestjs-typeorm-paginate';
import { ActivityLog } from './entities/activity-log.entity';
import { CreateActivityLogDto } from './dto/create-activity-log.dto';
import { QueryActivityLogDto } from './dto/query-activity-log.dto';
import { ActivityAction } from './enums/activity-action.enum';
import { getAuditContext } from '../audit/audit-context';

@Injectable()
export class ActivityLogsService {
  constructor(
    @InjectRepository(ActivityLog)
    private activityLogRepository: Repository<ActivityLog>,
  ) {}

  async log(
    dto: CreateActivityLogDto,
    manager?: EntityManager,
  ): Promise<ActivityLog> {
    // Stamped here, not at the call site: every logCreate/logUpdate/logDelete
    // in the codebase goes through this method, so a script cannot be recorded
    // as a person by a caller forgetting to mention it.
    const ctx = getAuditContext();
    const repository = manager
      ? manager.getRepository(ActivityLog)
      : this.activityLogRepository;
    // Production lineage: only what System Health needs — the request id
    // (ties the row to an error reference) and where in the browser the
    // request came from (screen, open form, last button), so the Day log
    // can say "from the Activities page, New Task form". The wider audit
    // metadata (ip, user agent, job) stays on staging with Phase 4.
    const trace: Record<string, unknown> = {};
    if (ctx.requestId) trace.request_id = ctx.requestId;
    if (ctx.jobRunId) trace.job_run_id = ctx.jobRunId;
    if (ctx.client) trace.client = ctx.client;
    const activityLog = repository.create({
      ...dto,
      // System recalculations pass null; the person on the request is still the
      // actor when there is one, and a job leaves it empty (source says script).
      actioned_by: dto.actioned_by ?? ctx.userId ?? undefined,
      metadata: Object.keys(trace).length ? { ...(dto.metadata ?? {}), ...trace } : dto.metadata,
      source: ctx.source,
      automation_reason: ctx.automationReason,
    });
    return repository.save(activityLog);
  }

  async logCreate(
    entity: string,
    entityId: string,
    newValues: Record<string, any>,
    actionedBy: string | null | undefined,
    summary?: string,
    metadata?: Record<string, any>,
    manager?: EntityManager,
  ): Promise<ActivityLog> {
    return this.log(
      {
        entity,
        entity_id: entityId,
        action: ActivityAction.CREATE,
        summary: summary || `Created ${entity}`,
        actioned_by: actionedBy ?? undefined,
        new_values: newValues,
        metadata,
      },
      manager,
    );
  }

  async logUpdate(
    entity: string,
    entityId: string,
    oldValues: Record<string, any>,
    newValues: Record<string, any>,
    actionedBy: string | null | undefined,
    summary?: string,
    metadata?: Record<string, any>,
    manager?: EntityManager,
  ): Promise<ActivityLog> {
    return this.log(
      {
        entity,
        entity_id: entityId,
        action: ActivityAction.UPDATE,
        summary: summary || `Updated ${entity}`,
        actioned_by: actionedBy ?? undefined,
        old_values: oldValues,
        new_values: newValues,
        metadata,
      },
      manager,
    );
  }

  async logDelete(
    entity: string,
    entityId: string,
    oldValues: Record<string, any>,
    actionedBy: string | null | undefined,
    summary?: string,
    metadata?: Record<string, any>,
    manager?: EntityManager,
  ): Promise<ActivityLog> {
    return this.log(
      {
        entity,
        entity_id: entityId,
        action: ActivityAction.DELETE,
        summary: summary || `Deleted ${entity}`,
        actioned_by: actionedBy ?? undefined,
        old_values: oldValues,
        metadata,
      },
      manager,
    );
  }

  async logView(
    entity: string,
    entityId: string,
    actionedBy: string | null | undefined,
    summary?: string,
    metadata?: Record<string, any>,
    manager?: EntityManager,
  ): Promise<ActivityLog> {
    return this.log(
      {
        entity,
        entity_id: entityId,
        action: ActivityAction.VIEW,
        summary: summary || `Viewed ${entity}`,
        actioned_by: actionedBy ?? undefined,
        metadata,
      },
      manager,
    );
  }

  async findAll(query: QueryActivityLogDto): Promise<Pagination<ActivityLog>> {
    const page = parseInt(query.page || '1', 10);
    const limit = parseInt(query.limit || '20', 10);

    const options: IPaginationOptions = { page, limit };

    const queryBuilder = this.activityLogRepository
      .createQueryBuilder('log')
      .leftJoinAndSelect('log.user', 'user')
      .orderBy('log.created_at', 'DESC');

    if (query.entity) {
      queryBuilder.andWhere('log.entity = :entity', { entity: query.entity });
    }

    if (query.entity_id) {
      queryBuilder.andWhere('log.entity_id = :entityId', {
        entityId: query.entity_id,
      });
    }

    if (query.action) {
      queryBuilder.andWhere('log.action = :action', { action: query.action });
    }

    if (query.actioned_by) {
      queryBuilder.andWhere('log.actioned_by = :actionedBy', {
        actionedBy: query.actioned_by,
      });
    }

    if (query.start_date && query.end_date) {
      queryBuilder.andWhere(
        'log.created_at BETWEEN :startDate AND :endDate',
        {
          startDate: new Date(query.start_date),
          endDate: new Date(query.end_date),
        },
      );
    } else if (query.start_date) {
      queryBuilder.andWhere('log.created_at >= :startDate', {
        startDate: new Date(query.start_date),
      });
    } else if (query.end_date) {
      queryBuilder.andWhere('log.created_at <= :endDate', {
        endDate: new Date(query.end_date),
      });
    }

    return paginate<ActivityLog>(queryBuilder, options);
  }

  async findByEntity(entity: string, entityId: string): Promise<ActivityLog[]> {
    // AUD1: the history trail is written with inconsistent casing —
    // deals log as 'deal' while leads log as 'Lead' — and the record
    // pages ask for 'Deal'/'Lead'. An exact match therefore returned
    // nothing for deals, which is why the Audit History tab read empty.
    // Match case-insensitively so every casing resolves to the same
    // trail regardless of how a given writer spelled the entity.
    return this.activityLogRepository.find({
      where: { entity: ILike(entity), entity_id: entityId },
      relations: ['user'],
      order: { created_at: 'DESC' },
    });
  }
}
