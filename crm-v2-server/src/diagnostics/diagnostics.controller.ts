import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  Header,
  NotFoundException,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { DiagnosticsVisibilityGuard } from './diagnostics-visibility.guard';
import { DiagnosticsLogService, LogKind, todayHarare } from './diagnostics-log.service';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { DiagnosticsService } from './diagnostics.service';
import { QueryEventsDto } from './dto/query-events.dto';
import { QueryClientEventsDto, QueryDeliveriesDto, QueryJobRunsDto } from './dto/query-lists.dto';
import { JOB_NAMES, JobName } from './job-registry';
import { JobRunnerService } from './job-runner.service';
import { normalizeReference } from './reference';

interface RequestingUser {
  id: string;
  roles?: Array<{ name: string }>;
}

/**
 * The investigation surface. Readable by the owner (admin) and support
 * (admin_support); stacks, request bodies and provider responses are shown
 * to admin_support only. Role names are read from `user.roles`, not from
 * the derived `role` field, which collapses admin_support into admin.
 *
 * @Roles is repeated on every handler on purpose: RolesGuard reads the
 * decorator from the handler only, so a class-level @Roles alone gates
 * nothing (see the guard; fixed as a class in the same change).
 */
@ApiTags('Diagnostics')
@ApiBearerAuth('JWT-auth')
@Controller('diagnostics')
@Roles('admin', 'admin_support')
// admin_support always; admin only once diagnostics.visible_to_admin is true.
@UseGuards(DiagnosticsVisibilityGuard)
export class DiagnosticsController {
  constructor(
    private readonly diagnostics: DiagnosticsService,
    private readonly jobs: JobRunnerService,
    private readonly log: DiagnosticsLogService,
  ) {}

  private static readonly LOG_KINDS: LogKind[] = ['action', 'session', 'automation', 'problem', 'message', 'browser'];

  private parseDay(day?: string): string {
    const d = (day ?? '').trim() || todayHarare();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new BadRequestException('day must look like 2026-10-15');
    return d;
  }

  @Get('log')
  @Roles('admin', 'admin_support')
  @ApiOperation({
    summary: 'The day log: what people and the system did on one day, in sentences, Harare time',
    description: 'Sources: audit trail, sign-ins, scheduled jobs, recorded problems, message attempts, browser errors. Repeats are folded. Filters: kinds (comma list of action,session,automation,problem,message,browser), person (user id), q (text).',
  })
  async dayLog(
    @Query('day') day?: string,
    @Query('kinds') kinds?: string,
    @Query('person') person?: string,
    @Query('q') q?: string,
  ) {
    const wanted = (kinds ?? '')
      .split(',')
      .map((k) => k.trim())
      .filter((k): k is LogKind => (DiagnosticsController.LOG_KINDS as string[]).includes(k));
    const data = await this.log.day(this.parseDay(day), {
      kinds: wanted.length ? wanted : undefined,
      person: person && /^[0-9a-f-]{36}$/i.test(person) ? person : null,
      q: q?.trim() || null,
    });
    return { success: true, data };
  }

  @Get('log.txt')
  @Roles('admin', 'admin_support')
  @Header('Content-Type', 'text/plain; charset=utf-8')
  @ApiOperation({ summary: 'The same day log as plain text, for printing or pasting' })
  async dayLogText(@Query('day') day?: string) {
    return this.log.dayAsText(this.parseDay(day));
  }

  private roleNames(user: RequestingUser): string[] {
    return (user.roles ?? []).map((r) => r.name);
  }

  private canSeeRaw(user: RequestingUser): boolean {
    return this.roleNames(user).includes('admin_support');
  }

  @Get('events')
  @Roles('admin', 'admin_support')
  @ApiOperation({ summary: 'Recorded server errors, newest first (paginated, filterable)' })
  async events(@Query() query: QueryEventsDto, @CurrentUser() user: RequestingUser) {
    const raw = this.canSeeRaw(user);
    const result = await this.diagnostics.findEvents(query);
    return {
      success: true,
      data: result.items.map((e) => this.diagnostics.redact(e, raw)),
      meta: result.meta,
      links: result.links,
    };
  }

  @Get('events/:reference')
  @Roles('admin', 'admin_support')
  @ApiOperation({ summary: 'One recorded error by its ERR- reference' })
  async event(@Param('reference') ref: string, @CurrentUser() user: RequestingUser) {
    const reference = normalizeReference(ref);
    if (!reference) throw new BadRequestException('A reference looks like ERR-7K3M2Q');
    const event = await this.diagnostics.findByReference(reference);
    if (!event) throw new NotFoundException(`No record for ${reference}. It may be older than the retention window.`);
    return { success: true, data: this.diagnostics.redact(event, this.canSeeRaw(user)) };
  }

  @Get('investigate/:reference')
  @Roles('admin', 'admin_support')
  @ApiOperation({
    summary: 'Everything around one reference in one answer',
    description:
      'The event, who it happened to, the records involved, audit rows written within five minutes, jobs running at the time, provider calls and browser events on the same request, and the build that was live. Paste this to whoever is investigating.',
  })
  async investigate(@Param('reference') ref: string, @CurrentUser() user: RequestingUser) {
    const reference = normalizeReference(ref);
    if (!reference) throw new BadRequestException('A reference looks like ERR-7K3M2Q');
    const bundle = await this.diagnostics.investigate(reference, this.canSeeRaw(user));
    if (!bundle) throw new NotFoundException(`No record for ${reference}. It may be older than the retention window.`);
    return { success: true, data: bundle };
  }

  @Get('health')
  @Roles('admin', 'admin_support')
  @ApiOperation({ summary: 'Detailed health: database, pool, memory, last 24h of events, latest job runs' })
  async health() {
    return { success: true, data: await this.diagnostics.health() };
  }

  @Get('job-runs')
  @Roles('admin', 'admin_support')
  @ApiOperation({ summary: 'Scheduled job runs, newest first (filters: name, status)' })
  async jobRuns(@Query() query: QueryJobRunsDto) {
    const result = await this.diagnostics.findJobRuns(query);
    return { success: true, data: result.items, meta: result.meta, links: result.links };
  }

  @Get('job-runs/summary')
  @Roles('admin', 'admin_support')
  @ApiOperation({ summary: 'Every scheduled job with its latest run, in plain language, flagged when overdue' })
  async jobSummary() {
    return { success: true, data: await this.diagnostics.jobSummary() };
  }

  @Post('jobs/:name/run')
  @Roles('admin_support')
  @ApiOperation({ summary: 'Run a scheduled job now (admin_support). Records a manual run.' })
  async runJob(@Param('name') name: string, @CurrentUser() user: RequestingUser) {
    if (!this.canSeeRaw(user)) throw new ForbiddenException('admin_support only');
    if (!JOB_NAMES.includes(name as JobName)) throw new NotFoundException(`Unknown job "${name}". Known: ${JOB_NAMES.join(', ')}`);
    const outcome = await this.jobs.runByName(name as JobName, user.id);
    if (outcome.status === 'unregistered') {
      throw new NotFoundException(`"${name}" is known but its service has not registered a manual handler. Registered: ${this.jobs.registeredJobs().join(', ')}`);
    }
    return { success: true, data: outcome };
  }

  @Get('delivery-attempts')
  @Roles('admin', 'admin_support')
  @ApiOperation({ summary: 'Calls to WhatsApp, e-mail and other providers, newest first (filters: channel, success, entity_id)' })
  async deliveries(@Query() query: QueryDeliveriesDto, @CurrentUser() user: RequestingUser) {
    const result = await this.diagnostics.findDeliveries(query);
    const raw = this.canSeeRaw(user);
    return {
      success: true,
      data: result.items.map((d) => (raw ? d : { ...d, response_body: d.response_body ? '[hidden]' : null })),
      meta: result.meta,
      links: result.links,
    };
  }

  @Get('client-events')
  @Roles('admin', 'admin_support')
  @ApiOperation({ summary: 'Errors reported by browsers, newest first (filters: user_id, kind)' })
  async clientEvents(@Query() query: QueryClientEventsDto, @CurrentUser() user: RequestingUser) {
    const result = await this.diagnostics.findClientEvents(query);
    const raw = this.canSeeRaw(user);
    return {
      success: true,
      data: result.items.map((c) => (raw ? c : { ...c, stack: c.stack ? '[hidden]' : null })),
      meta: result.meta,
      links: result.links,
    };
  }

  @Get('people')
  @Roles('admin', 'admin_support')
  @ApiOperation({
    summary: 'Every active user, with what the last days looked like from the system side',
    description: 'For reaching out before anyone complains: last seen, errors hit, refused actions, the page it mostly happens on, in sentences.',
  })
  async people(@Query('days') days?: string) {
    const d = Math.min(Math.max(parseInt(days || '7', 10) || 7, 1), 30);
    return { success: true, data: await this.diagnostics.people(d) };
  }

  @Post('self-test')
  @Roles('admin_support')
  @ApiOperation({
    summary: 'Throw on purpose so the capture path can be proven end to end',
    description: 'Answers 500 with a reference; GET /diagnostics/investigate/<reference> must then show this request. Disabled in production unless the setting diagnostics.allow_self_test is true.',
  })
  async selfTest(@CurrentUser() user: RequestingUser) {
    if (!this.canSeeRaw(user)) throw new ForbiddenException('admin_support only');
    if (process.env.NODE_ENV === 'production') {
      const allowed = await this.diagnostics.getFlag('diagnostics.allow_self_test', false);
      if (!allowed) throw new ForbiddenException('Self-test is off in production (setting diagnostics.allow_self_test)');
    }
    throw new Error('Diagnostics self-test: this error was thrown on purpose');
  }
}
