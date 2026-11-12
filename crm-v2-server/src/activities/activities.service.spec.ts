import { Test, TestingModule } from '@nestjs/testing';
import { ActivitiesService } from './activities.service';
import {
  ActivityOutcome,
  ActivityStatus,
  ActivityType,
} from './entities/activity.entity';
import { NextStepPayloadDto } from './dto/update-status.dto';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

const mockProvider = () => ({});

describe('ActivitiesService', () => {
  let service: ActivitiesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ActivitiesService],
    })
      .useMocker(mockProvider)
      .compile();

    service = module.get<ActivitiesService>(ActivitiesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('does not clear SLA breach fields when completing a contact activity', async () => {
    const completedAt = new Date('2026-04-26T08:00:00.000Z');
    const manager = {
      findOne: jest.fn().mockResolvedValue({
        id: 'lead-sla',
        status: 'Contacted',
        sla_breached: true,
        current_sla_due_date: new Date('2026-04-25T08:00:00.000Z'),
      }),
      update: jest.fn().mockResolvedValue(undefined),
    };

    await (service as any).updateLeadContactStatus(
      manager,
      {
        id: 'activity-call',
        type: ActivityType.CALL,
        lead_id: 'lead-sla',
        completed_at: completedAt,
      },
      'complete',
    );

    expect(manager.update).toHaveBeenCalledWith(
      expect.any(Function),
      { id: 'lead-sla' },
      expect.objectContaining({
        last_contacted_at: completedAt,
      }),
    );
    expect(manager.update.mock.calls[0][2]).not.toHaveProperty('sla_breached');
    expect(manager.update.mock.calls[0][2]).not.toHaveProperty(
      'current_sla_due_date',
    );
  });

  it('accepts a selected contact id in an atomic next-step payload', async () => {
    const payload = plainToInstance(NextStepPayloadDto, {
      type: ActivityType.CALL,
      subject: 'Call the bursar',
      due_at: '2026-08-14T09:00:00.000Z',
      contact_id: 'a7af1954-2fbf-4c9e-8478-5b2da66f3a2a',
    });

    await expect(validate(payload)).resolves.toHaveLength(0);
  });

  it('rejects a malformed selected contact id', async () => {
    const payload = plainToInstance(NextStepPayloadDto, {
      type: ActivityType.EMAIL,
      subject: 'Send the quote',
      due_at: '2026-08-14T09:00:00.000Z',
      contact_id: 'not-a-contact-id',
    });

    const errors = await validate(payload);
    expect(errors.some((error) => error.property === 'contact_id')).toBe(true);
  });

  it('rejects a selected next-step contact from another school', async () => {
    jest.spyOn(service, 'findOne').mockResolvedValue({
      id: 'activity-1',
      status: ActivityStatus.COMPLETED,
      lead_id: 'lead-1',
      lead: { school_id: 'school-1' },
    } as any);
    (service as any).dataSource = {
      manager: {
        findOne: jest.fn().mockResolvedValue({
          id: 'contact-2',
          school_id: 'school-2',
          phone: '+263771234567',
        }),
      },
    };

    await expect(
      service.updateStatus(
        'activity-1',
        ActivityStatus.COMPLETED,
        'user-1',
        ActivityOutcome.SUCCESSFUL,
        'Called the school',
        {
          type: ActivityType.CALL,
          subject: 'Call again',
          due_at: '2099-08-14T09:00:00.000Z',
          contact_id: 'a7af1954-2fbf-4c9e-8478-5b2da66f3a2a',
        },
      ),
    ).rejects.toThrow('does not belong to this lead');
  });
});
