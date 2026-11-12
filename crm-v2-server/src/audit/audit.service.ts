import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from './entities/audit-log.entity';
import { getAuditContext } from './audit-context';

@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(AuditLog)
    private readonly auditLogRepository: Repository<AuditLog>,
  ) {}

  async log(
    entityType: string,
    entityId: string,
    action: 'create' | 'update' | 'delete' | 'download',
    changes?: Array<{ field: string; old_value: any; new_value: any }>,
    userId?: string,
    ipAddress?: string,
  ): Promise<AuditLog> {
    const ctx = getAuditContext();
    const log = this.auditLogRepository.create({
      entity_type: entityType,
      entity_id: entityId,
      action,
      changes: changes || null,
      user_id: userId || ctx.userId,
      ip_address: ipAddress || ctx.ipAddress,
    });
    return this.auditLogRepository.save(log);
  }

  async findByEntity(
    entityType: string,
    entityId: string,
    page = 1,
    limit = 20,
  ) {
    const [items, total] = await this.auditLogRepository.findAndCount({
      where: { entity_type: entityType, entity_id: entityId },
      relations: ['user'],
      order: { created_at: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      items: items.map((item) => ({
        ...item,
        user: item.user
          ? {
              id: item.user.id,
              first_name: item.user.first_name,
              last_name: item.user.last_name,
              email: item.user.email,
            }
          : null,
      })),
      meta: {
        totalItems: total,
        itemCount: items.length,
        itemsPerPage: limit,
        totalPages: Math.ceil(total / limit),
        currentPage: page,
      },
    };
  }

  async findAll(
    query: {
      entity_type?: string;
      entity_id?: string;
      user_id?: string;
      action?: string;
      page?: number;
      limit?: number;
    } = {},
  ) {
    const { page = 1, limit = 20, ...filters } = query;

    const qb = this.auditLogRepository
      .createQueryBuilder('audit')
      .leftJoinAndSelect('audit.user', 'user')
      .orderBy('audit.created_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (filters.entity_type) {
      qb.andWhere('audit.entity_type = :entityType', {
        entityType: filters.entity_type,
      });
    }
    if (filters.entity_id) {
      qb.andWhere('audit.entity_id = :entityId', {
        entityId: filters.entity_id,
      });
    }
    if (filters.user_id) {
      qb.andWhere('audit.user_id = :userId', { userId: filters.user_id });
    }
    if (filters.action) {
      qb.andWhere('audit.action = :action', { action: filters.action });
    }

    const [items, total] = await qb.getManyAndCount();

    return {
      items,
      meta: {
        totalItems: total,
        itemCount: items.length,
        itemsPerPage: limit,
        totalPages: Math.ceil(total / limit),
        currentPage: page,
      },
    };
  }
}
