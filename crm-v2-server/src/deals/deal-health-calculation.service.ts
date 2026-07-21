import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager, MoreThanOrEqual } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { Deal } from './entities/deal.entity';
import { DealCompetitor } from './entities/deal-competitor.entity';
import { DealHealthHistory } from './entities/deal-health-history.entity';
import { Lead } from '../leads/entities/lead.entity';
import { Stage } from '../pipelines/entities/stage.entity';
import {
  DecisionRole,
  InfluenceLevel,
} from '../leads/entities/lead-stakeholders.entity';

export interface DealHealthScore {
  score: number;
  factors: {
    stakeholderEngagement: number;
    timing: number;
    competition: number;
    budget: number;
  };
  lastCalculated: string;
}

export interface DealSlaStatus {
  slaDays: number;
  daysInStage: number;
  dueDate: Date | null;
  isBreached: boolean;
  remainingDays: number | null;
}

export interface HealthCalculationParams {
  dealId: string;
  userId?: string | null;
  manager?: EntityManager;
}

@Injectable()
export class DealHealthCalculationService {
  constructor(private readonly dataSource: DataSource) {}

  private getManager(manager?: EntityManager): EntityManager {
    return manager ?? this.dataSource.manager;
  }

  /**
   * Calculate stakeholder engagement score (0-100)
   * Factors:
   * - Number of stakeholders mapped
   * - Presence of decision makers and champions
   * - Engagement level (approximated via influence_level)
   * - Recent contact (approximated via lead.last_contacted_at)
   */
  async calculateStakeholderEngagement(
    dealId: string,
    manager?: EntityManager,
  ): Promise<number> {
    const entityManager = this.getManager(manager);
    const dealRepo = entityManager.getRepository(Deal);
    const leadRepo = entityManager.getRepository(Lead);

    const deal = await dealRepo.findOne({ where: { id: dealId } });
    if (!deal?.lead_id) return 0;

    const lead = await leadRepo.findOne({
      where: { id: deal.lead_id },
      relations: ['stakeholders'],
    });

    const stakeholders = lead?.stakeholders || [];
    if (stakeholders.length === 0) return 0;

    let score = 0;

    // Base score for having stakeholders (max 30 points)
    const stakeholderCount = Math.min(stakeholders.length, 6);
    score += (stakeholderCount / 6) * 30;

    // Decision makers and champions (max 30 points)
    const hasDecisionMaker = stakeholders.some(
      (s) => s.decision_role === DecisionRole.DECISION_MAKER,
    );
    const hasChampion = stakeholders.some(
      (s) => s.decision_role === DecisionRole.CHAMPION,
    );
    const hasInfluencers = stakeholders.filter(
      (s) => s.decision_role === DecisionRole.INFLUENCER,
    ).length;

    if (hasDecisionMaker) score += 15;
    if (hasChampion) score += 10;
    score += Math.min(hasInfluencers * 2.5, 5);

    // Engagement level (max 25 points) - approximated via influence_level
    const engagedCount = stakeholders.filter(
      (s) => s.influence_level === InfluenceLevel.HIGH,
    ).length;
    const engagementRate = engagedCount / stakeholders.length;
    score += engagementRate * 25;

    // Recent contact (max 15 points) - approximated via lead.last_contacted_at
    const now = new Date();
    const recentlyContacted =
      lead?.last_contacted_at &&
      (now.getTime() - lead.last_contacted_at.getTime()) /
        (1000 * 60 * 60 * 24) <=
        7;
    const recentContactRate = recentlyContacted ? 1 : 0;
    score += recentContactRate * 15;

    return Math.round(Math.min(score, 100));
  }

  /**
   * Calculate timing score (0-100)
   * Factors:
   * - Days until expected close
   * - Stage stagnation
   * - Deal age vs expected cycle
   */
  async calculateTiming(
    dealId: string,
    manager?: EntityManager,
  ): Promise<number> {
    const entityManager = this.getManager(manager);
    const dealRepo = entityManager.getRepository(Deal);

    const deal = await dealRepo.findOne({ where: { id: dealId } });
    if (!deal) return 50;

    let score = 100;
    const now = new Date();

    // Expected close date alignment (deduct up to 30 points)
    if (deal.expectedCloseDate) {
      const daysToClose =
        (deal.expectedCloseDate.getTime() - now.getTime()) /
        (1000 * 60 * 60 * 24);

      if (daysToClose < 0) {
        const daysOverdue = Math.abs(daysToClose);
        score -= Math.min(daysOverdue * 2, 30);
      } else if (daysToClose < 7) {
        score -= 10;
      }
    }

    // Stage SLA / stagnation (deduct up to 20 points)
    const slaStatus = await this.calculateDealSlaStatus(
      deal,
      entityManager,
    );
    if (slaStatus && slaStatus.slaDays > 0) {
      const ratio = slaStatus.daysInStage / slaStatus.slaDays;
      if (ratio > 1.5) {
        score -= 20;
      } else if (ratio > 1.0) {
        score -= 15;
      } else if (ratio > 0.75) {
        score -= 10;
      } else if (ratio > 0.5) {
        score -= 5;
      }
    } else if (deal.currentStageSince) {
      const daysInCurrentStage =
        (now.getTime() - deal.currentStageSince.getTime()) /
        (1000 * 60 * 60 * 24);
      if (daysInCurrentStage > 30) {
        score -= 20;
      } else if (daysInCurrentStage > 14) {
        score -= 10;
      }
    }

    // Deal age vs typical cycle (deduct up to 25 points)
    if (deal.createdAt) {
      const dealAge =
        (now.getTime() - deal.createdAt.getTime()) /
        (1000 * 60 * 60 * 24);
      const typicalCycle = 90;
      if (dealAge > typicalCycle * 1.5) {
        score -= 25;
      } else if (dealAge > typicalCycle) {
        score -= 15;
      }
    }

    return Math.round(Math.max(score, 0));
  }

  /**
   * Calculate SLA status for current deal stage using stage.sla_days
   */
  async calculateDealSlaStatus(
    dealInput: Deal | string,
    manager?: EntityManager,
  ): Promise<DealSlaStatus | null> {
    const entityManager = this.getManager(manager);
    const dealRepo = entityManager.getRepository(Deal);
    const stageRepo = entityManager.getRepository(Stage);

    const deal =
      typeof dealInput === 'string'
        ? await dealRepo.findOne({ where: { id: dealInput } })
        : dealInput;

    if (!deal || !deal.currentStageSince || !deal.current_stage_id) {
      return null;
    }

    const stage = await stageRepo.findOne({
      where: { id: deal.current_stage_id },
      select: ['id', 'sla_days'],
    });

    const slaDays = stage?.sla_days ?? 0;
    const now = new Date();
    const daysInStage = Math.floor(
      (now.getTime() - deal.currentStageSince.getTime()) /
        (1000 * 60 * 60 * 24),
    );

    if (!slaDays || slaDays <= 0) {
      return {
        slaDays: 0,
        daysInStage,
        dueDate: null,
        isBreached: false,
        remainingDays: null,
      };
    }

    const dueDate = new Date(
      deal.currentStageSince.getTime() + slaDays * 24 * 60 * 60 * 1000,
    );
    const remainingDays = Math.ceil(
      (dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
    );

    return {
      slaDays,
      daysInStage,
      dueDate,
      isBreached: daysInStage > slaDays,
      remainingDays,
    };
  }

  /**
   * Calculate competition score (0-100)
   * Factors:
   * - Number of competitors
   * - Threat level of competitors
   */
  async calculateCompetition(
    dealId: string,
    manager?: EntityManager,
  ): Promise<number> {
    const entityManager = this.getManager(manager);
    const competitorRepo = entityManager.getRepository(DealCompetitor);

    const competitors = await competitorRepo.find({
      where: { deal_id: dealId },
    });

    if (competitors.length === 0) return 100;

    let score = 100;

    // Number of competitors (deduct up to 30 points)
    score -= Math.min(competitors.length * 10, 30);

    // Threat level penalties (deduct up to 40 points)
    const highThreatCount = competitors.filter(
      (c) => c.threat_level === 'high',
    ).length;
    const mediumThreatCount = competitors.filter(
      (c) => c.threat_level === 'medium',
    ).length;
    score -= Math.min(highThreatCount * 10 + mediumThreatCount * 5, 40);

    // Unknown threat penalty (deduct 10 points)
    const unknownThreatCount = competitors.filter((c) => !c.threat_level)
      .length;
    if (unknownThreatCount > 0) {
      score -= 10;
    }

    return Math.round(Math.max(Math.min(score, 100), 0));
  }

  /**
   * Calculate budget score (0-100)
   * Factors:
   * - Stage progression
   * - Deal value alignment
   * - Probability
   */
  async calculateBudget(
    dealId: string,
    manager?: EntityManager,
  ): Promise<number> {
    const entityManager = this.getManager(manager);
    const dealRepo = entityManager.getRepository(Deal);

    const deal = await dealRepo.findOne({ where: { id: dealId } });
    if (!deal) return 50;

    let score = 50;

    // Stage progression indicates budget alignment (add up to 20 points)
    const stageScores: Record<string, number> = {
      lead_qualification: 0,
      stakeholder_discovery: 5,
      needs_assessment: 10,
      solution_proposal: 15,
      procurement_process: 18,
      contract_finalization: 20,
      implementation_delivery: 20,
      closed_won: 20,
      closed_lost: 0,
    };
    score += stageScores[deal.currentStatus] || 0;

    // Deal value reasonableness (add/deduct up to 20 points)
    const dealValue = Number(deal.value);
    if (dealValue > 0) {
      if (dealValue < 10000) {
        score += 10;
      } else if (dealValue > 200000) {
        score -= 10;
      }
    }

    // Probability alignment (add up to 30 points)
    if (deal.probability >= 80) {
      score += 30;
    } else if (deal.probability >= 60) {
      score += 20;
    } else if (deal.probability >= 40) {
      score += 10;
    }

    return Math.round(Math.max(Math.min(score, 100), 0));
  }

  /**
   * Calculate overall deal health score and persist results
   */
  async calculateDealHealth({
    dealId,
    userId = null,
    manager,
  }: HealthCalculationParams): Promise<DealHealthScore> {
    const entityManager = this.getManager(manager);
    const dealRepo = entityManager.getRepository(Deal);
    const historyRepo = entityManager.getRepository(DealHealthHistory);

    const [stakeholderEngagement, timing, competition, budget] =
      await Promise.all([
        this.calculateStakeholderEngagement(dealId, entityManager),
        this.calculateTiming(dealId, entityManager),
        this.calculateCompetition(dealId, entityManager),
        this.calculateBudget(dealId, entityManager),
      ]);

    const weights = {
      stakeholderEngagement: 0.3,
      timing: 0.25,
      competition: 0.2,
      budget: 0.25,
    };

    const overallScore = Math.round(
      stakeholderEngagement * weights.stakeholderEngagement +
        timing * weights.timing +
        competition * weights.competition +
        budget * weights.budget,
    );

    const calculatedAt = new Date();

    await dealRepo.update(dealId, {
      healthScore: overallScore,
      stakeholderEngagementScore: stakeholderEngagement,
      timingScore: timing,
      competitionScore: competition,
      budgetScore: budget,
      healthScoreLastCalculated: calculatedAt,
    });

    await historyRepo.insert({
      id: uuidv4(),
      dealId,
      overallScore,
      stakeholderEngagement,
      timing,
      competition,
      budget,
      calculatedBy: userId,
    });

    return {
      score: overallScore,
      factors: {
        stakeholderEngagement,
        timing,
        competition,
        budget,
      },
      lastCalculated: calculatedAt.toISOString(),
    };
  }

  /**
   * Get current health score from database
   */
  async getDealHealth(
    dealId: string,
    manager?: EntityManager,
  ): Promise<DealHealthScore | null> {
    const entityManager = this.getManager(manager);
    const dealRepo = entityManager.getRepository(Deal);

    const deal = await dealRepo.findOne({ where: { id: dealId } });
    if (!deal) return null;

    return {
      score: deal.healthScore,
      factors: {
        stakeholderEngagement: deal.stakeholderEngagementScore || 0,
        timing: deal.timingScore || 0,
        competition: deal.competitionScore || 0,
        budget: deal.budgetScore || 0,
      },
      lastCalculated:
        deal.healthScoreLastCalculated?.toISOString() ||
        new Date().toISOString(),
    };
  }

  /**
   * Get health score trend over time
   */
  async getDealHealthTrend(
    dealId: string,
    days = 30,
    manager?: EntityManager,
  ) {
    const entityManager = this.getManager(manager);
    const historyRepo = entityManager.getRepository(DealHealthHistory);

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    return await historyRepo.find({
      where: {
        dealId,
        createdAt: MoreThanOrEqual(cutoffDate),
      },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Batch calculate health scores for multiple deals
   */
  async batchCalculateHealthScores(
    dealIds: string[],
    userId = null,
    manager?: EntityManager,
  ) {
    return await Promise.all(
      dealIds.map((dealId) =>
        this.calculateDealHealth({ dealId, userId, manager }),
      ),
    );
  }

  /**
   * Get health score color/status
   */
  getHealthScoreStatus(score: number): {
    status: 'excellent' | 'good' | 'fair' | 'poor' | 'critical';
    color: string;
    label: string;
  } {
    if (score >= 80) {
      return { status: 'excellent', color: 'bg-green-500', label: 'Excellent' };
    }
    if (score >= 65) {
      return { status: 'good', color: 'bg-blue-500', label: 'Good' };
    }
    if (score >= 50) {
      return { status: 'fair', color: 'bg-yellow-500', label: 'Fair' };
    }
    if (score >= 35) {
      return { status: 'poor', color: 'bg-orange-500', label: 'Poor' };
    }
    return { status: 'critical', color: 'bg-red-500', label: 'Critical' };
  }
}
