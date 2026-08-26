import { Test, TestingModule } from '@nestjs/testing';
import { DealsService } from './deals.service';

const mockProvider = () => ({});

function createGateQueryBuilder(options?: { count?: number; rawOne?: unknown }) {
  return {
    select: jest.fn().mockReturnThis(),
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orWhere: jest.fn().mockReturnThis(),
    getCount: jest.fn().mockResolvedValue(options?.count ?? 0),
    getRawOne: jest.fn().mockResolvedValue(options?.rawOne),
  };
}

function createGateManager(builders: Array<ReturnType<typeof createGateQueryBuilder>>) {
  return {
    createQueryBuilder: jest.fn(() => {
      const builder = builders.shift();
      if (!builder) {
        throw new Error('Unexpected query builder call');
      }
      return builder;
    }),
  };
}

describe('DealsService', () => {
  let service: DealsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DealsService],
    })
      .useMocker(mockProvider)
      .compile();

    service = module.get<DealsService>(DealsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('blocks skipping required pipeline stages', async () => {
    const deal = {
      id: 'deal-skip',
      current_stage_id: 'stage-current',
      current_stage: { id: 'stage-current', name: 'Demo Booked', order: 1 },
    };
    const targetStage = {
      id: 'stage-target',
      name: 'PO Issued',
      order: 3,
    };

    await expect(
      (service as any).assertStageGateEvidence(
        createGateManager([]),
        deal,
        targetStage,
      ),
    ).rejects.toThrow('Deal stage cannot skip');
  });

  it('blocks Demo Booked without scheduled demo evidence', async () => {
    const deal = {
      id: 'deal-demo',
      lead_id: 'lead-demo',
      current_stage_id: 'stage-current',
      current_stage: { id: 'stage-current', name: 'Contacted', order: 1 },
    };
    const targetStage = {
      id: 'stage-demo-booked',
      name: 'Demo Booked',
      order: 2,
    };

    await expect(
      (service as any).assertStageGateEvidence(
        createGateManager([createGateQueryBuilder({ count: 0 })]),
        deal,
        targetStage,
      ),
    ).rejects.toThrow('schedule a demo meeting');
  });

  it('allows Quotation Sent when proposal activity evidence exists', async () => {
    const deal = {
      id: 'deal-quote',
      lead_id: 'lead-quote',
      current_stage_id: 'stage-current',
      current_stage: { id: 'stage-current', name: 'Demo Completed', order: 1 },
    };
    const targetStage = {
      id: 'stage-quote',
      name: 'Quotation Sent',
      order: 2,
    };

    await expect(
      (service as any).assertStageGateEvidence(
        createGateManager([
          createGateQueryBuilder({ rawOne: undefined }),
          createGateQueryBuilder({ count: 1 }),
        ]),
        deal,
        targetStage,
      ),
    ).resolves.toBeUndefined();
  });

  it('blocks won/commissioned stages without accepted quote or PO evidence', async () => {
    const deal = {
      id: 'deal-won',
      lead_id: 'lead-won',
      current_stage_id: 'stage-current',
      current_stage: { id: 'stage-current', name: 'Contract Signing', order: 1 },
    };
    const targetStage = {
      id: 'stage-won',
      name: 'Commissioned/Won',
      order: 2,
    };

    await expect(
      (service as any).assertStageGateEvidence(
        createGateManager([createGateQueryBuilder({ rawOne: undefined })]),
        deal,
        targetStage,
      ),
    ).rejects.toThrow('accepted quotation or PO evidence');
  });

  describe('closeDeal moves the card, not just the status', () => {
    const COMMISSIONED = {
      id: 'stage-commissioned',
      name: 'Commissioned / Training Completed',
      order: 8,
    };
    const DELIVERY = {
      id: 'stage-delivery',
      name: 'Delivery & Installation',
      order: 7,
    };

    /**
     * Wires the service's injected deps for a close. `stages` stands in
     * for what the pipeline holds, newest-order-first as the real query
     * returns them.
     */
    function wire(stages: any[]) {
      const manager = {
        find: jest.fn().mockResolvedValue(stages),
        update: jest.fn().mockResolvedValue(undefined),
        createQueryBuilder: jest.fn(() => ({
          update: jest.fn().mockReturnThis(),
          set: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          execute: jest.fn().mockResolvedValue({ affected: 0 }),
        })),
      };
      (service as any).dealRepository = {
        findOne: jest.fn().mockResolvedValue({
          id: 'deal-1',
          title: 'Petra College Junior',
          pipeline_id: 'pipe-1',
          current_stage_id: DELIVERY.id,
          currentStatus: DELIVERY.name,
          current_stage: { ...DELIVERY, sla_days: 0 },
          closeStatus: 'ongoing',
        }),
      };
      (service as any).dataSource = {
        transaction: jest.fn(async (cb: any) => cb(manager)),
      };
      (service as any).activityLogsService = { logUpdate: jest.fn() };
      (service as any).findDealDetails = jest
        .fn()
        .mockResolvedValue({ id: 'deal-1' });
      return manager;
    }

    it('moves a won deal onto the terminal stage via the normal transition', async () => {
      const manager = wire([COMMISSIONED, DELIVERY]);
      const transition = jest
        .spyOn(service as any, 'buildStageTransitionUpdatePayload')
        .mockResolvedValue({
          current_stage_id: COMMISSIONED.id,
          closeStatus: 'won',
        });

      await service.closeDeal('deal-1', { close_status: 'won' } as any, 'user-1');

      // Only active stages, latest first — a retired stage must not
      // become a dumping ground for closed deals.
      expect(manager.find).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          where: { pipeline_id: 'pipe-1', is_active: true },
          order: { order: 'DESC' },
        }),
      );
      expect(transition).toHaveBeenCalledWith(
        manager,
        expect.objectContaining({
          targetStage: expect.objectContaining({ id: COMMISSIONED.id }),
        }),
      );
      expect(manager.update.mock.calls[0][2]).toEqual(
        expect.objectContaining({ current_stage_id: COMMISSIONED.id }),
      );
      expect(
        (service as any).activityLogsService.logUpdate.mock.calls.at(-1)[5],
      ).toContain('moved it to "Commissioned / Training Completed"');
    });

    it('still closes when the pipeline has no stage for that outcome', async () => {
      // The seeded production pipeline has no Lost stage. Refusing to
      // close would be worse than leaving the card where it stands.
      const manager = wire([COMMISSIONED, DELIVERY]);
      const transition = jest.spyOn(
        service as any,
        'buildStageTransitionUpdatePayload',
      );

      await service.closeDeal(
        'deal-1',
        { close_status: 'lost', lost_reason: 'Budget withdrawn' } as any,
        'user-1',
      );

      expect(transition).not.toHaveBeenCalled();
      expect(manager.update.mock.calls[0][2]).toEqual(
        expect.objectContaining({
          closeStatus: 'lost',
          lostReason: 'Budget withdrawn',
        }),
      );
      expect(
        (service as any).activityLogsService.logUpdate.mock.calls.at(-1)[5],
      ).toContain('no lost stage in this pipeline');
    });
  });
});
