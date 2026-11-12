import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { getBuildInfo } from './build-info';

/**
 * "Which commit is this?" — answerable in one request, by anyone.
 *
 * Deliberately public and unauthenticated: the whole point is that a
 * deploy can be verified from a terminal, from CI, or by a person with a
 * browser, without credentials and without decompiling a bundle. It
 * exposes nothing but the commit the running code was built from.
 *
 *   curl https://api.digilearncrm.work/api/v2/version
 */
@ApiTags('Health')
@Controller('version')
export class VersionController {
  @Public()
  @Get()
  @ApiOperation({
    summary: 'The commit this API was built from',
    description:
      'Unauthenticated. Compare against `git rev-parse origin/master` to prove a deploy shipped what was intended.',
  })
  @ApiResponse({ status: 200, description: 'Build information' })
  version() {
    const info = getBuildInfo();
    return {
      commit: info.commit,
      shortCommit: info.shortCommit,
      branch: info.branch,
      builtAt: info.builtAt,
      source: info.source,
      startedAt: startedAt,
      now: new Date().toISOString(),
    };
  }
}

const startedAt = new Date().toISOString();
