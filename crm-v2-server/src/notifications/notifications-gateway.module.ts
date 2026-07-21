import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule } from '@nestjs/config';
import { NotificationsGateway } from './notifications.gateway';

/**
 * Provides the ONE shared NotificationsGateway for the whole app.
 *
 * The gateway was previously listed in the providers of BOTH
 * NotificationsModule and DealsModule, so Nest instantiated it twice.
 * Each instance registered its own socket.io connection handlers, so a
 * browser joined its `user:<id>` room on one instance while
 * UserNotificationsService emitted `notification:new` through the
 * other — the push silently never reached the client (in-app bell
 * still worked via REST, real-time did not).
 *
 * Making it a single @Global provider guarantees room-join and emit
 * happen on the same socket.io server. The gateway verifies tokens
 * with an explicit secret, so a bare JwtModule.register({}) is enough
 * for its JwtService dependency.
 */
@Global()
@Module({
  imports: [JwtModule.register({}), ConfigModule],
  providers: [NotificationsGateway],
  exports: [NotificationsGateway],
})
export class NotificationsGatewayModule {}
