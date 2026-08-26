import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { LeadSLAService } from './services/lead-sla.service';
import {
  CreateLeadSLADto,
  UpdateLeadSLADto,
  QueryLeadSLADto,
} from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Lead SLA Configuration')
@Controller('lead-sla')
@UseGuards(JwtAuthGuard, RolesGuard)
export class LeadSLAController {
  constructor(private readonly leadSLAService: LeadSLAService) {}

  @Post()
  @Roles('admin', 'sales_manager')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create SLA configuration for a lead status' })
  async create(
    @Body() createLeadSLADto: CreateLeadSLADto,
    @CurrentUser('id') userId: string,
  ) {
    const slaConfig = await this.leadSLAService.create(createLeadSLADto, userId);
    return {
      success: true,
      message: 'SLA configuration created successfully',
      data: slaConfig,
    };
  }

  @Get()
  @Roles('admin', 'sales_manager', 'sales_rep')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get all SLA configurations' })
  async findAll(@Query() queryDto: QueryLeadSLADto) {
    const slaConfigs = await this.leadSLAService.findAll(queryDto);
    return {
      success: true,
      data: slaConfigs,
    };
  }

  @Get(':id')
  @Roles('admin', 'sales_manager', 'sales_rep')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get SLA configuration by ID' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    const slaConfig = await this.leadSLAService.findOne(id);
    return {
      success: true,
      data: slaConfig,
    };
  }

  @Get('status/:status')
  @Roles('admin', 'sales_manager', 'sales_rep')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get SLA configuration by status' })
  async findByStatus(@Param('status') status: string) {
    const slaConfig = await this.leadSLAService.findByStatus(status);
    return {
      success: true,
      data: slaConfig,
    };
  }

  @Put(':id')
  @Roles('admin', 'sales_manager')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update SLA configuration' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateLeadSLADto: UpdateLeadSLADto,
    @CurrentUser('id') userId: string,
  ) {
    const slaConfig = await this.leadSLAService.update(
      id,
      updateLeadSLADto,
      userId,
    );
    return {
      success: true,
      message: 'SLA configuration updated successfully',
      data: slaConfig,
    };
  }

  @Delete(':id')
  @Roles('admin', 'sales_manager')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Deactivate SLA configuration' })
  async remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('id') userId: string) {
    return this.leadSLAService.remove(id, userId);
  }

  @Post(':id/restore')
  @Roles('admin', 'sales_manager')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Restore deactivated SLA configuration' })
  async restore(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('id') userId: string) {
    const slaConfig = await this.leadSLAService.restore(id, userId);
    return {
      success: true,
      message: 'SLA configuration restored successfully',
      data: slaConfig,
    };
  }
}
