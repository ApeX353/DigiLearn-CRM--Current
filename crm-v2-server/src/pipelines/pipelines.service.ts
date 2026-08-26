import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not } from 'typeorm';
import {
  paginate,
  Pagination,
  IPaginationOptions,
} from 'nestjs-typeorm-paginate';
import { Pipeline } from './entities/pipeline.entity';
import { CreatePipelineDto } from './dto/create-pipeline.dto';
import { UpdatePipelineDto } from './dto/update-pipeline.dto';
import { QueryPipelineDto } from './dto/query-pipeline.dto';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';

@Injectable()
export class PipelinesService {
  constructor(
    @InjectRepository(Pipeline)
    private pipelineRepository: Repository<Pipeline>,
    private activityLogsService: ActivityLogsService,
  ) {}

  async findAll(query: QueryPipelineDto): Promise<Pagination<Pipeline>> {
    const page = parseInt(query.page || '1', 10);
    const limit = parseInt(query.limit || '10', 10);

    const options: IPaginationOptions = { page, limit };

    const queryBuilder = this.pipelineRepository
      .createQueryBuilder('pipeline')
      .leftJoinAndSelect('pipeline.stages', 'stage', 'stage.is_active = :stageActive', { stageActive: true })
      .orderBy('pipeline.created_at', 'DESC')
      .addOrderBy('stage.order', 'ASC');

    if (!query.include_inactive) {
      queryBuilder.andWhere('pipeline.is_active = :isActive', {
        isActive: true,
      });
    }

    if (query.search) {
      queryBuilder.andWhere('pipeline.name LIKE :search', {
        search: `%${query.search}%`,
      });
    }

    return paginate<Pipeline>(queryBuilder, options);
  }

  async findOne(id: string): Promise<Pipeline> {
    const pipeline = await this.pipelineRepository.findOne({
      where: { id },
      relations: ['stages'],
    });

    if (!pipeline) {
      throw new NotFoundException(`Pipeline with ID ${id} not found`);
    }

    // Sort stages by order and filter active only
    pipeline.stages = pipeline.stages
      .filter((s) => s.is_active)
      .sort((a, b) => a.order - b.order);

    return pipeline;
  }

  async findDefault(): Promise<Pipeline | null> {
    const pipeline = await this.pipelineRepository.findOne({
      where: { is_default: true, is_active: true },
      relations: ['stages'],
    });

    if (pipeline) {
      pipeline.stages = pipeline.stages
        .filter((s) => s.is_active)
        .sort((a, b) => a.order - b.order);
    }

    return pipeline;
  }

  async create(createDto: CreatePipelineDto, userId: string): Promise<Pipeline> {
    // Check for duplicate name
    const existing = await this.pipelineRepository.findOne({
      where: { name: createDto.name },
    });

    if (existing) {
      throw new ConflictException(
        `Pipeline with name "${createDto.name}" already exists`,
      );
    }

    // Handle default pipeline logic
    if (createDto.is_default) {
      await this.clearDefaultPipeline();
    }

    // If this is the first pipeline, make it default
    const count = await this.pipelineRepository.count();
    const isDefault = count === 0 ? true : createDto.is_default || false;

    const pipeline = this.pipelineRepository.create({
      ...createDto,
      is_default: isDefault,
    });

    const saved = await this.pipelineRepository.save(pipeline);

    // Log activity
    await this.activityLogsService.logCreate(
      'Pipeline',
      saved.id,
      { name: saved.name, is_default: saved.is_default },
      userId,
      `Created pipeline "${saved.name}"`,
    );

    return saved;
  }

  async update(
    id: string,
    updateDto: UpdatePipelineDto,
    userId: string,
  ): Promise<Pipeline> {
    const pipeline = await this.findOne(id);
    const oldValues = { name: pipeline.name, is_default: pipeline.is_default };

    // Check for duplicate name if name is being changed
    if (updateDto.name && updateDto.name !== pipeline.name) {
      const existing = await this.pipelineRepository.findOne({
        where: { name: updateDto.name, id: Not(id) },
      });

      if (existing) {
        throw new ConflictException(
          `Pipeline with name "${updateDto.name}" already exists`,
        );
      }
    }

    // Handle default pipeline logic
    if (updateDto.is_default && !pipeline.is_default) {
      await this.clearDefaultPipeline();
    }

    Object.assign(pipeline, updateDto);
    const saved = await this.pipelineRepository.save(pipeline);

    // Log activity
    await this.activityLogsService.logUpdate(
      'Pipeline',
      saved.id,
      oldValues,
      { name: saved.name, is_default: saved.is_default },
      userId,
      `Updated pipeline "${saved.name}"`,
    );

    return this.findOne(id);
  }

  async remove(id: string, userId: string): Promise<void> {
    const pipeline = await this.findOne(id);

    if (pipeline.is_default) {
      throw new BadRequestException(
        'Cannot delete the default pipeline. Set another pipeline as default first.',
      );
    }

    const oldValues = { name: pipeline.name, is_default: pipeline.is_default };

    // Soft delete
    pipeline.is_active = false;
    await this.pipelineRepository.save(pipeline);

    // Log activity
    await this.activityLogsService.logDelete(
      'Pipeline',
      id,
      oldValues,
      userId,
      `Deleted pipeline "${pipeline.name}"`,
    );
  }

  async setDefault(id: string, userId: string): Promise<Pipeline> {
    const pipeline = await this.findOne(id);

    if (pipeline.is_default) {
      return pipeline;
    }

    const oldValues = { is_default: false };

    await this.clearDefaultPipeline();
    pipeline.is_default = true;
    await this.pipelineRepository.save(pipeline);

    // Log activity
    await this.activityLogsService.logUpdate(
      'Pipeline',
      pipeline.id,
      oldValues,
      { is_default: true },
      userId,
      `Set pipeline "${pipeline.name}" as default`,
    );

    return this.findOne(id);
  }

  private async clearDefaultPipeline(): Promise<void> {
    await this.pipelineRepository.update(
      { is_default: true },
      { is_default: false },
    );
  }
}
