import { DashboardService } from './dashboard.service';
import type { DashboardFiltersDto } from './dto/dashboard-filters.dto';

type QueryBuilderMock = {
  select: jest.Mock;
  addSelect: jest.Mock;
  where: jest.Mock;
  andWhere: jest.Mock;
  innerJoin: jest.Mock;
  leftJoin: jest.Mock;
  leftJoinAndSelect: jest.Mock;
  groupBy: jest.Mock;
  orderBy: jest.Mock;
  addOrderBy: jest.Mock;
  getRawOne: jest.Mock;
  getRawMany: jest.Mock;
  getMany: jest.Mock;
};

function createQueryBuilderMock(options?: {
  rawOne?: Record<string, unknown>;
  rawMany?: Record<string, unknown>[];
  many?: Record<string, unknown>[];
}): QueryBuilderMock {
  return {
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    innerJoin: jest.fn().mockReturnThis(),
    leftJoin: jest.fn().mockReturnThis(),
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    getRawOne: jest.fn().mockResolvedValue(options?.rawOne ?? {}),
    getRawMany: jest.fn().mockResolvedValue(options?.rawMany ?? []),
    getMany: jest.fn().mockResolvedValue(options?.many ?? []),
  };
}

function queueBuilders(mockFn: jest.Mock, builders: QueryBuilderMock[]): void {
  mockFn.mockImplementation(() => {
    const builder = builders.shift();
    if (!builder) {
      throw new Error('Unexpected query builder invocation');
    }
    return builder;
  });
}

describe('DashboardService (leads contacted)', () => {
  let service: DashboardService;

  const activityRepo = { createQueryBuilder: jest.fn() };
  const userRepo = { createQueryBuilder: jest.fn() };
  const settingsService = { getSetting: jest.fn() };

  const baseFilters: DashboardFiltersDto = { dateRange: 'mtd' };

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 2, 2, 10, 0, 0));

    activityRepo.createQueryBuilder.mockReset();
    userRepo.createQueryBuilder.mockReset();
    settingsService.getSetting.mockReset();

    service = new DashboardService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      activityRepo as any,
      {} as any,
      {} as any,
      userRepo as any,
      {} as any,
      settingsService as any,
      // Phase A.3 — ComplianceSettingsService mock. Returns the
      // documented defaults so the dashboard arithmetic stays
      // identical to the legacy hard-coded values.
      {
        getNumber: async (k: string) =>
          k === 'monthly_revenue_target'
            ? 100000
            : k === 'expected_win_rate'
              ? 0.25
              : k === 'high_value_threshold'
                ? 20000
                : k === 'daily_contacts_per_rep'
                  ? 40
                  : k === 'daily_contacts_per_manager'
                    ? 10
                    : 0,
        getBoolean: async () => false,
      } as any,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('resolves target from nested defaults.daily_leads_target', async () => {
    settingsService.getSetting.mockResolvedValueOnce({
      value: { daily_leads_target: '55' },
    });

    const activityBuilders = [
      createQueryBuilderMock({ rawMany: [{ repId: 'rep-1' }] }),
      createQueryBuilderMock({ rawOne: { count: 3 } }),
      createQueryBuilderMock({
        rawMany: [
          { day: '2026-03-01', count: 1 },
          { day: '2026-03-02', count: 2 },
        ],
      }),
      createQueryBuilderMock({
        rawMany: [{ day: '2026-03-01' }, { day: '2026-03-02' }],
      }),
    ];
    const userBuilders = [
      createQueryBuilderMock({
        many: [
          {
            id: 'rep-1',
            first_name: 'Ada',
            last_name: 'Lovelace',
            email: 'ada@example.com',
          },
        ],
      }),
    ];
    queueBuilders(activityRepo.createQueryBuilder, activityBuilders);
    queueBuilders(userRepo.createQueryBuilder, userBuilders);

    const result = await service.getLeadsContactedStats(
      baseFilters,
      'admin-1',
      'admin',
    );

    expect(result.target).toBe(55);
    expect(result.byRep[0].target).toBe(55);
    expect(settingsService.getSetting).toHaveBeenCalledTimes(1);
    expect(settingsService.getSetting).toHaveBeenCalledWith('defaults');
  });

  it('falls back to dotted defaults.daily_leads_target when nested value is missing', async () => {
    settingsService.getSetting
      .mockResolvedValueOnce({ value: {} })
      .mockResolvedValueOnce({ value: '60' });

    const activityBuilders = [
      createQueryBuilderMock({ rawMany: [{ repId: 'rep-2' }] }),
      createQueryBuilderMock({ rawOne: { count: 1 } }),
      createQueryBuilderMock({ rawMany: [{ day: '2026-03-01', count: 4 }] }),
      createQueryBuilderMock({ rawMany: [{ day: '2026-03-01' }] }),
    ];
    const userBuilders = [
      createQueryBuilderMock({
        many: [
          {
            id: 'rep-2',
            first_name: 'Grace',
            last_name: 'Hopper',
            email: 'grace@example.com',
          },
        ],
      }),
    ];
    queueBuilders(activityRepo.createQueryBuilder, activityBuilders);
    queueBuilders(userRepo.createQueryBuilder, userBuilders);

    const result = await service.getLeadsContactedStats(
      baseFilters,
      'admin-1',
      'admin',
    );

    expect(result.target).toBe(60);
    expect(result.byRep[0].target).toBe(60);
    expect(settingsService.getSetting).toHaveBeenNthCalledWith(1, 'defaults');
    expect(settingsService.getSetting).toHaveBeenNthCalledWith(
      2,
      'defaults.daily_leads_target',
    );
  });

  it('falls back to default 40 when settings values are invalid', async () => {
    settingsService.getSetting
      .mockResolvedValueOnce({ value: { daily_leads_target: 'invalid' } })
      .mockResolvedValueOnce({ value: 0 });

    const activityBuilders = [
      createQueryBuilderMock({ rawMany: [{ repId: 'rep-3' }] }),
      createQueryBuilderMock({ rawOne: { count: 2 } }),
      createQueryBuilderMock({ rawMany: [{ day: '2026-03-02', count: 2 }] }),
      createQueryBuilderMock({ rawMany: [{ day: '2026-03-02' }] }),
    ];
    const userBuilders = [
      createQueryBuilderMock({
        many: [
          {
            id: 'rep-3',
            first_name: 'Alan',
            last_name: 'Turing',
            email: 'alan@example.com',
          },
        ],
      }),
    ];
    queueBuilders(activityRepo.createQueryBuilder, activityBuilders);
    queueBuilders(userRepo.createQueryBuilder, userBuilders);

    const result = await service.getLeadsContactedStats(
      baseFilters,
      'admin-1',
      'admin',
    );

    expect(result.target).toBe(40);
    expect(result.byRep[0].target).toBe(40);
  });

  it('keeps today fixed and computes averages plus missedDays over selected range', async () => {
    settingsService.getSetting.mockResolvedValueOnce({
      value: { daily_leads_target: 40 },
    });

    const filters: DashboardFiltersDto = {
      dateRange: 'custom',
      startDate: '2026-02-20',
      endDate: '2026-03-01',
    };

    const activityBuilders = [
      createQueryBuilderMock({ rawMany: [{ repId: 'rep-4' }] }),
      createQueryBuilderMock({ rawOne: { count: 2 } }),
      createQueryBuilderMock({
        rawMany: [
          { day: '2026-02-21', count: 4 },
          { day: '2026-02-28', count: 2 },
        ],
      }),
      createQueryBuilderMock({
        rawMany: [{ day: '2026-02-21' }, { day: '2026-02-28' }],
      }),
    ];
    const userBuilders = [
      createQueryBuilderMock({
        many: [
          {
            id: 'rep-4',
            first_name: 'Linus',
            last_name: 'Torvalds',
            email: 'linus@example.com',
          },
        ],
      }),
    ];
    queueBuilders(activityRepo.createQueryBuilder, activityBuilders);
    queueBuilders(userRepo.createQueryBuilder, userBuilders);

    const result = await service.getLeadsContactedStats(filters, 'admin-1', 'admin');

    expect(result.today).toBe(2);
    expect(result.byRep[0].mtdTotal).toBe(6);
    expect(result.byRep[0].mtdAverage).toBe(0.6);
    expect(result.mtdAverage).toBe(0.6);
    expect(result.missedDays).toBe(8);
  });

  it('builds byRep from active users with qualifying activity only', async () => {
    settingsService.getSetting.mockResolvedValueOnce({
      value: { daily_leads_target: 40 },
    });

    const activityBuilders = [
      createQueryBuilderMock({
        rawMany: [{ repId: 'rep-1' }, { repId: 'rep-2' }, { repId: 'rep-3' }],
      }),
      createQueryBuilderMock({ rawOne: { count: 1 } }),
      createQueryBuilderMock({ rawMany: [{ day: '2026-03-01', count: 2 }] }),
      createQueryBuilderMock({ rawOne: { count: 3 } }),
      createQueryBuilderMock({ rawMany: [{ day: '2026-03-02', count: 5 }] }),
      createQueryBuilderMock({ rawMany: [{ day: '2026-03-01' }] }),
    ];
    const userBuilders = [
      createQueryBuilderMock({
        many: [
          {
            id: 'rep-1',
            first_name: 'Marie',
            last_name: 'Curie',
            email: 'marie@example.com',
          },
          {
            id: 'rep-2',
            first_name: 'Niels',
            last_name: 'Bohr',
            email: 'niels@example.com',
          },
        ],
      }),
    ];
    queueBuilders(activityRepo.createQueryBuilder, activityBuilders);
    queueBuilders(userRepo.createQueryBuilder, userBuilders);

    const result = await service.getLeadsContactedStats(
      baseFilters,
      'admin-1',
      'admin',
    );

    expect(result.byRep.map((rep) => rep.repId)).toEqual(['rep-1', 'rep-2']);
    expect(result.target).toBe(80);
  });

  it('applies sales_rep role restriction to scoped activity queries', async () => {
    settingsService.getSetting.mockResolvedValueOnce({
      value: { daily_leads_target: 40 },
    });

    const cohortQb = createQueryBuilderMock({ rawMany: [{ repId: 'rep-5' }] });
    const activityBuilders = [
      cohortQb,
      createQueryBuilderMock({ rawOne: { count: 1 } }),
      createQueryBuilderMock({ rawMany: [{ day: '2026-03-02', count: 1 }] }),
      createQueryBuilderMock({ rawMany: [{ day: '2026-03-02' }] }),
    ];
    const userBuilders = [
      createQueryBuilderMock({
        many: [
          {
            id: 'rep-5',
            first_name: 'Katherine',
            last_name: 'Johnson',
            email: 'katherine@example.com',
          },
        ],
      }),
    ];
    queueBuilders(activityRepo.createQueryBuilder, activityBuilders);
    queueBuilders(userRepo.createQueryBuilder, userBuilders);

    const result = await service.getLeadsContactedStats(
      baseFilters,
      'rep-5',
      'sales_rep',
    );

    expect(cohortQb.andWhere).toHaveBeenCalledWith(
      'a.created_by_id = :currentUserId',
      { currentUserId: 'rep-5' },
    );
    expect(result.byRep).toHaveLength(1);
    expect(result.byRep[0].repId).toBe('rep-5');
  });

  it('applies explicit salesRepId filter to scoped activity queries', async () => {
    settingsService.getSetting.mockResolvedValueOnce({
      value: { daily_leads_target: 40 },
    });

    const cohortQb = createQueryBuilderMock({ rawMany: [{ repId: 'rep-9' }] });
    const activityBuilders = [
      cohortQb,
      createQueryBuilderMock({ rawOne: { count: 2 } }),
      createQueryBuilderMock({ rawMany: [{ day: '2026-03-02', count: 2 }] }),
      createQueryBuilderMock({ rawMany: [{ day: '2026-03-02' }] }),
    ];
    const userBuilders = [
      createQueryBuilderMock({
        many: [
          {
            id: 'rep-9',
            first_name: 'Barbara',
            last_name: 'Liskov',
            email: 'barbara@example.com',
          },
        ],
      }),
    ];
    queueBuilders(activityRepo.createQueryBuilder, activityBuilders);
    queueBuilders(userRepo.createQueryBuilder, userBuilders);

    const filters: DashboardFiltersDto = {
      ...baseFilters,
      salesRepId: 'rep-9',
    };
    const result = await service.getLeadsContactedStats(filters, 'admin-1', 'admin');

    expect(cohortQb.andWhere).toHaveBeenCalledWith(
      'a.created_by_id = :selectedRepId',
      { selectedRepId: 'rep-9' },
    );
    expect(result.byRep).toHaveLength(1);
    expect(result.byRep[0].repId).toBe('rep-9');
  });

  it('applies province filter to activity queries and aggregate results', async () => {
    settingsService.getSetting.mockResolvedValueOnce({
      value: { daily_leads_target: 40 },
    });

    const cohortQb = createQueryBuilderMock({ rawMany: [{ repId: 'rep-10' }] });
    const todayQb = createQueryBuilderMock({ rawOne: { count: 3 } });
    const rangeQb = createQueryBuilderMock({
      rawMany: [{ day: '2026-03-01', count: 4 }],
    });
    const daysQb = createQueryBuilderMock({ rawMany: [{ day: '2026-03-01' }] });
    const activityBuilders = [cohortQb, todayQb, rangeQb, daysQb];
    const userBuilders = [
      createQueryBuilderMock({
        many: [
          {
            id: 'rep-10',
            first_name: 'Donald',
            last_name: 'Knuth',
            email: 'donald@example.com',
          },
        ],
      }),
    ];
    queueBuilders(activityRepo.createQueryBuilder, activityBuilders);
    queueBuilders(userRepo.createQueryBuilder, userBuilders);

    const filters: DashboardFiltersDto = {
      ...baseFilters,
      province: 'Gauteng',
    };
    const result = await service.getLeadsContactedStats(filters, 'admin-1', 'admin');

    expect(result.today).toBe(3);
    expect(result.target).toBe(40);

    for (const qb of [cohortQb, todayQb, rangeQb, daysQb]) {
      expect(qb.innerJoin).toHaveBeenCalledWith('a.lead', 'lead');
      expect(qb.innerJoin).toHaveBeenCalledWith('lead.school', 'school');
      expect(qb.andWhere).toHaveBeenCalledWith('school.province = :province', {
        province: 'Gauteng',
      });
    }
  });

  it('returns empty cohort response and clamps future end date to today', async () => {
    settingsService.getSetting.mockResolvedValueOnce({
      value: { daily_leads_target: 40 },
    });

    const activityBuilders = [
      createQueryBuilderMock({ rawMany: [] }),
    ];
    queueBuilders(activityRepo.createQueryBuilder, activityBuilders);

    const filters: DashboardFiltersDto = {
      dateRange: 'custom',
      startDate: '2026-03-01',
      endDate: '2026-03-20',
    };
    const result = await service.getLeadsContactedStats(filters, 'admin-1', 'admin');

    expect(userRepo.createQueryBuilder).not.toHaveBeenCalled();
    expect(result.today).toBe(0);
    expect(result.target).toBe(0);
    expect(result.mtdAverage).toBe(0);
    expect(result.byRep).toEqual([]);
    expect(result.missedDays).toBe(2);
  });
});
