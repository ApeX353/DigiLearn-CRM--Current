import {
  BadRequestException,
  Controller,
  Delete,
  Get,
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
import { VideoIntegrationsService } from './services/video-integrations.service';
import { VideoProvider } from './entities/video-provider-connection.entity';

/**
 * Surface area mirrors calendar-sync so the frontend only has to reason
 * about one pattern:
 *
 *   GET    /video-integrations/connections                 — list mine
 *   POST   /video-integrations/connections/:provider/begin — start OAuth
 *   GET    /video-integrations/connections/callback        — OAuth return
 *   DELETE /video-integrations/connections/:id             — revoke
 *
 * Callback is Public because the provider hits us with a browser
 * redirect; the signed state nonce is the real authenticator.
 */
@ApiTags('Video Integrations')
@ApiBearerAuth()
@Controller('video-integrations')
export class VideoIntegrationsController {
  constructor(private readonly svc: VideoIntegrationsService) {}

  @Get('connections')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'sales_manager', 'sales_rep')
  @ApiOperation({ summary: "List the caller's video provider connections" })
  async list(@CurrentUser('id') userId: string) {
    const data = await this.svc.listForUser(userId);
    return { success: true, data };
  }

  @Post('connections/:provider/begin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'sales_manager', 'sales_rep')
  @ApiOperation({ summary: 'Begin OAuth to a video conferencing provider' })
  begin(
    @Param('provider') providerParam: string,
    @CurrentUser('id') userId: string,
  ) {
    const provider = this.parseProvider(providerParam);
    const data = this.svc.beginConnect(userId, provider);
    return { success: true, data };
  }

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
      process.env.CLIENT_VIDEO_RETURN_URL ??
      'http://localhost:5173/profile/video-connections';

    if (error || !state || !code) {
      return res.redirect(
        `${redirectBase}?status=error&error=${encodeURIComponent(
          error ?? 'missing_code_or_state',
        )}`,
      );
    }

    try {
      await this.svc.finishConnect(state, code);
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
    await this.svc.disconnect(id, userId);
    return { success: true, message: 'Video provider disconnected' };
  }

  private parseProvider(input: string): VideoProvider {
    if (input === 'zoom') return VideoProvider.ZOOM;
    if (input === 'google_meet') return VideoProvider.GOOGLE_MEET;
    if (input === 'teams') return VideoProvider.TEAMS;
    throw new BadRequestException(`Unknown video provider: ${input}`);
  }
}
