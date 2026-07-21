import { LeadAutoRouterService } from './lead-auto-router.service';

/**
 * Chainable query-builder stub: every builder method returns `this`;
 * terminal methods resolve to scripted values.
 */
function makeQb(values: { getMany?: any[]; getRawMany?: any[] }) {
  const qb: any = {};
  const chain = [
    'select',
    'addSelect',
    'from',
    'innerJoin',
    'leftJoinAndSelect',
    'where',
    'andWhere',
    'orWhere',
    'groupBy',
    'orderBy',
    'limit',
  ];
  for (const m of chain) qb[m] = jest.fn().mockReturnValue(qb);
  qb.getMany = jest.fn().mockResolvedValue(values.getMany ?? []);
  qb.getRawMany = jest.fn().mockResolvedValue(values.getRawMany ?? []);
  return qb;
}

describe('LeadAutoRouterService', () => {
  let service: LeadAutoRouterService;
  let leadRepo: any;
  let leadSlaRepo: any;
  let dataSource: any;
  let notifications: any;

  beforeEach(() => {
    // dataSource → routable rep ids (intentionally unsorted to prove tie-break sorts).
    dataSource = {
      createQueryBuilder: jest
        .fn()
        .mockReturnValue(makeQb({ getRawMany: [{ id: 'rep-b' }, { id: 'rep-a' }] })),
    };

    // leadRepo.createQueryBuilder is called twice: counts (getRawMany), then unassigned (getMany).
    const countsQb = makeQb({ getRawMany: [{ rep: 'rep-a', cnt: '2' }] });
    const leadsQb = makeQb({
      getMany: [
        { id: 'l1', lead_name: 'A', status: 'New', current_sla_due_date: null },
        { id: 'l2', lead_name: 'B', status: 'New', current_sla_due_date: null },
        { id: 'l3', lead_name: 'C', status: 'New', current_sla_due_date: null },
      ],
    });
    leadRepo = {
      createQueryBuilder: jest
        .fn()
        .mockReturnValueOnce(countsQb)
        .mockReturnValueOnce(leadsQb),
      update: jest.fn().mockResolvedValue(undefined),
    };

    leadSlaRepo = { find: jest.fn().mockResolvedValue([]) };
    notifications = { sendToUsers: jest.fn().mockResolvedValue(undefined) };
    // Engine enabled for these tests (the toggle defaults off in prod).
    const complianceSettings = {
      getBoolean: jest.fn().mockResolvedValue(true),
    };

    service = new LeadAutoRouterService(
      leadRepo,
      leadSlaRepo,
      dataSource,
      notifications,
      complianceSettings as never,
    );
  });

  it('load-balances unassigned leads onto the least-loaded rep, tie-broken by id', async () => {
    await service.handleUnassignedLeadRouting();

    // rep-a starts at 2, rep-b at 0. Expect: l1→rep-b, l2→rep-b, l3 tie(2/2)→rep-a.
    expect(leadRepo.update).toHaveBeenCalledTimes(3);
    expect(leadRepo.update).toHaveBeenNthCalledWith(
      1,
      'l1',
      expect.objectContaining({ assigned_to: 'rep-b' }),
    );
    expect(leadRepo.update).toHaveBeenNthCalledWith(
      2,
      'l2',
      expect.objectContaining({ assigned_to: 'rep-b' }),
    );
    expect(leadRepo.update).toHaveBeenNthCalledWith(
      3,
      'l3',
      expect.objectContaining({ assigned_to: 'rep-a' }),
    );

    // Each routed lead notifies exactly its new owner.
    expect(notifications.sendToUsers).toHaveBeenCalledTimes(3);
    expect(notifications.sendToUsers).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ userIds: ['rep-b'], entityId: 'l1' }),
    );
  });

  it('does nothing when there are no routable reps', async () => {
    dataSource.createQueryBuilder.mockReturnValue(makeQb({ getRawMany: [] }));
    await service.handleUnassignedLeadRouting();
    expect(leadRepo.update).not.toHaveBeenCalled();
  });

  it('never throws if the DB errors mid-pass', async () => {
    leadRepo.createQueryBuilder.mockImplementation(() => {
      throw new Error('db down');
    });
    await expect(
      service.handleUnassignedLeadRouting(),
    ).resolves.toBeUndefined();
  });
});
