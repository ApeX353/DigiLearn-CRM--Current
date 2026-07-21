import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual } from 'typeorm';
import { EmailSequence } from './entities/email-sequence.entity';
import { EmailQueue } from './entities/email-queue.entity';
import { Lead } from '../leads/entities/lead.entity';
import { Contact } from '../contacts/entities/contact.entity';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class EmailSequenceService {
  private readonly logger = new Logger(EmailSequenceService.name);

  constructor(
    @InjectRepository(EmailSequence)
    private readonly sequenceRepository: Repository<EmailSequence>,
    @InjectRepository(EmailQueue)
    private readonly queueRepository: Repository<EmailQueue>,
    @InjectRepository(Lead)
    private readonly leadRepository: Repository<Lead>,
    @InjectRepository(Contact)
    private readonly contactRepository: Repository<Contact>,
    private readonly notificationsService: NotificationsService,
  ) {}

  // ========================
  // Trigger a sequence
  // ========================

  async triggerSequence(triggerEvent: string, leadId: string): Promise<void> {
    const sequences = await this.sequenceRepository.find({
      where: { trigger_event: triggerEvent, is_active: true },
    });

    if (sequences.length === 0) return;

    const now = new Date();

    for (const sequence of sequences) {
      // Cancel any existing pending queue items for this lead + sequence
      await this.queueRepository
        .createQueryBuilder()
        .update(EmailQueue)
        .set({ status: 'cancelled' })
        .where('lead_id = :leadId', { leadId })
        .andWhere('sequence_id = :sequenceId', { sequenceId: sequence.id })
        .andWhere('status = :status', { status: 'pending' })
        .execute();

      // Enqueue all steps
      let cumulativeDelay = 0;
      for (let i = 0; i < sequence.steps.length; i++) {
        const step = sequence.steps[i];
        cumulativeDelay += step.delay_hours;

        const scheduledAt = new Date(
          now.getTime() + cumulativeDelay * 3600000,
        );

        const queueItem = this.queueRepository.create({
          lead_id: leadId,
          sequence_id: sequence.id,
          step_index: i,
          scheduled_at: scheduledAt,
          status: 'pending',
        });

        await this.queueRepository.save(queueItem);
      }

      this.logger.log(
        `Triggered sequence "${sequence.name}" for lead ${leadId} with ${sequence.steps.length} steps`,
      );
    }
  }

  // ========================
  // Process the queue
  // ========================

  async processQueue(): Promise<{ processed: number; failed: number }> {
    const now = new Date();
    let processed = 0;
    let failed = 0;

    const pendingItems = await this.queueRepository.find({
      where: {
        status: 'pending',
        scheduled_at: LessThanOrEqual(now),
      },
      relations: ['sequence', 'lead'],
      order: { scheduled_at: 'ASC' },
      take: 50,
    });

    for (const item of pendingItems) {
      try {
        const sequence = item.sequence;
        const lead = item.lead;

        if (!sequence || !lead) {
          await this.queueRepository.update(item.id, {
            status: 'failed',
            error_message: 'Sequence or lead not found',
          });
          failed++;
          continue;
        }

        const step = sequence.steps[item.step_index];
        if (!step) {
          await this.queueRepository.update(item.id, {
            status: 'failed',
            error_message: `Step index ${item.step_index} not found in sequence`,
          });
          failed++;
          continue;
        }

        // Get contact email
        let recipientEmail: string | null = null;
        if (lead.primary_contact_id) {
          const contact = await this.contactRepository.findOne({
            where: { id: lead.primary_contact_id },
          });
          recipientEmail = contact?.email || null;
        }

        if (!recipientEmail) {
          await this.queueRepository.update(item.id, {
            status: 'failed',
            error_message: 'No contact email found for lead',
          });
          failed++;
          continue;
        }

        // Send email
        const result = await this.notificationsService.sendEmailWithTemplate(
          recipientEmail,
          step.subject,
          step.template_name,
          {
            leadName: lead.lead_name,
            contactName: recipientEmail,
            appName: 'DigiLearn CRM',
            year: new Date().getFullYear(),
          },
        );

        if (result.success) {
          await this.queueRepository.update(item.id, {
            status: 'sent',
            sent_at: new Date(),
          });
          processed++;
        } else {
          await this.queueRepository.update(item.id, {
            status: 'failed',
            error_message: result.error || 'Email send failed',
          });
          failed++;
        }
      } catch (error) {
        await this.queueRepository.update(item.id, {
          status: 'failed',
          error_message: error.message,
        });
        failed++;
      }
    }

    return { processed, failed };
  }

  // ========================
  // CRUD
  // ========================

  async create(data: Partial<EmailSequence>): Promise<EmailSequence> {
    const sequence = this.sequenceRepository.create(data);
    return this.sequenceRepository.save(sequence);
  }

  async findAll(): Promise<EmailSequence[]> {
    return this.sequenceRepository.find({ order: { created_at: 'DESC' } });
  }

  async findOne(id: string): Promise<EmailSequence> {
    const sequence = await this.sequenceRepository.findOne({ where: { id } });
    if (!sequence) throw new NotFoundException('Email sequence not found');
    return sequence;
  }

  async update(
    id: string,
    data: Partial<EmailSequence>,
  ): Promise<EmailSequence> {
    const sequence = await this.findOne(id);
    Object.assign(sequence, data);
    return this.sequenceRepository.save(sequence);
  }

  async remove(id: string): Promise<void> {
    const sequence = await this.findOne(id);
    await this.sequenceRepository.remove(sequence);
  }

  // ========================
  // Queue viewer
  // ========================

  async getQueueItems(
    status?: string,
  ): Promise<EmailQueue[]> {
    const where: any = {};
    if (status) where.status = status;

    return this.queueRepository.find({
      where,
      relations: ['sequence', 'lead'],
      order: { scheduled_at: 'DESC' },
      take: 100,
    });
  }
}
