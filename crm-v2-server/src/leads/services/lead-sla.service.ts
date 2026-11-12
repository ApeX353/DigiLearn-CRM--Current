import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LeadSLA } from '../entities/lead-sla.entity';
import {
  CreateLeadSLADto,
  UpdateLeadSLADto,
  QueryLeadSLADto,
} from '../dto';
import { ActivityLogsService } from '../../activity-logs/activity-logs.service';

@Injectable()
export class LeadSLAService {
  constructor(
    @InjectRepository(LeadSLA)
    private readonly leadSLARepository: Repository<LeadSLA>,
    private readonly activityLogsService: ActivityLogsService,
  ) {}

  async create(
    createLeadSLADto: CreateLeadSLADto,
    userId: string,
  ): Promise<LeadSLA> {
    // Check if SLA config already exists for this status
    const existing = await this.leadSLARepository.findOne({
      where: { status: createLeadSLADto.status },
    });

    if (existing) {
      throw new ConflictException(
        `SLA configuration already exists for status "${createLeadSLADto.status}"`,
      );
    }

    const slaConfig = this.leadSLARepository.create(createLeadSLADto);
    const saved = await this.leadSLARepository.save(slaConfig);

    await this.activityLogsService.logCreate(
      'LeadSLA',
      saved.id,
      saved,
      userId,
      `Created SLA configuration for status "${saved.status}"`,
    );

    return saved;
  }

  async findAll(queryDto: QueryLeadSLADto): Promise<LeadSLA[]> {
    const { status, include_inactive } = queryDto;

    const query = this.leadSLARepository.createQueryBuilder('sla');

    if (status) {
      query.andWhere('sla.status = :status', { status });
    }

    if (!include_inactive) {
      query.andWhere('sla.is_active = :isActive', { isActive: true });
    }

    query.orderBy('sla.sla_hours', 'ASC');

    return query.getMany();
  }

  async findOne(id: string): Promise<LeadSLA> {
    const slaConfig = await this.leadSLARepository.findOne({
      where: { id },
    });

    if (!slaConfig) {
      throw new NotFoundException(`SLA configuration with ID "${id}" not found`);
    }

    return slaConfig;
  }

  async findByStatus(status: string): Promise<LeadSLA | null> {
    return this.leadSLARepository.findOne({
      where: { status: status as any, is_active: true },
    });
  }

  async update(
    id: string,
    updateLeadSLADto: UpdateLeadSLADto,
    userId: string,
  ): Promise<LeadSLA> {
    const slaConfig = await this.findOne(id);

    // If status is being changed, check for conflicts
    if (
      updateLeadSLADto.status &&
      updateLeadSLADto.status !== slaConfig.status
    ) {
      const existing = await this.leadSLARepository.findOne({
        where: { status: updateLeadSLADto.status },
      });

      if (existing) {
        throw new ConflictException(
          `SLA configuration already exists for status "${updateLeadSLADto.status}"`,
        );
      }
    }

    const oldValues = { ...slaConfig };

    Object.assign(slaConfig, updateLeadSLADto);
    const updated = await this.leadSLARepository.save(slaConfig);

    await this.activityLogsService.logUpdate(
      'LeadSLA',
      updated.id,
      oldValues,
      updated,
      userId,
      `Updated SLA configuration for status "${updated.status}"`,
    );

    return updated;
  }

  async remove(id: string, userId: string): Promise<{ success: boolean; message: string }> {
    const slaConfig = await this.findOne(id);

    const oldValues = { ...slaConfig };

    slaConfig.is_active = false;
    await this.leadSLARepository.save(slaConfig);

    await this.activityLogsService.logDelete(
      'LeadSLA',
      slaConfig.id,
      oldValues,
      userId,
      `Deactivated SLA configuration for status "${slaConfig.status}"`,
    );

    return {
      success: true,
      message: 'SLA configuration deactivated successfully',
    };
  }

  async restore(id: string, userId: string): Promise<LeadSLA> {
    const slaConfig = await this.leadSLARepository.findOne({
      where: { id },
    });

    if (!slaConfig) {
      throw new NotFoundException(`SLA configuration with ID "${id}" not found`);
    }

    if (slaConfig.is_active) {
      throw new ConflictException(
        'SLA configuration is already active',
      );
    }

    slaConfig.is_active = true;
    const restored = await this.leadSLARepository.save(slaConfig);

    await this.activityLogsService.logUpdate(
      'LeadSLA',
      restored.id,
      { is_active: false },
      { is_active: true },
      userId,
      `Restored SLA configuration for status "${restored.status}"`,
    );

    return restored;
  }
}
