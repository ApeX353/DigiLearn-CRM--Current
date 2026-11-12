import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { Deal, DealCloseStatus } from './entities/deal.entity';
import { DealStageHistory } from './entities/deal-stage-history.entity';
import { Stage } from '../pipelines/entities/stage.entity';
import {
  ActivityOutcome,
  ActivityStatus,
  ActivityType,
} from '../activities/entities/activity.entity';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import { toDealProbability } from '../common/transformers/to-deal-probability';

/**
 * The three stages a rep's recorded action can prove on its own:
 * booking a demo, delivering it, and sending a quote. Everything
 * later in the pipeline (committee, PO, delivery) has no in-CRM
 * action that is the event itself, so those moves stay manual.
 */
export type AutoStageTarget = 'demo_booked' | 'demo_completed' | 'quote_submitted';

const TARGET_MATCHERS: Record<AutoStageTarget, (normalized: string) => boolean> =
  {
    demo_booked: (n) => /\bdemo\b/.test(n) && /\b(booked|scheduled)\b/.test(n),
    demo_completed: (n) =>
      /\bdemo\b/.test(n) && /\b(completed|held|done|delivered)\b/.test(n),
    quote_submitted: (n) =>
      /\b(quote|quotation|proposal)\b/.test(n) &&
      /\b(submitted|sent|issued)\b/.test(n),
  };

/**
 * DealStageAutomationService — the stage board stops waiting for the rep.
 *
 * Recording rule 3 says "move the deal when the thing happens". Reps
 * forget; the system shouldn't. When an action that IS the stage event
 * gets recorded (a demo activity, a quote marked Sent), the deal is
 * advanced to the matching stage automatically.
 *
 * Deliberate limits, in order of importance:
 *   - forward-only: an auto-move never drags a deal backward, so a
 *     late-logged demo can't undo Committee Review;
 *   - closed deals are never touched;
 *   - a failed auto-move never fails the rep's action — the activity or
 *     quote saves regardless, and the miss is logged;
 *   - every move writes the same DealStageHistory + changelog rows a
 *     manual move writes, attributed to the acting rep with an "Auto:"
 *     note, so the deal timeline shows why the card moved.
 *
 * Stages carry no machine key, so targets are matched by normalized
 * name — the same convention assertStageGateEvidence already relies on.
 *
 * This service lives in its own module (DealStageAutomationModule) so
 * Activities/Quotes can consume it without importing DealsModule, which
 * would cycle (DealsModule → QuotesModule).
 */
@Injectable()
export class DealStageAutomationService {
  private readonly logger = new Logger(DealStageAutomationService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly activityLogsService: ActivityLogsService,
  ) {}

  /**
   * Advance `dealId` to the `target` stage if — and only if — that is a
   * forward move for an ongoing deal. No-ops (deal closed, already at or
   * past the stage, no matching stage in the pipeline) return false.
   * Never throws: the triggering action must succeed even if this fails.
   *
   * ALWAYS runs in its own transaction, and callers must invoke it
   * AFTER their own transaction has committed. It deliberately takes no
   * EntityManager: joining the caller's transaction would mean a failure
   * here (a bad stage probability, a deadlock) poisons that transaction,
   * and because this method swallows errors the caller would commit —
   * which Postgres turns into a silent ROLLBACK — losing the rep's
   * activity or quote while still returning 201. Automation is a
   * side-effect; it must never be able to discard the record that
   * triggered it.
   */
  async advance(
    dealId: string,
    target: AutoStageTarget,
    actorUserId: string,
    reason: string,
  ): Promise<boolean> {
    try {
      const moved = await this.dataSource.transaction((m) =>
        this.advanceInTransaction(m, dealId, target, actorUserId, reason),
      );

      if (moved) {
        // Lowercase 'deal' — the entity key every other deal log uses and
        // the one the deal timeline queries. 'Deal' would write a row the
        // UI can never read (varchar equality is case-sensitive).
        await this.activityLogsService.logUpdate(
          'deal',
          dealId,
          { stage: moved.from },
          { stage: moved.to },
          actorUserId,
          `Stage auto-advanced to ${moved.to} — ${reason}`,
          { automated: true },
        );
      }
      return !!moved;
    } catch (err) {
      this.logger.warn(
        `auto-advance to ${target} failed for deal ${dealId}: ${
          (err as Error)?.message
        }`,
      );
      return false;
    }
  }

  private async advanceInTransaction(
    manager: EntityManager,
    dealId: string,
    target: AutoStageTarget,
    actorUserId: string,
    reason: string,
  ): Promise<{ from: string; to: string } | null> {
    const deal = await manager.findOne(Deal, {
      where: { id: dealId },
      relations: ['current_stage'],
    });
    if (!deal || deal.closeStatus !== DealCloseStatus.ONGOING) return null;

    const stages = await manager.find(Stage, {
      where: { pipeline_id: deal.pipeline_id, is_active: true },
      order: { order: 'ASC' },
    });
    const matches = TARGET_MATCHERS[target];
    const targetStage = stages.find((s) =>
      matches(this.normalizeStageName(s.name)),
    );
    const currentStage =
      deal.current_stage ??
      stages.find((s) => s.id === deal.current_stage_id) ??
      null;
    if (!targetStage || !currentStage) return null;
    if (Number(targetStage.order) <= Number(currentStage.order)) return null;

    const maxPos = await manager
      .createQueryBuilder(Deal, 'd')
      .select('MAX(d.position)', 'maxPos')
      .where('d.current_stage_id = :sid', { sid: targetStage.id })
      .getRawOne<{ maxPos: number | null }>();

    const now = new Date();
    const since = deal.currentStageSince
      ? new Date(deal.currentStageSince)
      : null;
    const timeInStage = since
      ? Math.max(
          0,
          Math.round((now.getTime() - since.getTime()) / 86_400_000),
        )
      : null;
    const slaDays = Number(currentStage.sla_days) || 0;
    const slaDeadlineWas =
      since && slaDays > 0
        ? new Date(since.getTime() + slaDays * 86_400_000)
        : null;

    await manager.update(
      Deal,
      { id: deal.id },
      {
        current_stage_id: targetStage.id,
        currentStatus: targetStage.name,
        currentStageSince: now,
        // stages.probability is numeric(5,2) but deals.probability is an
        // integer column — a stage set to 25.5 would otherwise throw
        // "invalid input syntax for type integer" mid-transaction.
        probability: toDealProbability(targetStage.probability),
        position: (maxPos?.maxPos ?? 0) + 1000,
        sla_breached: false,
        last_breached_at: null,
      },
    );
    await manager.save(
      DealStageHistory,
      manager.create(DealStageHistory, {
        id: uuidv4(),
        dealId: deal.id,
        fromStatus: currentStage.name,
        toStatus: targetStage.name,
        movedAt: now,
        movedBy: actorUserId,
        timeInStage: timeInStage ?? undefined,
        slaDeadlineWas: slaDeadlineWas ?? undefined,
        slaCompliant: slaDeadlineWas ? now <= slaDeadlineWas : true,
        notes: `Auto: ${reason}`,
      }),
    );

    return { from: currentStage.name, to: targetStage.name };
  }

  private normalizeStageName(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  }
}

/**
 * Outcomes that mean the demo did not actually take place. The rep's
 * completion dialog offers the pipeline vocabulary (successful,
 * rescheduled, no_response, …) — NOT the demo_* enum values, which no
 * client path ever sends — so a guard written against demo_* alone would
 * be dead code and a postponed demo would advance the board.
 *
 * "Unsuccessful" is deliberately absent: a demo that happened and landed
 * badly is still a demo that happened.
 */
const DEMO_DID_NOT_HAPPEN: ReadonlySet<string> = new Set([
  ActivityOutcome.RESCHEDULED,
  ActivityOutcome.NO_RESPONSE,
  ActivityOutcome.DEMO_CANCELLED,
  ActivityOutcome.DEMO_RESCHEDULED,
]);

/**
 * Which stage a demo activity proves, or null when it proves nothing.
 *
 * Mirrors deriveDemoEffectsForLead, the existing source of truth for demo
 * semantics: only a COMPLETED demo *delivery* means the demo happened. A
 * demo booking — even one marked done, which just means "the booking call
 * is finished" — proves only that a demo is booked. A follow-up implies
 * the demo already ran.
 */
export function demoStageTarget(
  type: ActivityType,
  status: ActivityStatus,
  outcome?: ActivityOutcome | null,
): AutoStageTarget | null {
  if (outcome && DEMO_DID_NOT_HAPPEN.has(outcome)) return null;

  switch (type) {
    case ActivityType.DEMO_FOLLOWUP:
      return 'demo_completed';
    case ActivityType.DEMO_DELIVERY:
      return status === ActivityStatus.COMPLETED
        ? 'demo_completed'
        : 'demo_booked';
    case ActivityType.DEMO_BOOKING:
      return 'demo_booked';
    default:
      return null;
  }
}
