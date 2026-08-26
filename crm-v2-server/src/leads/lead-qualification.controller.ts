import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
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
import { LeadQualificationService } from './services/lead-qualification.service';
import {
  CreateLeadQualificationDto,
  UpdateLeadQualificationDto,
  QueryLeadQualificationDto,
} from './dto';

@ApiTags('Lead Qualification')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('leads-qualification')
export class LeadQualificationController {
  constructor(
    private readonly qualificationService: LeadQualificationService,
  ) {}

  // ========================
  // CREATE
  // ========================

  @Post()
  @Roles('admin', 'sales_manager', 'sales_rep')
  @ApiOperation({ summary: 'Create lead qualification criteria' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Qualification created',
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'Qualification already exists',
  })
  async create(
    @Body() dto: CreateLeadQualificationDto,
    @CurrentUser('id') userId: string,
  ) {
    const data = await this.qualificationService.create(dto, userId);
    return {
      success: true,
      data,
      message: 'Qualification created successfully',
    };
  }

  // ========================
  // LIST (static route — before :id)
  // ========================

  @Get()
  @Roles('admin', 'sales_manager', 'sales_rep')
  @ApiOperation({ summary: 'Get all lead qualifications with filters' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Paginated qualifications',
  })
  async findAll(@Query() query: QueryLeadQualificationDto) {
    const result = await this.qualificationService.findAll(query);
    return {
      success: true,
      data: result.data,
      meta: {
        total: result.total,
        page: parseInt(query.page || '1', 10),
        limit: parseInt(query.limit || '10', 10),
      },
    };
  }

  // ========================
  // GET BY LEAD ID (static route — before :id)
  // ========================

  @Get('lead/:leadId')
  @Roles('admin', 'sales_manager', 'sales_rep')
  @ApiOperation({ summary: 'Get qualification by lead ID' })
  @ApiParam({ name: 'leadId', description: 'Lead UUID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Qualification details' })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Qualification not found',
  })
  async findByLeadId(@Param('leadId', ParseUUIDPipe) leadId: string) {
    const data = await this.qualificationService.findByLeadId(leadId);
    return { success: true, data };
  }

  // ========================
  // GET BY ID
  // ========================

  @Get(':id')
  @Roles('admin', 'sales_manager', 'sales_rep')
  @ApiOperation({ summary: 'Get qualification by ID' })
  @ApiParam({ name: 'id', description: 'Qualification UUID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Qualification details' })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Qualification not found',
  })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    const data = await this.qualificationService.findOne(id);
    return { success: true, data };
  }

  // ========================
  // UPDATE
  // ========================

  @Put(':id')
  @Roles('admin', 'sales_manager', 'sales_rep')
  @ApiOperation({ summary: 'Update qualification criteria' })
  @ApiParam({ name: 'id', description: 'Qualification UUID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Qualification updated' })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Qualification not found',
  })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLeadQualificationDto,
    @CurrentUser('id') userId: string,
  ) {
    const data = await this.qualificationService.update(id, dto, userId);
    return {
      success: true,
      data,
      message: 'Qualification updated successfully',
    };
  }

  // ========================
  // DELETE
  // ========================

  @Delete(':id')
  @Roles('admin', 'sales_manager')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete qualification criteria' })
  @ApiParam({ name: 'id', description: 'Qualification UUID' })
  @ApiResponse({
    status: HttpStatus.NO_CONTENT,
    description: 'Qualification deleted',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Qualification not found',
  })
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    await this.qualificationService.remove(id);
  }
}
