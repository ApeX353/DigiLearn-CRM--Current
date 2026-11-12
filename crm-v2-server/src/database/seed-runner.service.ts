import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { runSeeds } from './seeds';

/**
 * Runs the idempotent baseline seeds (roles/permissions + bootstrap
 * admin) at application start.
 *
 * Active when NODE_ENV=production or DB_RUN_SEEDS=true — paired with
 * migrationsRun in DatabaseConfigService this makes a fresh production
 * deploy fully self-contained: boot → migrations build the schema →
 * seeds insert roles, permissions and a bootstrap admin.
 *
 * Every seed is find-or-create, so repeat boots are no-ops. A seed
 * failure is logged but does NOT crash the app: an already-seeded
 * database can serve traffic even if, say, a transient DB hiccup
 * interrupts the check.
 */
@Injectable()
export class SeedRunnerService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SeedRunnerService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const isProduction =
      this.configService.get<string>('NODE_ENV') === 'production' ||
      process.env.NODE_ENV === 'production';
    const optedIn =
      String(
        this.configService.get('DB_RUN_SEEDS') ?? process.env.DB_RUN_SEEDS,
      ).toLowerCase() === 'true';

    if (!isProduction && !optedIn) return;

    try {
      await runSeeds(this.dataSource);
    } catch (error) {
      this.logger.error(
        'Baseline seeding failed — fix and restart, or run `npx ts-node src/database/cli-seed.ts` manually',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
