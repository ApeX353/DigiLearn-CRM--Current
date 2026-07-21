import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { EmailSequenceService } from './email-sequence.service';

@Injectable()
export class EmailSequenceSchedulerService {
  private readonly logger = new Logger(EmailSequenceSchedulerService.name);

  constructor(
    private readonly emailSequenceService: EmailSequenceService,
  ) {}

  @Cron('0 */15 * * * *')
  async handleProcessQueue() {
    try {
      this.logger.log('Processing email sequence queue...');
      const result = await this.emailSequenceService.processQueue();
      this.logger.log(
        `Email queue processed: ${result.processed} sent, ${result.failed} failed`,
      );
    } catch (error) {
      this.logger.error(`Email queue processing failed: ${error.message}`, error.stack);
    }
  }
}
