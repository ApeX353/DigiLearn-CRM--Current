import { Controller, Get, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { DataSource } from 'typeorm';
import { Public } from '../auth/decorators/public.decorator';
import { getBuildInfo } from './build-info';

const startedAt = Date.now();

/**
 * "Is it up?" — for CapRover, a terminal, or a browser, with no credentials.
 * Says nothing but whether the database answers and which build is running;
 * the detailed picture is GET /diagnostics/health, authenticated.
 *
 *   curl -i https://api.digilearncrm.work/api/v2/health
 */
@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(private readonly dataSource: DataSource) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Liveness: 200 when the database answers, 503 otherwise' })
  async health(@Res() res: Response) {
    const t0 = Date.now();
    let db: 'ok' | 'down' = 'ok';
    try {
      await Promise.race([
        this.dataSource.query('SELECT 1'),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000)),
      ]);
    } catch {
      db = 'down';
    }
    const info = getBuildInfo();
    res.status(db === 'ok' ? 200 : 503).json({
      status: db === 'ok' ? 'ok' : 'degraded',
      db,
      dbLatencyMs: Date.now() - t0,
      uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
      commit: info.shortCommit,
      now: new Date().toISOString(),
    });
  }
}
