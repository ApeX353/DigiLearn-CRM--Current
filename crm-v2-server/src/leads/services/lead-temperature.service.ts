import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThanOrEqual, Repository } from 'typeorm';
import { Lead } from '../entities/lead.entity';
import { Activity } from '../../activities/entities/activity.entity';
import { LeadQualificationCriteria } from '../entities/lead-qualification-criteria.entity';

@Injectable()
export class LeadTemperatureService {
  private readonly logger = new Logger(LeadTemperatureService.name);

  constructor(
    @InjectRepository(Lead)
    private readonly leadRepository: Repository<Lead>,
    @InjectRepository(Activity)
    private readonly activityRepository: Repository<Activity>,
    @InjectRepository(LeadQualificationCriteria)
    private readonly qualificationRepository: Repository<LeadQualificationCriteria>,
  ) {}

  async calculateTemperature(leadId: string): Promise<{
    score: number;
    temperature: 'hot' | 'warm' | 'cold';
  }> {
    const lead = await this.leadRepository.findOne({
      where: { id: leadId },
      relations: ['school'],
    });

    if (!lead) {
      return { score: 0, temperature: 'cold' };
    }

    // ========================
    // Behavioral signals (60% weight)
    // ========================
    let behavioralScore = 0;

    // Activity count in last 7 days
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const recentActivityCount = await this.activityRepository.count({
      where: {
        lead_id: leadId,
        created_at: MoreThanOrEqual(sevenDaysAgo),
      },
    });

    // Cap at 20 activities for scoring
    const activityScore = Math.min(recentActivityCount / 10, 1) * 40;
    behavioralScore += activityScore;

    // Response rate: calls with outcome vs total calls
    const totalCalls = await this.activityRepository.count({
      where: { lead_id: leadId, type: 'call' as any },
    });
    const completedCalls = await this.activityRepository.count({
      where: { lead_id: leadId, type: 'call' as any, status: 'completed' as any },
    });
    const responseRate = totalCalls > 0 ? completedCalls / totalCalls : 0;
    behavioralScore += responseRate * 30;

    // Recency of last contact
    if (lead.last_contacted_at) {
      const daysSinceContact = Math.floor(
        (Date.now() - lead.last_contacted_at.getTime()) / (1000 * 60 * 60 * 24),
      );
      const recencyScore = Math.max(0, 30 - daysSinceContact * 2);
      behavioralScore += recencyScore;
    }

    // ========================
    // Fit signals (25% weight)
    // ========================
    let fitScore = 0;

    // School student count (larger = higher)
    const studentCount = (lead.school as any)?.student_count || 0;
    const sizeScore = Math.min(studentCount / 1000, 1) * 30;
    fitScore += sizeScore;

    // Estimated value
    const estimatedValue = Number(lead.estimated_value || 0);
    const valueScore = Math.min(estimatedValue / 50000, 1) * 40;
    fitScore += valueScore;

    // Qualification score
    const qualification = await this.qualificationRepository.findOne({
      where: { lead_id: leadId },
    });
    if (qualification) {
      const checklist = qualification.checklist as any;
      if (checklist && typeof checklist === 'object') {
        const values = Object.values(checklist);
        const trueCount = values.filter(Boolean).length;
        const qualScore = values.length > 0 ? (trueCount / values.length) * 30 : 0;
        fitScore += qualScore;
      }
    }

    // ========================
    // Time decay (15% penalty)
    // ========================
    let decayPenalty = 0;
    if (lead.last_action_at) {
      const daysSinceAction = Math.floor(
        (Date.now() - lead.last_action_at.getTime()) / (1000 * 60 * 60 * 24),
      );
      decayPenalty = (1 - Math.exp(-0.05 * daysSinceAction)) * 15;
    }

    // ========================
    // Final score
    // ========================
    const rawScore =
      behavioralScore * 0.6 + fitScore * 0.25 - decayPenalty;
    const score = Math.max(0, Math.min(100, Math.round(rawScore * 100) / 100));

    let temperature: 'hot' | 'warm' | 'cold';
    if (score >= 70) temperature = 'hot';
    else if (score >= 40) temperature = 'warm';
    else temperature = 'cold';

    // Update lead
    await this.leadRepository.update(leadId, {
      temperature,
      temperature_score: score,
      temperature_last_calculated: new Date(),
    });

    return { score, temperature };
  }

  async recalculate(leadId: string): Promise<void> {
    try {
      await this.calculateTemperature(leadId);
    } catch (error) {
      this.logger.error(
        `Failed to recalculate temperature for lead ${leadId}: ${error.message}`,
      );
    }
  }

  /**
   * Nightly full-portfolio temperature recalculation.
   *
   * Temperature is otherwise only recalculated when an activity is
   * created (ActivitiesService fires `recalculate()` fire-and-forget
   * on activity create). That means a lead which goes quiet never
   * re-scores: its time-decay (`last_action_at`) and contact-recency
   * (`last_contacted_at`) components freeze at the value they held at
   * the last activity — so stale leads never cool and reps keep
   * seeing inflated hot/warm scores. This sweep re-runs the
   * calculation for every non-terminal lead once a night so the decay
   * actually applies and prioritisation stays honest.
   *
   * Runs at 02:00 server time (off-peak). Terminal leads
   * (Disqualified / Converted) and soft-deleted leads are skipped.
   * Per-lead failures are isolated by `recalculate()`, so one bad row
   * never aborts the sweep.
   */
  @Cron('0 0 2 * * *')
  async handleNightlyTemperatureSweep(): Promise<void> {
    try {
      this.logger.log('Running nightly lead temperature sweep...');

      const rows = await this.leadRepository
        .createQueryBuilder('lead')
        .select('lead.id', 'id')
        .where('lead.deleted_at IS NULL')
        .andWhere('lead.status NOT IN (:...terminal)', {
          terminal: ['Disqualified', 'Converted'],
        })
        .getRawMany<{ id: string }>();

      let processed = 0;
      for (const row of rows) {
        await this.recalculate(row.id);
        processed++;
      }

      this.logger.log(
        `Nightly temperature sweep complete: ${processed} leads recalculated`,
      );
    } catch (error: any) {
      this.logger.error(
        `Nightly temperature sweep failed: ${error?.message}`,
        error?.stack,
      );
    }
  }
}
