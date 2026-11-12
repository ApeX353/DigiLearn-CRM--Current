import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AllowPendingPasswordChange } from '../auth/decorators/allow-pending-password-change.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { SkipRolesCheck } from '../auth/decorators/skip-roles-check.decorator';
import { DiagnosticsService } from './diagnostics.service';
import { ClientEventsBatchDto } from './dto/client-events.dto';

/**
 * Where the browser reports what went wrong on its side. Any signed-in user
 * may post (that is the point: the people who never file a bug report still
 * leave a trace), including one who still owes a password change. Throttled
 * per client so a looping page cannot flood the table; the client batches
 * and dedupes before sending as well.
 */
@ApiTags('Diagnostics')
@ApiBearerAuth('JWT-auth')
@Controller('diagnostics')
export class ClientEventsController {
  constructor(private readonly diagnostics: DiagnosticsService) {}

  @Post('client-events')
  @HttpCode(202)
  @SkipRolesCheck()
  @AllowPendingPasswordChange()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: 'Report browser-side errors and failed requests (batched, at most 20 per call)' })
  async ingest(@Body() body: ClientEventsBatchDto, @CurrentUser('id') userId: string | undefined) {
    const accepted = await this.diagnostics.recordClientEvents(userId ?? null, body.events);
    return { success: true, accepted };
  }
}
