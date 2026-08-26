import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, Not, Between } from 'typeorm';
import {
  LeadEscalation,
  EscalationReason,
  EscalationResolution,
} from '../entities/lead-escalation.entity';
import { ActivityLogsService } from '../../activity-logs/activity-logs.service';

/**
 * Lead-escalation service.
 *
 *   `escalate()`  — rep opens an escalation on a stuck lead.
 *   `resolve()`   — manager records resolution (coach / reassign / …).
 *   `list()`      — manager queue with open vs resolved filter.
 *   `byLead()`    — history on a single lead's detail page.
 *
 * Every transition is written to the activity-logs stream so the
 * compliance dashboards (Phase 10) and the lead audit tab both see
 * the same timeline.
 */
@Injectable()
export class LeadEscalationService {
  constructor(
    @InjectRepository(LeadEscalation)
    private readonly repo: Repository<LeadEscalation>,
    private readonly activityLogs: ActivityLogsService,
  ) {}

  async escalate(
    leadId: string,
    userId: string,
    payload: {
      reason: EscalationReason;
      notes?: string;
      blockers?: string;
    },
  ): Promise<LeadEscalation> {
    const row = this.repo.create({
      lead_id: leadId,
      escalated_by_id: userId,
      reason: payload.reason,
      notes: payload.notes ?? null,
      blockers: payload.blockers ?? null,
    });
    const saved = await this.repo.save(row);
    await this.activityLogs.logCreate(
      'LeadEscalation',
      saved.id,
      { lead_id: leadId, reason: payload.reason },
      userId,
    );
    return saved;
  }

  async resolve(
    escalationId: string,
    userId: string,
    payload: {
      resolution: EscalationResolution;
      resolution_notes?: string;
    },
  ): Promise<LeadEscalation> {
    const row = await this.repo.findOne({ where: { id: escalationId } });
    if (!row) throw new NotFoundException('Escalation not found');
    if (row.resolved_at) {
      // Idempotent: manager clicks twice, we don't overwrite history.
      return row;
    }
    row.resolution = payload.resolution;
    row.resolution_notes = payload.resolution_notes ?? null;
    row.resolved_by_id = userId;
    row.resolved_at = new Date();
    const saved = await this.repo.save(row);
    await this.activityLogs.logUpdate(
      'LeadEscalation',
      saved.id,
      { resolved: false },
      { resolved: true, resolution: payload.resolution },
      userId,
      `Resolved with ${payload.resolution}`,
    );
    return saved;
  }

  async byLead(leadId: string): Promise<LeadEscalation[]> {
    return this.repo.find({
      where: { lead_id: leadId },
      order: { created_at: 'DESC' },
      relations: ['escalated_by', 'resolved_by'],
    });
  }

  async list(params: {
    status?: 'open' | 'resolved' | 'all';
    from?: Date;
    to?: Date;
  }): Promise<LeadEscalation[]> {
    const status = params.status ?? 'open';
    let where: Record<string, unknown> = {};
    if (status === 'open') where = { ...where, resolved_at: IsNull() };
    if (status === 'resolved') where = { ...where, resolved_at: Not(IsNull()) };
    if (params.from && params.to) {
      where = { ...where, created_at: Between(params.from, params.to) };
    }

    return this.repo.find({
      where: where as any,
      order: { created_at: 'DESC' },
      relations: ['escalated_by', 'resolved_by', 'lead'],
      take: 200,
    });
  }
}
