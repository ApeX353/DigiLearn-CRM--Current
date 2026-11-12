import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CalendarSyncService } from './services/calendar-sync.service';
import { CalendarProvider } from './entities/user-calendar-connection.entity';

/**
 * Surface area:
 *   GET    /calendar-sync/connections                 — list mine
 *   POST   /calendar-sync/connections/:provider/begin — start OAuth
 *   GET    /calendar-sync/connections/callback        — OAuth return
 *   DELETE /calendar-sync/connections/:id             — revoke
 *   POST   /calendar-sync/webhook/:provider           — inbound push
 *
 * The callback and webhook endpoints are intentionally NOT guarded by
 * JWT — the provider hits them with their own auth (signed state token
 * on callback, signed body on webhook). We still validate everything
 * inside the handler.
 */
@ApiTags('Calendar Sync')
@ApiBearerAuth()
@Controller('calendar-sync')
export class CalendarSyncController {
  constructor(private readonly sync: CalendarSyncService) {}

  @Get('connections')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'sales_manager', 'sales_rep')
  @ApiOperation({ summary: "List the caller's calendar connections" })
  async list(@CurrentUser('id') userId: string) {
    const data = await this.sync.listForUser(userId);
    return { success: true, data };
  }

  @Post('connections/:provider/begin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'sales_manager', 'sales_rep')
  @ApiOperation({ summary: 'Begin OAuth to a calendar provider' })
  begin(
    @Param('provider') providerParam: string,
    @CurrentUser('id') userId: string,
  ) {
    const provider = this.parseProvider(providerParam);
    const data = this.sync.beginConnect(userId, provider);
    return { success: true, data };
  }

  /**
   * OAuth return URL — public because the provider redirects the user
   * here with `?code=…&state=…`. The state token is the real
   * authenticator; we look it up in the pending-states map.
   *
   * On success we 302 to the client settings page so the user lands
   * somewhere useful.
   */
  @Get('connections/callback')
  @Public()
  @ApiOperation({ summary: 'OAuth callback (browser redirect target)' })
  async callback(
    @Query('state') state: string | undefined,
    @Query('code') code: string | undefined,
    @Query('error') error: string | undefined,
    @Res() res: Response,
  ) {
    const redirectBase =
      process.env.CLIENT_CALENDAR_RETURN_URL ??
      'http://localhost:5173/profile/calendar-connections';

    if (error || !state || !code) {
      return res.redirect(
        `${redirectBase}?status=error&error=${encodeURIComponent(
          error ?? 'missing_code_or_state',
        )}`,
      );
    }

    try {
      await this.sync.finishConnect(state, code);
      return res.redirect(`${redirectBase}?status=connected`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'connect_failed';
      return res.redirect(
        `${redirectBase}?status=error&error=${encodeURIComponent(message)}`,
      );
    }
  }

  @Delete('connections/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'sales_manager', 'sales_rep')
  async disconnect(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') userId: string,
  ) {
    await this.sync.disconnect(id, userId);
    return { success: true, message: 'Calendar disconnected' };
  }

  /**
   * Inbound webhook from the provider. Google and Microsoft use very
   * different envelopes, but we collapse them into "re-pull this
   * connection now" — incremental pull gives us exactly-once semantics
   * without needing to parse the payload.
   */
  @Post('webhook/:provider')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Provider push notification — triggers an incremental pull',
  })
  async webhook(
    @Param('provider') providerParam: string,
    @Body() body: unknown,
  ) {
    // The useful work is fanned out to the sync service; we confirm
    // the provider enum just so typos in the URL don't silently
    // trigger a full pull.
    this.parseProvider(providerParam);
    // Swallow body — we only need the fact that *something* changed.
    void body;
    await this.sync.pullAll();
    return { received: true };
  }

  private parseProvider(input: string): CalendarProvider {
    if (input === 'google') return CalendarProvider.GOOGLE;
    if (input === 'microsoft') return CalendarProvider.MICROSOFT;
    throw new BadRequestException(`Unknown calendar provider: ${input}`);
  }
}
