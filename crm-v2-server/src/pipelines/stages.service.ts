import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not, In } from 'typeorm';
import { Stage } from './entities/stage.entity';
import { Pipeline } from './entities/pipeline.entity';
import { CreateStageDto } from './dto/create-stage.dto';
import { UpdateStageDto } from './dto/update-stage.dto';
import { ReorderStagesDto } from './dto/reorder-stages.dto';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import { ActivityAction } from '../activity-logs/enums/activity-action.enum';

@Injectable()
export class StagesService {
  constructor(
    @InjectRepository(Stage)
    private stageRepository: Repository<Stage>,
    @InjectRepository(Pipeline)
    private pipelineRepository: Repository<Pipeline>,
    private activityLogsService: ActivityLogsService,
  ) {}

  async findByPipeline(pipelineId: string): Promise<Stage[]> {
    // Verify pipeline exists
    const pipeline = await this.pipelineRepository.findOne({
      where: { id: pipelineId },
    });

    if (!pipeline) {
      throw new NotFoundException(`Pipeline with ID ${pipelineId} not found`);
    }

    return this.stageRepository.find({
      where: { pipeline_id: pipelineId, is_active: true },
      order: { order: 'ASC' },
    });
  }

  async findOne(pipelineId: string, stageId: string): Promise<Stage> {
    const stage = await this.stageRepository.findOne({
      where: { id: stageId, pipeline_id: pipelineId },
      relations: ['pipeline'],
    });

    if (!stage) {
      throw new NotFoundException(
        `Stage with ID ${stageId} not found in pipeline ${pipelineId}`,
      );
    }

    return stage;
  }

  async create(
    pipelineId: string,
    createDto: CreateStageDto,
    userId: string,
  ): Promise<Stage> {
    // Verify pipeline exists
    const pipeline = await this.pipelineRepository.findOne({
      where: { id: pipelineId, is_active: true },
    });

    if (!pipeline) {
      throw new NotFoundException(`Pipeline with ID ${pipelineId} not found`);
    }

    // Check for duplicate name in pipeline
    const existingName = await this.stageRepository.findOne({
      where: { pipeline_id: pipelineId, name: createDto.name, is_active: true },
    });

    if (existingName) {
      throw new ConflictException(
        `Stage with name "${createDto.name}" already exists in this pipeline`,
      );
    }

    // Check for duplicate order in pipeline
    const existingOrder = await this.stageRepository.findOne({
      where: {
        pipeline_id: pipelineId,
        order: createDto.order,
        is_active: true,
      },
    });

    if (existingOrder) {
      throw new ConflictException(
        `Stage with order ${createDto.order} already exists in this pipeline`,
      );
    }

    const stage = this.stageRepository.create({
      ...createDto,
      pipeline_id: pipelineId,
    });

    const saved = await this.stageRepository.save(stage);

    // Log activity
    await this.activityLogsService.logCreate(
      'Stage',
      saved.id,
      {
        name: saved.name,
        order: saved.order,
        pipeline_id: pipelineId,
        pipeline_name: pipeline.name,
      },
      userId,
      `Created stage "${saved.name}" in pipeline "${pipeline.name}"`,
    );

    return saved;
  }

  async update(
    pipelineId: string,
    stageId: string,
    updateDto: UpdateStageDto,
    userId: string,
  ): Promise<Stage> {
    const stage = await this.findOne(pipelineId, stageId);
    const oldValues = {
      name: stage.name,
      sla_days: stage.sla_days,
      probability: stage.probability,
      color: stage.color,
      description: stage.description,
    };

    // Check for duplicate name if name is being changed
    if (updateDto.name && updateDto.name !== stage.name) {
      const existingName = await this.stageRepository.findOne({
        where: {
          pipeline_id: pipelineId,
          name: updateDto.name,
          id: Not(stageId),
          is_active: true,
        },
      });

      if (existingName) {
        throw new ConflictException(
          `Stage with name "${updateDto.name}" already exists in this pipeline`,
        );
      }
    }

    Object.assign(stage, updateDto);
    const saved = await this.stageRepository.save(stage);

    // Log activity
    await this.activityLogsService.logUpdate(
      'Stage',
      saved.id,
      oldValues,
      {
        name: saved.name,
        sla_days: saved.sla_days,
        probability: saved.probability,
        color: saved.color,
        description: saved.description,
      },
      userId,
      `Updated stage "${saved.name}"`,
    );

    return saved;
  }

  async remove(
    pipelineId: string,
    stageId: string,
    userId: string,
  ): Promise<void> {
    const stage = await this.findOne(pipelineId, stageId);
    const oldValues = {
      name: stage.name,
      order: stage.order,
      pipeline_id: pipelineId,
    };

    // Soft delete
    stage.is_active = false;
    await this.stageRepository.save(stage);

    // Log activity
    await this.activityLogsService.logDelete(
      'Stage',
      stageId,
      oldValues,
      userId,
      `Deleted stage "${stage.name}"`,
    );
  }

  async reorder(
    pipelineId: string,
    reorderDto: ReorderStagesDto,
    userId: string,
  ): Promise<Stage[]> {
    // Verify pipeline exists
    const pipeline = await this.pipelineRepository.findOne({
      where: { id: pipelineId, is_active: true },
    });

    if (!pipeline) {
      throw new NotFoundException(`Pipeline with ID ${pipelineId} not found`);
    }

    // Verify all stages belong to this pipeline
    const stageIds = reorderDto.stages.map((s) => s.id);
    if (!stageIds.length) {
      throw new BadRequestException('At least one stage is required');
    }

    const stages = await this.stageRepository.find({
      where: { id: In(stageIds), pipeline_id: pipelineId, is_active: true },
    });

    if (stages.length !== stageIds.length) {
      throw new BadRequestException(
        'One or more stages do not belong to this pipeline',
      );
    }

    // Check for duplicate orders
    const orders = reorderDto.stages.map((s) => s.order);
    if (new Set(orders).size !== orders.length) {
      throw new BadRequestException('Duplicate order values are not allowed');
    }

    const requestedOrders = new Set(orders);
    const nonReorderedStages = await this.stageRepository.find({
      where: {
        pipeline_id: pipelineId,
        id: Not(In(stageIds)),
        is_active: true,
      },
      select: ['id', 'order'],
    });

    if (nonReorderedStages.some((stage) => requestedOrders.has(stage.order))) {
      throw new BadRequestException(
        'One or more order values are already in use by other stages',
      );
    }

    // Capture old orders for logging
    const oldOrders = stages.reduce(
      (acc, stage) => {
        acc[stage.id] = stage.order;
        return acc;
      },
      {} as Record<string, number>,
    );

    const maxExistingOrder = [...stages, ...nonReorderedStages].reduce(
      (maxOrder, stage) => Math.max(maxOrder, stage.order),
      0,
    );

    // Use a two-phase update so unique (pipeline_id, order) never conflicts mid-reorder
    await this.stageRepository.manager.transaction(async (manager) => {
      for (const [index, stageOrder] of reorderDto.stages.entries()) {
        await manager.update(
          Stage,
          { id: stageOrder.id, pipeline_id: pipelineId },
          { order: maxExistingOrder + index + 1 },
        );
      }

      for (const stageOrder of reorderDto.stages) {
        await manager.update(
          Stage,
          { id: stageOrder.id, pipeline_id: pipelineId },
          { order: stageOrder.order },
        );
      }
    });

    // Log activity
    await this.activityLogsService.log({
      entity: 'Pipeline',
      entity_id: pipelineId,
      action: ActivityAction.UPDATE,
      summary: `Reordered stages in pipeline "${pipeline.name}"`,
      actioned_by: userId,
      old_values: { stage_orders: oldOrders },
      new_values: {
        stage_orders: reorderDto.stages.reduce(
          (acc, s) => {
            acc[s.id] = s.order;
            return acc;
          },
          {} as Record<string, number>,
        ),
      },
    });

    return this.findByPipeline(pipelineId);
  }
}
