import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VideoProviderConnection } from './entities/video-provider-connection.entity';
import { VideoIntegrationsService } from './services/video-integrations.service';
import { VideoIntegrationsController } from './video-integrations.controller';
import { ZoomAdapter } from './adapters/zoom.adapter';
import { UserEmailModule } from '../user-email/user-email.module';
import { AuthModule } from '../auth/auth.module';

/**
 * Section 2 of the spec — per-user Zoom/Meet/Teams connections so a
 * confirmed booking can auto-generate a join link. Mirrors the
 * calendar-sync module's shape:
 *
 *   - Token blobs are encrypted via the shared CredentialsCipher.
 *   - OAuth state nonces live in-memory (Redis upgrade path noted).
 *   - Only Zoom has an adapter skeleton today; Meet/Teams throw
 *     NotImplementedException from the service dispatcher.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([VideoProviderConnection]),
    UserEmailModule,
    // RolesGuard + JwtAuthGuard referenced by @UseGuards in this
    // module's controller are provided by AuthModule. forwardRef to
    // match the pattern used by leads/invoices/quotes and avoid any
    // future circular-import surprises.
    forwardRef(() => AuthModule),
  ],
  controllers: [VideoIntegrationsController],
  providers: [VideoIntegrationsService, ZoomAdapter],
  exports: [VideoIntegrationsService],
})
export class VideoIntegrationsModule {}
