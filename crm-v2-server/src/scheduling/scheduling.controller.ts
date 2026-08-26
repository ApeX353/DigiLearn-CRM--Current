import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { SchedulingService } from './services/scheduling.service';
import {
  ConfirmHoldDto,
  CreateHoldDto,
  CreateSchedulingLinkDto,
  UpdateSchedulingLinkDto,
} from './dto/scheduling.dto';

/**
 * Two-surface controller:
 *
 *  1. `/scheduling-links/*`       — authenticated CRUD for reps.
 *  2. `/book/:slug/*` (@Public)   — the Calendly-style booking flow.
 *
 * The public subpaths never leak the owner's email or connected
 * calendars — only the slug, title, description, duration and the
 * computed slot grid. Holds are the real concurrency primitive here:
 * each pick creates a short-lived PENDING hold which grays the slot out
 * on other invitees' pages (`held: true`) until either the invitee
 * confirms or the TTL expires.
 */
@ApiTags('Scheduling')
@Controller()
export class SchedulingController {
  constructor(private readonly scheduling: SchedulingService) {}

  // ---------- owner CRUD ----------

  @Post('scheduling-links')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'sales_manager', 'sales_rep')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a public booking link' })
  async create(
    @Body() dto: CreateSchedulingLinkDto,
    @CurrentUser('id') userId: string,
  ) {
    const data = await this.scheduling.createLink(userId, dto);
    return { success: true, data };
  }

  @Get('scheduling-links')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'sales_manager', 'sales_rep')
  @ApiBearerAuth()
  @ApiOperation({ summary: "List the caller's booking links" })
  async listMine(@CurrentUser('id') userId: string) {
    const data = await this.scheduling.listLinksForOwner(userId);
    return { success: true, data };
  }

  @Patch('scheduling-links/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'sales_manager', 'sales_rep')
  @ApiBearerAuth()
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSchedulingLinkDto,
    @CurrentUser('id') userId: string,
  ) {
    const data = await this.scheduling.updateLink(id, userId, dto);
    return { success: true, data };
  }

  @Delete('scheduling-links/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'sales_manager', 'sales_rep')
  @ApiBearerAuth()
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') userId: string,
  ) {
    await this.scheduling.deleteLink(id, userId);
    return { success: true, message: 'Scheduling link removed' };
  }

  // ---------- public booking ----------

  /**
   * Public page payload. No auth, but we do validate the slug is active
   * so disabled links don't leak metadata or allow booking.
   */
  @Get('book/:slug')
  @Public()
  @ApiOperation({ summary: 'Public booking page — title + slot grid' })
  async publicView(@Param('slug') slug: string) {
    const data = await this.scheduling.getPublicView(slug);
    return { success: true, data };
  }

  /**
   * Create a short-lived PENDING hold. Response carries `expires_at`
   * so the client can draw the 5-minute countdown next to the form.
   */
  @Post('book/:slug/hold')
  @Public()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Reserve a slot while the invitee fills the form' })
  async hold(
    @Param('slug') slug: string,
    @Body() dto: CreateHoldDto,
  ) {
    const data = await this.scheduling.createHold(slug, dto);
    return {
      success: true,
      data: {
        id: data.id,
        start_at: data.start_at,
        end_at: data.end_at,
        expires_at: data.expires_at,
        status: data.status,
      },
    };
  }

  @Post('book/:slug/confirm')
  @Public()
  @ApiOperation({ summary: 'Finalise a booking against a held slot' })
  async confirm(
    @Param('slug') slug: string,
    @Body() dto: ConfirmHoldDto,
  ) {
    const data = await this.scheduling.confirmHold(
      slug,
      dto.hold_id,
      dto.invitee_email,
      dto.invitee_name,
      dto.notes,
    );
    return {
      success: true,
      data: {
        activity_id: data.activity_id,
        meeting_id: data.meeting_id,
        start_at: data.hold.start_at,
        end_at: data.hold.end_at,
      },
    };
  }
}
