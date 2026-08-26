import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike } from 'typeorm';
import {
  paginate,
  Pagination,
  IPaginationOptions,
} from 'nestjs-typeorm-paginate';
import { ActivityLog } from './entities/activity-log.entity';
import { CreateActivityLogDto } from './dto/create-activity-log.dto';
import { QueryActivityLogDto } from './dto/query-activity-log.dto';
import { ActivityAction } from './enums/activity-action.enum';

@Injectable()
export class ActivityLogsService {
  constructor(
    @InjectRepository(ActivityLog)
    private activityLogRepository: Repository<ActivityLog>,
  ) {}

  async log(dto: CreateActivityLogDto): Promise<ActivityLog> {
    const activityLog = this.activityLogRepository.create(dto);
    return this.activityLogRepository.save(activityLog);
  }

  async logCreate(
    entity: string,
    entityId: string,
    newValues: Record<string, any>,
    actionedBy: string,
    summary?: string,
    metadata?: Record<string, any>,
  ): Promise<ActivityLog> {
    return this.log({
      entity,
      entity_id: entityId,
      action: ActivityAction.CREATE,
      summary: summary || `Created ${entity}`,
      actioned_by: actionedBy,
      new_values: newValues,
      metadata,
    });
  }

  async logUpdate(
    entity: string,
    entityId: string,
    oldValues: Record<string, any>,
    newValues: Record<string, any>,
    actionedBy: string,
    summary?: string,
    metadata?: Record<string, any>,
  ): Promise<ActivityLog> {
    return this.log({
      entity,
      entity_id: entityId,
      action: ActivityAction.UPDATE,
      summary: summary || `Updated ${entity}`,
      actioned_by: actionedBy,
      old_values: oldValues,
      new_values: newValues,
      metadata,
    });
  }

  async logDelete(
    entity: string,
    entityId: string,
    oldValues: Record<string, any>,
    actionedBy: string,
    summary?: string,
    metadata?: Record<string, any>,
  ): Promise<ActivityLog> {
    return this.log({
      entity,
      entity_id: entityId,
      action: ActivityAction.DELETE,
      summary: summary || `Deleted ${entity}`,
      actioned_by: actionedBy,
      old_values: oldValues,
      metadata,
    });
  }

  async logView(
    entity: string,
    entityId: string,
    actionedBy: string,
    summary?: string,
    metadata?: Record<string, any>,
  ): Promise<ActivityLog> {
    return this.log({
      entity,
      entity_id: entityId,
      action: ActivityAction.VIEW,
      summary: summary || `Viewed ${entity}`,
      actioned_by: actionedBy,
      metadata,
    });
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
