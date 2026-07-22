import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { BugReportsService } from './bug-reports.service';
import type { RequestingUser } from './bug-reports.service';
import {
  CreateBugReportDto,
  UpdateBugReportDto,
  QueryBugReportDto,
} from './dto/bug-report.dto';

/** Everyone with a login can raise a ticket. */
const ALL_OPERATORS = [
  'admin',
  'admin_support',
  'manager',
  'sales_manager',
  'sales_rep',
  'finance',
] as const;

/** Only the owner + admins triage (assign / change status). */
const TRIAGE = ['admin', 'admin_support'] as const;

@ApiTags('Bug Reports')
@ApiBearerAuth()
@Controller('bug-reports')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BugReportsController {
  constructor(private readonly service: BugReportsService) {}

  @Post()
  @Roles(...ALL_OPERATORS)
  @ApiOperation({ summary: 'Report a bug (any user)' })
  async create(
    @Body() dto: CreateBugReportDto,
    @CurrentUser('id') userId: string,
  ) {
    const data = await this.service.create(dto, userId);
    return { success: true, message: 'Bug report submitted', data };
  }

  @Get()
  @Roles(...ALL_OPERATORS)
  @ApiOperation({
    summary: 'List bug reports (triagers see all, others see their own)',
  })
  async findAll(
    @Query() query: QueryBugReportDto,
    @CurrentUser() user: RequestingUser,
  ) {
    const { items, total } = await this.service.findAll(query, user);
    return { success: true, data: items, meta: { total } };
  }

  @Get('assignable-users')
  @Roles(...TRIAGE)
  @ApiOperation({ summary: 'Active users a ticket can be assigned to' })
  async assignableUsers() {
    const data = await this.service.assignableUsers();
    return { success: true, data };
  }

  @Get(':id')
  @Roles(...ALL_OPERATORS)
  @ApiOperation({ summary: 'Get one bug report' })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestingUser,
  ) {
    const data = await this.service.findOne(id, user);
    return { success: true, data };
  }

  @Patch(':id')
  @Roles(...TRIAGE)
  @ApiOperation({
    summary: 'Triage a bug report — assign, change status/severity, resolve',
  })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBugReportDto,
    @CurrentUser() user: RequestingUser,
  ) {
    const data = await this.service.update(id, dto, user);
    return { success: true, message: 'Bug report updated', data };
  }
}
