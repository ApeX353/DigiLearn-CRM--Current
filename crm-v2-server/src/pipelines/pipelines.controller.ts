import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { PipelinesService } from './pipelines.service';
import { CreatePipelineDto } from './dto/create-pipeline.dto';
import { UpdatePipelineDto } from './dto/update-pipeline.dto';
import { QueryPipelineDto } from './dto/query-pipeline.dto';

@ApiTags('Pipelines')
@ApiBearerAuth()
@Controller('pipelines')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PipelinesController {
  constructor(private readonly pipelinesService: PipelinesService) {}

  @Get()
  @ApiOperation({ summary: 'Get all pipelines with pagination' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 10 })
  @ApiQuery({ name: 'search', required: false, description: 'Search by name' })
  @ApiQuery({
    name: 'include_inactive',
    required: false,
    description: 'Include inactive pipelines',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Returns paginated list of pipelines',
  })
  async findAll(@Query() query: QueryPipelineDto) {
    const result = await this.pipelinesService.findAll(query);
    return {
      success: true,
      data: result.items,
      meta: result.meta,
      links: result.links,
    };
  }

  @Get('default')
  @ApiOperation({ summary: 'Get the default pipeline' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Returns the default pipeline',
  })
  async findDefault() {
    const pipeline = await this.pipelinesService.findDefault();
    return {
      success: true,
      data: pipeline,
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a pipeline by ID' })
  @ApiParam({ name: 'id', description: 'Pipeline UUID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Returns the pipeline details',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Pipeline not found',
  })
  async findOne(@Param('id') id: string) {
    const pipeline = await this.pipelinesService.findOne(id);
    return {
      success: true,
      data: pipeline,
    };
  }

  @Post()
  @Roles('admin', 'sales_manager')
  @ApiOperation({ summary: 'Create a new pipeline' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Pipeline created successfully',
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'Pipeline name already exists',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Requires admin or sales_manager role',
  })
  async create(
    @Body() createDto: CreatePipelineDto,
    @CurrentUser('id') userId: string,
  ) {
    const pipeline = await this.pipelinesService.create(createDto, userId);
    return {
      success: true,
      message: 'Pipeline created successfully',
      data: pipeline,
    };
  }

  @Put(':id')
  @Roles('admin', 'sales_manager')
  @ApiOperation({ summary: 'Update a pipeline' })
  @ApiParam({ name: 'id', description: 'Pipeline UUID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Pipeline updated successfully',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Pipeline not found',
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'Pipeline name already exists',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Requires admin or sales_manager role',
  })
  async update(
    @Param('id') id: string,
    @Body() updateDto: UpdatePipelineDto,
    @CurrentUser('id') userId: string,
  ) {
    const pipeline = await this.pipelinesService.update(id, updateDto, userId);
    return {
      success: true,
      message: 'Pipeline updated successfully',
      data: pipeline,
    };
  }

  @Delete(':id')
  @Roles('admin', 'sales_manager')
  @ApiOperation({ summary: 'Delete a pipeline (soft delete)' })
  @ApiParam({ name: 'id', description: 'Pipeline UUID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Pipeline deleted successfully',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Pipeline not found',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Cannot delete default pipeline',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Requires admin or sales_manager role',
  })
  async remove(@Param('id') id: string, @CurrentUser('id') userId: string) {
    await this.pipelinesService.remove(id, userId);
    return {
      success: true,
      message: 'Pipeline deleted successfully',
    };
  }

  @Patch(':id/set-default')
  @Roles('admin', 'sales_manager')
  @ApiOperation({ summary: 'Set a pipeline as the default' })
  @ApiParam({ name: 'id', description: 'Pipeline UUID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Pipeline set as default',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Pipeline not found',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Requires admin or sales_manager role',
  })
  async setDefault(@Param('id') id: string, @CurrentUser('id') userId: string) {
    const pipeline = await this.pipelinesService.setDefault(id, userId);
    return {
      success: true,
      message: 'Pipeline set as default',
      data: pipeline,
    };
  }
}
