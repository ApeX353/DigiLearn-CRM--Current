import { LeadAutoRouterService } from './lead-auto-router.service';
import { AssignmentProposalStatus } from '../entities/lead-assignment-proposal.entity';

/**
 * The confirmed 29 July model:
 *   Recipients (opt-in via territory):
 *     Manake  — rep     — West/South provinces
 *     Kim     — manager — West/South provinces
 *     Tanya   — rep     — Mash/East provinces
 *     Busi    — manager — Mash/East provinces
 *   Fairness (≤50 gap) measured WITHIN role cohort: reps {Manake,Tanya},
 *   managers {Kim,Busi}. Territory preferred; fairness wins on collision.
 */
const WEST = ['Bulawayo', 'Midlands', 'Masvingo'];
const MASH = ['Harare', 'Mashonaland East'];

function recipientRows() {
  return [
    { id: 'manake', first_name: 'Manake', last_name: 'D', territory_provinces: JSON.stringify(WEST), is_manager: false },
    { id: 'kim', first_name: 'Kim', last_name: 'M', territory_provinces: JSON.stringify(WEST), is_manager: true },
    { id: 'tanya', first_name: 'Tanya', last_name: 'G', territory_provinces: JSON.stringify(MASH), is_manager: false },
    { id: 'busi', first_name: 'Busi', last_name: 'D', territory_provinces: JSON.stringify(MASH), is_manager: true },
  ];
}

function makeQb(rows: any[]) {
  const qb: any = {};
  for (const m of ['select', 'addSelect', 'from', 'innerJoin', 'leftJoinAndSelect', 'where', 'andWhere', 'orWhere', 'groupBy', 'addGroupBy', 'orderBy', 'limit'])
    qb[m] = jest.fn().mockReturnValue(qb);
  qb.getRawMany = jest.fn().mockResolvedValue(rows);
  qb.getMany = jest.fn().mockResolvedValue(rows);
  return qb;
}

describe('LeadAutoRouterService — distribution engine', () => {
  let service: LeadAutoRouterService;
  let leadRepo: any;
  let proposalRepo: any;
  let dataSource: any;
  let saved: any[];

  function build(pool: any[], startCounts: Record<string, number>) {
    saved = [];
    dataSource = {
      createQueryBuilder: jest.fn().mockReturnValue(makeQb(recipientRows())),
    };
    const countsRows = Object.entries(startCounts).map(([rep, cnt]) => ({ rep, cnt: String(cnt) }));
    leadRepo = {
      createQueryBuilder: jest
        .fn()
        .mockReturnValueOnce(makeQb(countsRows)) // getOpenLeadCounts
        .mockReturnValueOnce(makeQb(pool)), // getDistributablePool
      findOne: jest.fn(),
      update: jest.fn().mockResolvedValue(undefined),
    };
    proposalRepo = {
      find: jest.fn().mockResolvedValue([]), // no pending proposals
      create: jest.fn().mockImplementation((x: any) => x),
      save: jest.fn().mockImplementation((x: any) => { saved.push(x); return Promise.resolve(x); }),
    };
    const notifications = { sendToUsers: jest.fn().mockResolvedValue(undefined) };
    const compliance = { getBoolean: jest.fn().mockResolvedValue(true) };
    const leadSla = { find: jest.fn().mockResolvedValue([]) };
    const activityLogs = { logUpdate: jest.fn().mockResolvedValue(undefined) };
    service = new LeadAutoRouterService(
      leadRepo, leadSla as never, proposalRepo, dataSource,
      notifications as never, compliance as never, activityLogs as never,
    );
  }

  const lead = (id: string, province: string) => ({ id, school: { province } });

  it('routes a lead to a territory-covering recipient, lightest first (id tie-break)', async () => {
    build([lead('l1', 'Bulawayo')], {});
    const res = await service.runDistribution();
    expect(res.proposed).toBe(1);
    // Kim(mgr,0) and Manake(rep,0) both cover West; equal load → lower id.
    expect(saved[0].proposed_rep_id).toBe('kim');
  });

  it('balances rep vs manager within a territory by picking the lighter one', async () => {
    build([lead('l1', 'Bulawayo')], { kim: 3 });
    await service.runDistribution();
    expect(saved[0].proposed_rep_id).toBe('manake');
  });

  it('fairness cap: a rep 50 ahead of the other rep is capped, even in-territory', async () => {
    // Manake(rep) 50 ahead of Tanya(rep) → capped. West lead falls to
    // Kim(mgr), still in territory (different cohort, not capped).
    build([lead('l1', 'Bulawayo')], { manake: 50, tanya: 0 });
    await service.runDistribution();
    expect(saved[0].proposed_rep_id).toBe('kim');
  });

  it('fairness overflows out of territory when both territory holders are capped', async () => {
    // Mash lead. Tanya(rep) 60 vs Manake(rep) 0 → Tanya capped.
    // Busi(mgr) 60 vs Kim(mgr) 0 → Busi capped. Overflow to a West holder.
    build([lead('l1', 'Harare')], { tanya: 60, busi: 60 });
    const res = await service.runDistribution();
    expect(['kim', 'manake']).toContain(saved[0].proposed_rep_id);
    expect(res.preview.find((p) => p.rep_id === saved[0].proposed_rep_id)!.will_gain).toBe(1);
  });

  it('spreads a batch evenly and reports the will-gain preview', async () => {
    build(
      [lead('a', 'Bulawayo'), lead('b', 'Bulawayo'), lead('c', 'Bulawayo'), lead('d', 'Bulawayo')],
      {},
    );
    const res = await service.runDistribution();
    expect(res.proposed).toBe(4);
    const kim = res.preview.find((p) => p.rep_id === 'kim')!;
    const manake = res.preview.find((p) => p.rep_id === 'manake')!;
    expect(kim.will_gain + manake.will_gain).toBe(4);
    expect(Math.abs(kim.will_gain - manake.will_gain)).toBeLessThanOrEqual(1);
  });

  it('does nothing when no recipient has a territory configured', async () => {
    build([lead('l1', 'Bulawayo')], {});
    dataSource.createQueryBuilder.mockReturnValue(makeQb([]));
    const res = await service.runDistribution();
    expect(res.proposed).toBe(0);
    expect(proposalRepo.save).not.toHaveBeenCalled();
  });

  it('approve assigns the lead, starts SLA and logs', async () => {
    build([], {});
    proposalRepo.findOne = jest.fn().mockResolvedValue({
      id: 'p1', lead_id: 'l1', proposed_rep_id: 'manake',
      status: AssignmentProposalStatus.PENDING, reason: 'test',
    });
    proposalRepo.save = jest.fn().mockImplementation((x: any) => Promise.resolve(x));
    leadRepo.findOne = jest.fn().mockResolvedValue({
      id: 'l1', lead_name: 'A', status: 'New', assigned_to: null, current_sla_due_date: null,
    });
    const res = await service.approveProposal('p1', 'mgr-1');
    expect(leadRepo.update).toHaveBeenCalledWith('l1', expect.objectContaining({ assigned_to: 'manake' }));
    expect(res.status).toBe(AssignmentProposalStatus.APPROVED);
  });
});
