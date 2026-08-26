import { Test, TestingModule } from '@nestjs/testing';
import { ActivitiesService } from './activities.service';
import { ActivityType } from './entities/activity.entity';

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
});
