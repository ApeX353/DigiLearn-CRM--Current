import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Patch,
  Body,
  Param,
  UseGuards,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { StagesService } from './stages.service';
import { CreateStageDto } from './dto/create-stage.dto';
import { UpdateStageDto } from './dto/update-stage.dto';
import { ReorderStagesDto } from './dto/reorder-stages.dto';

@ApiTags('Pipeline Stages')
@ApiBearerAuth()
@Controller('pipelines/:pipelineId/stages')
@UseGuards(JwtAuthGuard, RolesGuard)
export class StagesController {
  constructor(private readonly stagesService: StagesService) {}

  @Get()
  @ApiOperation({ summary: 'Get all stages for a pipeline' })
  @ApiParam({ name: 'pipelineId', description: 'Pipeline UUID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Returns all stages for the pipeline',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Pipeline not found',
  })
  async findByPipeline(@Param('pipelineId') pipelineId: string) {
    const stages = await this.stagesService.findByPipeline(pipelineId);
    return {
      success: true,
      data: stages,
      count: stages.length,
    };
  }

  @Get(':stageId')
  @ApiOperation({ summary: 'Get a stage by ID' })
  @ApiParam({ name: 'pipelineId', description: 'Pipeline UUID' })
  @ApiParam({ name: 'stageId', description: 'Stage UUID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Returns the stage details',
  })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Stage not found' })
  async findOne(
    @Param('pipelineId') pipelineId: string,
    @Param('stageId') stageId: string,
  ) {
    const stage = await this.stagesService.findOne(pipelineId, stageId);
    return {
      success: true,
      data: stage,
    };
  }

  @Post()
  @Roles('admin', 'sales_manager')
  @ApiOperation({ summary: 'Create a new stage in a pipeline' })
  @ApiParam({ name: 'pipelineId', description: 'Pipeline UUID' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Stage created successfully',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Pipeline not found',
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'Stage name or order already exists',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Requires admin or sales_manager role',
  })
  async create(
    @Param('pipelineId') pipelineId: string,
    @Body() createDto: CreateStageDto,
    @CurrentUser('id') userId: string,
  ) {
    const stage = await this.stagesService.create(pipelineId, createDto, userId);
    return {
      success: true,
      message: 'Stage created successfully',
      data: stage,
    };
  }

  @Put(':stageId')
  @Roles('admin', 'sales_manager')
  @ApiOperation({ summary: 'Update a stage' })
  @ApiParam({ name: 'pipelineId', description: 'Pipeline UUID' })
  @ApiParam({ name: 'stageId', description: 'Stage UUID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Stage updated successfully',
  })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Stage not found' })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'Stage name already exists',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Requires admin or sales_manager role',
  })
  async update(
    @Param('pipelineId') pipelineId: string,
    @Param('stageId') stageId: string,
    @Body() updateDto: UpdateStageDto,
    @CurrentUser('id') userId: string,
  ) {
    const stage = await this.stagesService.update(
      pipelineId,
      stageId,
      updateDto,
      userId,
    );
    return {
      success: true,
      message: 'Stage updated successfully',
      data: stage,
    };
  }

  @Delete(':stageId')
  @Roles('admin', 'sales_manager')
  @ApiOperation({ summary: 'Delete a stage (soft delete)' })
  @ApiParam({ name: 'pipelineId', description: 'Pipeline UUID' })
  @ApiParam({ name: 'stageId', description: 'Stage UUID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Stage deleted successfully',
  })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Stage not found' })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Requires admin or sales_manager role',
  })
  async remove(
    @Param('pipelineId') pipelineId: string,
    @Param('stageId') stageId: string,
    @CurrentUser('id') userId: string,
  ) {
    await this.stagesService.remove(pipelineId, stageId, userId);
    return {
      success: true,
      message: 'Stage deleted successfully',
    };
  }

  @Patch('reorder')
  @Roles('admin', 'sales_manager')
  @ApiOperation({ summary: 'Reorder stages in a pipeline' })
  @ApiParam({ name: 'pipelineId', description: 'Pipeline UUID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Stages reordered successfully',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Pipeline not found',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid stage IDs or duplicate orders',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Requires admin or sales_manager role',
  })
  async reorder(
    @Param('pipelineId') pipelineId: string,
    @Body() reorderDto: ReorderStagesDto,
    @CurrentUser('id') userId: string,
  ) {
    const stages = await this.stagesService.reorder(
      pipelineId,
      reorderDto,
      userId,
    );
    return {
      success: true,
      message: 'Stages reordered successfully',
      data: stages,
    };
  }
}
