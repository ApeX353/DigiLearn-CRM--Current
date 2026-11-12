import { Injectable, Optional } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { JobRunnerService, runJob } from '../diagnostics/job-runner.service';
import { EmailSequenceService } from './email-sequence.service';

@Injectable()
export class EmailSequenceSchedulerService {
  constructor(
    private readonly emailSequenceService: EmailSequenceService,
    @Optional() private readonly jobs?: JobRunnerService,
  ) {}

  onModuleInit(): void {
    this.jobs?.registerHandler('email.sequence_queue', () => this.handleProcessQueue());
  }

  @Cron('0 */15 * * * *')
  async handleProcessQueue(): Promise<void> {
    await runJob(this.jobs, 'email.sequence_queue', async (ctx) => {
      const result = await this.emailSequenceService.processQueue();
      ctx.count('sent', result.processed);
      ctx.count('failed', result.failed);
    });
  }
}
