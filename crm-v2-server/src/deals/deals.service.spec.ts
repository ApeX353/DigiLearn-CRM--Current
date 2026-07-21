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
});
