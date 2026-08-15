import { Test, TestingModule } from '@nestjs/testing';
import { DealsService } from './deals.service';

const mockProvider = () => ({});

function createGateQueryBuilder(options?: {
  count?: number;
  rawOne?: unknown;
}) {
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

function createGateManager(
  builders: Array<ReturnType<typeof createGateQueryBuilder>>,
) {
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

function createSummaryQueryBuilder(rawOne: Record<string, unknown>) {
  return {
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    from: jest.fn().mockReturnThis(),
    innerJoin: jest.fn().mockReturnThis(),
    leftJoin: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getRawOne: jest.fn().mockResolvedValue(rawOne),
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

  it('returns separate all/open, stage-overdue, health and invoice metrics', async () => {
    const allDealsQb = createSummaryQueryBuilder({ totalDeals: '32' });
    const openDealsQb = createSummaryQueryBuilder({
      openDeals: '6',
      pipelineValue: '54600',
      avgDealHealth: '64.6667',
      healthScoredDeals: '3',
    });
    const stageOverdueQb = createSummaryQueryBuilder({ overdueDeals: '3' });
    const collectionsQb = createSummaryQueryBuilder({
      overdueInvoiceDeals: '2',
      pendingCollections: '1234.56',
    });
    const closedTotalsQb = createSummaryQueryBuilder({
      wonDeals: '22',
      lostDeals: '4',
      lostDealValue: '19501',
    });
    const wonInvoiceQb = createSummaryQueryBuilder({
      wonInvoiceTotal: '245765.25',
    });

    (service as any).pipelineRepository = {
      findOne: jest.fn().mockResolvedValue({ id: 'pipeline-1' }),
    };
    (service as any).dealRepository = {
      createQueryBuilder: jest
        .fn()
        .mockReturnValueOnce(allDealsQb)
        .mockReturnValueOnce(openDealsQb)
        .mockReturnValueOnce(stageOverdueQb),
    };
    (service as any).dataSource = {
      createQueryBuilder: jest
        .fn()
        .mockReturnValueOnce(collectionsQb)
        .mockReturnValueOnce(closedTotalsQb)
        .mockReturnValueOnce(wonInvoiceQb),
    };

    await expect(
      service.getPipelineSummary(
        'pipeline-1',
        undefined,
        '2026-02-13T00:00:00.000Z',
        '2026-08-13T23:59:59.999Z',
      ),
    ).resolves.toMatchObject({
      total_deals: 32,
      open_deals: 6,
      pipeline_value: 54600,
      pending_collections: 1234.56,
      overdue_deals: 3,
      deals_with_overdue_invoices: 2,
      avg_deal_health: 64.67,
      health_scored_deals: 3,
      won_deals: 22,
      won_invoice_total: 245765.25,
      lost_deals: 4,
      lost_deal_value: 19501,
    });
  });

  it('blocks won/commissioned stages without accepted quote or PO evidence', async () => {
    const deal = {
      id: 'deal-won',
      lead_id: 'lead-won',
      current_stage_id: 'stage-current',
      current_stage: {
        id: 'stage-current',
        name: 'Contract Signing',
        order: 1,
      },
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
