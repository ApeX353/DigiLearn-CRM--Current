import { LeadAutoRouterService } from './lead-auto-router.service';
import { AssignmentProposalStatus } from '../entities/lead-assignment-proposal.entity';

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

const REP_ROWS = [
  { id: 'rep-b', first_name: 'B', last_name: 'Rep', territory_provinces: null },
  {
    id: 'rep-a',
    first_name: 'A',
    last_name: 'Rep',
    territory_provinces: '["Bulawayo"]',
  },
];

describe('LeadAutoRouterService (AUTO1/AUTO2 — propose, then approve)', () => {
  let service: LeadAutoRouterService;
  let leadRepo: any;
  let leadSlaRepo: any;
  let proposalRepo: any;
  let dataSource: any;
  let notifications: any;
  let activityLogs: any;

  function build(leads: any[], counts: any[]) {
    dataSource = {
      createQueryBuilder: jest
        .fn()
        .mockReturnValue(makeQb({ getRawMany: REP_ROWS })),
    };
    const countsQb = makeQb({ getRawMany: counts });
    const leadsQb = makeQb({ getMany: leads });
    leadRepo = {
      createQueryBuilder: jest
        .fn()
        .mockReturnValueOnce(countsQb)
        .mockReturnValueOnce(leadsQb),
      update: jest.fn().mockResolvedValue(undefined),
      findOne: jest.fn(),
    };
    leadSlaRepo = { find: jest.fn().mockResolvedValue([]) };
    proposalRepo = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn(),
      create: jest.fn().mockImplementation((x: any) => x),
      save: jest.fn().mockImplementation((x: any) => Promise.resolve(x)),
    };
    notifications = { sendToUsers: jest.fn().mockResolvedValue(undefined) };
    activityLogs = { logUpdate: jest.fn().mockResolvedValue(undefined) };
    const complianceSettings = {
      getBoolean: jest.fn().mockResolvedValue(true),
    };
    service = new LeadAutoRouterService(
      leadRepo,
      leadSlaRepo,
      proposalRepo,
      dataSource,
      notifications,
      complianceSettings as never,
      activityLogs,
    );
  }

  it('creates PROPOSALS (never assigns) and load-balances the batch', async () => {
    build(
      [
        { id: 'l1', lead_name: 'A', status: 'New', school: null },
        { id: 'l2', lead_name: 'B', status: 'New', school: null },
        { id: 'l3', lead_name: 'C', status: 'New', school: null },
      ],
      [{ rep: 'rep-a', cnt: '2' }],
    );
    await service.handleUnassignedLeadRouting();

    // AUTO1: nothing is assigned directly.
    expect(leadRepo.update).not.toHaveBeenCalled();
    // rep-a starts at 2, rep-b at 0: l1→rep-b, l2→rep-b, l3 tie(2/2)→rep-a.
    expect(proposalRepo.save).toHaveBeenCalledTimes(3);
    const picks = proposalRepo.create.mock.calls.map(
      (c: any[]) => c[0].proposed_rep_id,
    );
    expect(picks).toEqual(['rep-b', 'rep-b', 'rep-a']);
  });

  it('AUTO2: a territory match beats a lighter load', async () => {
    build(
      [
        {
          id: 'l1',
          lead_name: 'A',
          status: 'New',
          school: { province: 'Bulawayo' },
        },
      ],
      [{ rep: 'rep-a', cnt: '5' }], // rep-a busier, but covers Bulawayo
    );
    await service.handleUnassignedLeadRouting();
    expect(proposalRepo.create.mock.calls[0][0].proposed_rep_id).toBe('rep-a');
    expect(proposalRepo.create.mock.calls[0][0].reason).toContain('Bulawayo');
  });

  it('does nothing when there are no routable reps', async () => {
    build([], []);
    dataSource.createQueryBuilder.mockReturnValue(makeQb({ getRawMany: [] }));
    await service.handleUnassignedLeadRouting();
    expect(proposalRepo.save).not.toHaveBeenCalled();
  });

  it('never throws if the DB errors mid-pass', async () => {
    build([], []);
    leadRepo.createQueryBuilder.mockImplementation(() => {
      throw new Error('db down');
    });
    await expect(
      service.handleUnassignedLeadRouting(),
    ).resolves.toBeUndefined();
  });

  it('approve assigns the lead, starts the SLA clock and logs', async () => {
    build([], []);
    proposalRepo.findOne.mockResolvedValue({
      id: 'p1',
      lead_id: 'l1',
      proposed_rep_id: 'rep-a',
      status: AssignmentProposalStatus.PENDING,
      reason: 'test',
    });
    leadRepo.findOne.mockResolvedValue({
      id: 'l1',
      lead_name: 'A',
      status: 'New',
      assigned_to: null,
      current_sla_due_date: null,
    });
    leadSlaRepo.find.mockResolvedValue([
      { status: 'New', sla_hours: 24, is_active: true },
    ]);

    const result = await service.approveProposal('p1', 'manager-1');

    expect(leadRepo.update).toHaveBeenCalledWith(
      'l1',
      expect.objectContaining({
        assigned_to: 'rep-a',
        current_sla_due_date: expect.any(Date),
      }),
    );
    expect(result.status).toBe(AssignmentProposalStatus.APPROVED);
    expect(activityLogs.logUpdate).toHaveBeenCalled();
    expect(notifications.sendToUsers).toHaveBeenCalledWith(
      expect.objectContaining({ userIds: ['rep-a'] }),
    );
  });

  it('approve marks the proposal superseded when the lead was hand-assigned meanwhile', async () => {
    build([], []);
    proposalRepo.findOne.mockResolvedValue({
      id: 'p1',
      lead_id: 'l1',
      proposed_rep_id: 'rep-a',
      status: AssignmentProposalStatus.PENDING,
      reason: 'test',
    });
    leadRepo.findOne.mockResolvedValue({
      id: 'l1',
      assigned_to: 'someone-else',
    });

    await expect(service.approveProposal('p1', 'manager-1')).rejects.toThrow(
      'superseded',
    );
    expect(leadRepo.update).not.toHaveBeenCalled();
    expect(proposalRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        status: AssignmentProposalStatus.SUPERSEDED,
      }),
    );
  });
});
