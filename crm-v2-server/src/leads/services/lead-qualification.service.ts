import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  LeadQualificationCriteria,
  QualificationChecklist,
} from '../entities/lead-qualification-criteria.entity';
import {
  CreateLeadQualificationDto,
  UpdateLeadQualificationDto,
  QueryLeadQualificationDto,
} from '../dto';
import { ComplianceSettingsService } from '../../settings/compliance-settings.service';

// Phase A.3: the qualification cut-off score is now sourced from
// `compliance.thresholds.qualification_score` so admins can lower the
// bar (e.g. early-stage market) or raise it (e.g. enterprise launch)
// from Admin Settings → Compliance & Controls. Default 80.

@Injectable()
export class LeadQualificationService {
  constructor(
    @InjectRepository(LeadQualificationCriteria)
    private readonly qualificationRepo: Repository<LeadQualificationCriteria>,
    private readonly complianceSettings: ComplianceSettingsService,
  ) {}

  /**
   * Resolve the qualification cut-off score from Compliance & Controls
   * (admin-tunable). Cached 30s in ComplianceSettingsService — safe to
   * call from inside hot create/update paths.
   */
  private async getQualificationThreshold(): Promise<number> {
    return this.complianceSettings.getNumber('qualification_score_min');
  }

  /**
   * Create a new lead qualification record
   */
  async create(
    dto: CreateLeadQualificationDto,
    userId: string,
  ): Promise<LeadQualificationCriteria> {
    // Check if qualification already exists for this lead
    const existing = await this.qualificationRepo.findOne({
      where: { lead_id: dto.lead_id },
    });

    if (existing) {
      throw new ConflictException(
        `Qualification criteria already exists for lead ${dto.lead_id}`,
      );
    }

    const checklist: QualificationChecklist = {
      phone_verified: dto.checklist?.phone_verified ?? false,
      email_verified: dto.checklist?.email_verified ?? false,
      province_verified: dto.checklist?.province_verified ?? false,
    };

    const qualification = this.qualificationRepo.create({
      lead_id: dto.lead_id,
      needs: dto.needs ?? null,
      qualification_needs: dto.qualification_needs ?? null,
      has_needs: !!dto.needs || !!dto.qualification_needs?.length,
      plan_type: dto.plan_type ?? null,
      has_plan_type: !!dto.plan_type,
      timeline_type: dto.timeline_type ?? null,
      specific_date: dto.specific_date ? new Date(dto.specific_date) : null,
      has_timeline: !!dto.timeline_type || !!dto.specific_date,
      budget_indicator: dto.budget_indicator ?? null,
      budget_amount: dto.budget_amount ?? null,
      has_budget: !!dto.budget_indicator || dto.budget_amount != null,
      has_verified_contact: !!dto.decision_maker_name,
      decision_maker_name: dto.decision_maker_name ?? null,
      decision_maker_title: dto.decision_maker_title ?? null,
      has_influential_contact: !!dto.decision_maker_name && !!dto.decision_maker_title,
      checklist,
    });

    // Calculate score and qualification status
    qualification.qualification_score = this.calculateScore(qualification);
    const threshold = await this.getQualificationThreshold();
    qualification.is_qualified =
      qualification.qualification_score >= threshold;

    return await this.qualificationRepo.save(qualification);
  }

  /**
   * Find all qualifications with filters
   */
  async findAll(
    query: QueryLeadQualificationDto,
  ): Promise<{ data: LeadQualificationCriteria[]; total: number }> {
    const page = parseInt(query.page || '1', 10);
    const limit = parseInt(query.limit || '10', 10);
    const skip = (page - 1) * limit;

    const qb = this.qualificationRepo.createQueryBuilder('q');

    if (query.lead_id) {
      qb.andWhere('q.lead_id = :lead_id', { lead_id: query.lead_id });
    }

    if (query.is_qualified !== undefined) {
      qb.andWhere('q.is_qualified = :is_qualified', {
        is_qualified: query.is_qualified,
      });
    }

    if (query.has_needs !== undefined) {
      qb.andWhere('q.has_needs = :has_needs', { has_needs: query.has_needs });
    }

    if (query.has_plan_type !== undefined) {
      qb.andWhere('q.has_plan_type = :has_plan_type', {
        has_plan_type: query.has_plan_type,
      });
    }

    if (query.has_timeline !== undefined) {
      qb.andWhere('q.has_timeline = :has_timeline', {
        has_timeline: query.has_timeline,
      });
    }

    if (query.has_budget !== undefined) {
      qb.andWhere('q.has_budget = :has_budget', { has_budget: query.has_budget });
    }

    if (query.has_verified_contact !== undefined) {
      qb.andWhere('q.has_verified_contact = :has_verified_contact', {
        has_verified_contact: query.has_verified_contact,
      });
    }

    if (query.min_score) {
      qb.andWhere('q.qualification_score >= :min_score', {
        min_score: parseInt(query.min_score, 10),
      });
    }

    if (query.max_score) {
      qb.andWhere('q.qualification_score <= :max_score', {
        max_score: parseInt(query.max_score, 10),
      });
    }

    const total = await qb.getCount();

    qb.skip(skip).take(limit);
    qb.orderBy('q.updated_at', 'DESC');

    const data = await qb.getMany();

    return { data, total };
  }

  /**
   * Find one by ID
   */
  async findOne(id: string): Promise<LeadQualificationCriteria> {
    const qualification = await this.qualificationRepo.findOne({
      where: { id },
    });

    if (!qualification) {
      throw new NotFoundException(
        `Qualification criteria with ID ${id} not found`,
      );
    }

    return qualification;
  }

  /**
   * Find by lead ID
   */
  async findByLeadId(leadId: string): Promise<LeadQualificationCriteria> {
    const qualification = await this.qualificationRepo.findOne({
      where: { lead_id: leadId },
    });

    if (!qualification) {
      throw new NotFoundException(
        `Qualification criteria not found for lead ${leadId}`,
      );
    }

    return qualification;
  }

  /**
   * Update qualification
   */
  async update(
    id: string,
    dto: UpdateLeadQualificationDto,
    userId: string,
  ): Promise<LeadQualificationCriteria> {
    const qualification = await this.findOne(id);

    // Update data fields and derive boolean flags from them
    if (dto.needs !== undefined) {
      qualification.needs = dto.needs ?? null;
    }
    if (dto.qualification_needs !== undefined) {
      qualification.qualification_needs = dto.qualification_needs ?? null;
    }
    if (dto.needs !== undefined || dto.qualification_needs !== undefined) {
      qualification.has_needs =
        !!qualification.needs || !!qualification.qualification_needs?.length;
    }
    if (dto.plan_type !== undefined) {
      qualification.plan_type = dto.plan_type ?? null;
      qualification.has_plan_type = !!dto.plan_type;
    }
    if (dto.timeline_type !== undefined) {
      qualification.timeline_type = dto.timeline_type ?? null;
    }
    if (dto.specific_date !== undefined) {
      qualification.specific_date = dto.specific_date
        ? new Date(dto.specific_date)
        : null;
    }
    if (dto.timeline_type !== undefined || dto.specific_date !== undefined) {
      qualification.has_timeline =
        !!qualification.timeline_type || !!qualification.specific_date;
    }
    if (dto.budget_indicator !== undefined) {
      qualification.budget_indicator = dto.budget_indicator ?? null;
    }
    if (dto.budget_amount !== undefined) {
      qualification.budget_amount = dto.budget_amount ?? null;
    }
    if (dto.budget_indicator !== undefined || dto.budget_amount !== undefined) {
      qualification.has_budget =
        !!qualification.budget_indicator || qualification.budget_amount != null;
    }
    if (dto.decision_maker_name !== undefined) {
      qualification.decision_maker_name = dto.decision_maker_name ?? null;
      qualification.has_verified_contact = !!dto.decision_maker_name;
    }
    if (dto.decision_maker_title !== undefined) {
      qualification.decision_maker_title = dto.decision_maker_title ?? null;
    }
    if (
      dto.decision_maker_name !== undefined ||
      dto.decision_maker_title !== undefined
    ) {
      qualification.has_influential_contact =
        !!qualification.decision_maker_name &&
        !!qualification.decision_maker_title;
    }

    // Update checklist
    if (dto.checklist) {
      qualification.checklist = {
        phone_verified:
          dto.checklist.phone_verified ?? qualification.checklist.phone_verified,
        email_verified:
          dto.checklist.email_verified ?? qualification.checklist.email_verified,
        province_verified:
          dto.checklist.province_verified ??
          qualification.checklist.province_verified,
      };
    }

    // Recalculate score
    qualification.qualification_score = this.calculateScore(qualification);
    const threshold = await this.getQualificationThreshold();
    qualification.is_qualified =
      qualification.qualification_score >= threshold;

    return await this.qualificationRepo.save(qualification);
  }

  /**
   * Delete qualification
   */
  async remove(id: string): Promise<void> {
    const qualification = await this.findOne(id);
    await this.qualificationRepo.remove(qualification);
  }

  // ===== PRIVATE HELPER METHODS =====

  /**
   * Calculate qualification score based on boolean flags
   * Total: 100 points
   * - has_needs: 15
   * - has_plan_type: 15
   * - has_timeline: 15
   * - has_budget: 20
   * - has_verified_contact: 20
   * - has_influential_contact: 5
   * - phone_verified: 5
   * - email_verified: 3
   * - province_verified: 2
   */
  private calculateScore(q: LeadQualificationCriteria): number {
    let score = 0;

    const weights = {
      has_needs: 15,
      has_plan_type: 15,
      has_timeline: 15,
      has_budget: 20,
      has_verified_contact: 20,
      has_influential_contact: 5,
      phone_verified: 5,
      email_verified: 3,
      province_verified: 2,
    };

    if (q.has_needs) score += weights.has_needs;
    if (q.has_plan_type) score += weights.has_plan_type;
    if (q.has_timeline) score += weights.has_timeline;
    if (q.has_budget) score += weights.has_budget;
    if (q.has_verified_contact) score += weights.has_verified_contact;
    if (q.has_influential_contact) score += weights.has_influential_contact;
    if (q.checklist?.phone_verified) score += weights.phone_verified;
    if (q.checklist?.email_verified) score += weights.email_verified;
    if (q.checklist?.province_verified) score += weights.province_verified;

    return score;
  }
}
