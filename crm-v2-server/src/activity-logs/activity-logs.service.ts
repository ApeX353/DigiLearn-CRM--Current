import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike, EntityManager, SelectQueryBuilder } from 'typeorm';
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
import {
  auditCategory,
  auditReference,
  auditTitle,
  emptyLookups,
  financialClause,
  FINANCIAL_ENTITIES,
  type AuditEvent,
} from './audit-presentation';

const FINANCIAL_PARAMS = { financialEntities: FINANCIAL_ENTITIES };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const utcText = (value: string) =>
  new Date(value).toISOString().replace('T', ' ').replace('Z', '');

/** Fixed SQL only: no part of these comes from the request. */
const EVENT_CLAUSES: Record<AuditEvent, string> = {
  cancelled: `log.new_values->>'status' = 'Cancelled'`,
  status_changed: `log.new_values->>'status' IS DISTINCT FROM log.old_values->>'status' AND log.new_values->>'status' IS NOT NULL AND log.old_values->>'status' IS NOT NULL`,
  reassigned: `log.new_values->>'assigned_to' IS DISTINCT FROM log.old_values->>'assigned_to' AND (log.new_values->'assigned_to' IS NOT NULL OR log.old_values->'assigned_to' IS NOT NULL)`,
  payment_recorded: `LOWER(log.entity) = 'payment' AND log.action = 'create'`,
  deal_value_changed: `LOWER(log.entity) = 'deal' AND log.new_values->>'value' IS DISTINCT FROM log.old_values->>'value' AND log.new_values->>'value' IS NOT NULL AND log.old_values->>'value' IS NOT NULL`,
};

/** A query with the caller's access applied. Set by the controller, never read from a request. */
export type ScopedAuditQuery = QueryActivityLogDto & { allowed_entities?: readonly string[] };

/** Who owns a record, for the entities with an owner. Table names are fixed here. */
const RECORD_OWNERS: Record<string, { table: string; column: string }> = {
  lead: { table: 'leads', column: 'assigned_to' },
  deal: { table: 'deals', column: 'assigned_to' },
  invoice: { table: 'invoices', column: 'owner_id' },
  quote: { table: 'quotes', column: 'owner_id' },
};

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
    //
    // Since 14 Oct 2026 the request context also carries the acting user
    // (RequestContextInterceptor) and the request id, so a caller with no
    // user id to hand (settings, rbac, users) still gets the right actor, and
    // every row can be joined to the diagnostics trail by request_id or job.
    const ctx = getAuditContext();
    const repository = manager
      ? manager.getRepository(ActivityLog)
      : this.activityLogRepository;
    const trace: Record<string, unknown> = {};
    if (ctx.requestId) trace.request_id = ctx.requestId;
    if (ctx.ipAddress) trace.ip = ctx.ipAddress;
    if (ctx.userAgent) trace.user_agent = ctx.userAgent;
    if (ctx.jobRunId) trace.job_run_id = ctx.jobRunId;
    if (ctx.jobName) trace.job = ctx.jobName;
    // Where in the browser this came from (screen, open form, last button),
    // so the Day log can say "from the Activities page, New Task form".
    if (ctx.client) trace.client = ctx.client;
    const activityLog = repository.create({
      ...dto,
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

  async findAll(query: ScopedAuditQuery): Promise<Pagination<ActivityLog>> {
    const page = parseInt(query.page || '1', 10);
    const limit = parseInt(query.limit || '20', 10);

    const options: IPaginationOptions = { page, limit };

    const queryBuilder = this.activityLogRepository
      .createQueryBuilder('log')
      .leftJoinAndSelect('log.user', 'user')
      .orderBy('log.created_at', 'DESC')
      // Rows can share a timestamp; without this a page boundary could repeat one.
      .addOrderBy('log.id', 'DESC');

    this.applyFilters(queryBuilder, query);
    if (query.category === 'financial') {
      queryBuilder.andWhere(financialClause('log'), FINANCIAL_PARAMS);
    } else if (query.category === 'other') {
      queryBuilder.andWhere(`NOT ${financialClause('log')}`, FINANCIAL_PARAMS);
    }

    const result = await paginate<ActivityLog>(queryBuilder, options);
    await this.present(result.items);
    return result;
  }

  /** The tab totals for the same filters; the category filter itself does not apply. */
  async countByCategory(query: ScopedAuditQuery) {
    const queryBuilder = this.activityLogRepository
      .createQueryBuilder('log')
      .select('COUNT(*)', 'all')
      .addSelect(`COUNT(*) FILTER (WHERE ${financialClause('log')})`, 'financial')
      .setParameters(FINANCIAL_PARAMS);
    this.applyFilters(queryBuilder, query);
    const row = await queryBuilder.getRawOne<{ all: string; financial: string }>();
    const all = Number(row?.all ?? 0);
    const financial = Number(row?.financial ?? 0);
    return { all, financial, other: all - financial };
  }

  /** The people a caller may filter by, from the rows that caller may read. */
  async findActors(onlyUserId?: string, allowedEntities?: readonly string[]) {
    const rows: Array<{ id: string; first_name: string; last_name: string; email: string }> =
      await this.activityLogRepository.manager.query(
        `SELECT u.id, u.first_name, u.last_name, u.email FROM users u
          WHERE u.id = ANY(
            SELECT DISTINCT actioned_by FROM activity_logs
             WHERE actioned_by IS NOT NULL AND ($1::uuid IS NULL OR actioned_by = $1::uuid)
               AND ($2::text[] IS NULL OR LOWER(entity) = ANY($2::text[])))
          ORDER BY u.first_name, u.last_name`,
        [onlyUserId ?? null, allowedEntities ?? null],
      );
    return rows.map(({ id, first_name, last_name, email }) => ({
      id,
      name: [first_name, last_name].filter(Boolean).join(' ').trim() || email,
    }));
  }

  private applyFilters(
    queryBuilder: SelectQueryBuilder<ActivityLog>,
    query: ScopedAuditQuery,
  ): void {
    if (query.allowed_entities) {
      queryBuilder.andWhere('LOWER(log.entity) IN (:...allowedEntities)', {
        allowedEntities: query.allowed_entities,
      });
    }

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

    // created_at holds UTC with no zone, so the bound is passed as UTC text. A Date
    // parameter would be sent in the process's own zone and silently shift the range.
    if (query.start_date) {
      queryBuilder.andWhere('log.created_at >= :startDate', {
        startDate: utcText(query.start_date),
      });
    }
    if (query.end_date) {
      queryBuilder.andWhere('log.created_at <= :endDate', {
        endDate: utcText(query.end_date),
      });
    }

    if (query.event) {
      queryBuilder.andWhere(EVENT_CLAUSES[query.event]);
    }

    const record = query.record?.trim();
    if (record && UUID.test(record)) {
      queryBuilder.andWhere('log.entity_id = :recordId', { recordId: record });
    } else if (record) {
      queryBuilder.andWhere(
        `(log.summary ILIKE :record
          OR log.entity_id IN (SELECT id FROM invoices WHERE invoice_number ILIKE :record)
          OR log.entity_id IN (SELECT id FROM quotes WHERE quote_number ILIKE :record)
          OR log.entity_id IN (SELECT id FROM payments WHERE reference ILIKE :record
            OR invoice_id IN (SELECT id FROM invoices WHERE invoice_number ILIKE :record)))`,
        { record: `%${record.replace(/[\\%_]/g, '\\$&')}%` },
      );
    }
  }

  /** Adds what the page shows beside each row. Reads only; nothing stored changes. */
  private async present(rows: ActivityLog[]): Promise<void> {
    const lookups = emptyLookups();
    const manager = this.activityLogRepository.manager;
    const idsOf = (entity: string) =>
      rows.filter((r) => r.entity.toLowerCase() === entity).map((r) => r.entity_id);
    const uuids = (values: unknown[]) => [
      ...new Set(values.filter((v): v is string => typeof v === 'string' && UUID.test(v))),
    ];

    const paymentRows = rows.filter((r) => r.entity.toLowerCase() === 'payment');
    const invoiceIds = uuids([
      ...idsOf('invoice'),
      ...paymentRows.flatMap((r) => [r.new_values?.invoice_id, r.old_values?.invoice_id]),
    ]);
    if (invoiceIds.length) {
      const found: Array<{ id: string; invoice_number: string; school: string | null; deal: string | null }> =
        await manager.query(
          `SELECT i.id, i.invoice_number, s.name AS school, d.title AS deal FROM invoices i
             LEFT JOIN schools s ON s.id = i.school_id
             LEFT JOIN deals d ON d.id = i.deal_id WHERE i.id = ANY($1::uuid[])`,
          [invoiceIds],
        );
      found.forEach(({ id, invoice_number, school, deal }) => {
        lookups.references.set(id, invoice_number);
        lookups.context.set(id, { school, deal });
      });
    }
    const quoteIds = uuids(idsOf('quote'));
    if (quoteIds.length) {
      const found: Array<{ id: string; quote_number: string; school: string | null; deal: string | null }> =
        await manager.query(
          `SELECT q.id, q.quote_number, s.name AS school, d.title AS deal FROM quotes q
             LEFT JOIN schools s ON s.id = q.school_id
             LEFT JOIN deals d ON d.id = q.deal_id WHERE q.id = ANY($1::uuid[])`,
          [quoteIds],
        );
      found.forEach(({ id, quote_number, school, deal }) => {
        lookups.references.set(id, quote_number);
        lookups.context.set(id, { school, deal });
      });
    }
    const paymentIds = uuids(paymentRows.map((r) => r.entity_id));
    if (paymentIds.length) {
      const found: Array<{ id: string; reference: string | null; invoice_number: string | null }> =
        await manager.query(
          `SELECT p.id, p.reference, i.invoice_number FROM payments p
             LEFT JOIN invoices i ON i.id = p.invoice_id WHERE p.id = ANY($1::uuid[])`,
          [paymentIds],
        );
      found.forEach(({ id, reference, invoice_number }) =>
        lookups.payments.set(id, { reference, invoice_number }),
      );
    }
    const userIds = uuids(
      rows.flatMap((r) => [r.old_values?.assigned_to, r.new_values?.assigned_to]),
    );
    if (userIds.length) {
      const found: Array<{ id: string; first_name: string; last_name: string }> = await manager.query(
        `SELECT id, first_name, last_name FROM users WHERE id = ANY($1::uuid[])`,
        [userIds],
      );
      found.forEach((u) =>
        lookups.users.set(u.id, [u.first_name, u.last_name].filter(Boolean).join(' ').trim()),
      );
    }

    for (const row of rows) {
      const payment = lookups.payments.get(row.entity_id);
      const context =
        lookups.context.get(row.entity_id) ??
        lookups.context.get(row.new_values?.invoice_id ?? row.old_values?.invoice_id);
      Object.assign(row, {
        category: auditCategory(row),
        title: auditTitle(row, lookups),
        reference: payment?.reference ?? auditReference(row, lookups),
        school_name: context?.school ?? null,
        deal_title: context?.deal ?? null,
      });
    }
  }

  /**
   * @param scopeUserId set for a caller who may not read every record's history:
   *   they get the whole trail only on a record they own, and otherwise only what
   *   they did themselves, so a history never reveals a colleague's record.
   */
  async findByEntity(
    entity: string,
    entityId: string,
    scopeUserId?: string,
  ): Promise<ActivityLog[]> {
    // AUD1: the history trail is written with inconsistent casing —
    // deals log as 'deal' while leads log as 'Lead' — and the record
    // pages ask for 'Deal'/'Lead'. An exact match therefore returned
    // nothing for deals, which is why the Audit History tab read empty.
    // Match case-insensitively so every casing resolves to the same
    // trail regardless of how a given writer spelled the entity.
    const owned =
      scopeUserId && (await this.recordOwner(entity, entityId)) === scopeUserId;
    return this.activityLogRepository.find({
      where: {
        entity: ILike(entity.replace(/[\\%_]/g, '\\$&')),
        entity_id: entityId,
        ...(scopeUserId && !owned ? { actioned_by: scopeUserId } : {}),
      },
      relations: ['user'],
      order: { created_at: 'DESC' },
    });
  }

  private async recordOwner(entity: string, entityId: string): Promise<string | null> {
    const source = RECORD_OWNERS[entity.toLowerCase()];
    if (!source) return null;
    const rows: Array<{ owner: string | null }> = await this.activityLogRepository.manager.query(
      `SELECT ${source.column} AS owner FROM ${source.table} WHERE id = $1`,
      [entityId],
    );
    return rows[0]?.owner ?? null;
  }
}
