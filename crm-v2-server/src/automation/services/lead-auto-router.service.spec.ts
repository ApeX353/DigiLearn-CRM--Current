import { LeadAutoRouterService } from './lead-auto-router.service';
import { AssignmentProposalStatus } from '../entities/lead-assignment-proposal.entity';

/**
 * The 30 July model (Mr Dube): territory is a HARD filter — "Manake does not
 * get Mashonaland." A lead goes ONLY to a rep whose territory covers its
 * province; it is never routed out of territory to balance load. Fairness
 * chooses only among reps who SHARE a territory. Auto-distribution goes to
 * SALES REPS only (managers approve/reassign).
 *   Recipients opt in via territory:
 *     Manake — rep — West/South provinces
 *     Tanya  — rep — Mash/East provinces
 *   The engine only ADDS leads — it never strips an existing book.
 */
const WEST = ['Bulawayo', 'Midlands', 'Masvingo'];
const MASH = ['Harare', 'Mashonaland East'];

function repRows() {
  return [
    { id: 'manake', first_name: 'Manake', last_name: 'D', territory_provinces: JSON.stringify(WEST) },
    { id: 'tanya', first_name: 'Tanya', last_name: 'G', territory_provinces: JSON.stringify(MASH) },
  ];
}

function makeQb(rows: any[]) {
  const qb: any = {};
  for (const m of ['select', 'distinct', 'addSelect', 'from', 'innerJoin', 'leftJoinAndSelect', 'where', 'andWhere', 'orWhere', 'groupBy', 'addGroupBy', 'orderBy', 'limit'])
    qb[m] = jest.fn().mockReturnValue(qb);
  qb.getRawMany = jest.fn().mockResolvedValue(rows);
  qb.getMany = jest.fn().mockResolvedValue(rows);
  return qb;
}

describe('LeadAutoRouterService — distribution engine (reps only)', () => {
  let service: LeadAutoRouterService;
  let leadRepo: any;
  let proposalRepo: any;
  let dataSource: any;
  let saved: any[];

  function build(pool: any[], startCounts: Record<string, number>) {
    saved = [];
    dataSource = { createQueryBuilder: jest.fn().mockReturnValue(makeQb(repRows())) };
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
      find: jest.fn().mockResolvedValue([]),
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

  it('routes a West lead to the West rep and a Mash lead to the Mash rep', async () => {
    build([lead('w', 'Bulawayo'), lead('m', 'Harare')], {});
    await service.runDistribution();
    const byLead = Object.fromEntries(saved.map((s) => [s.lead_id, s.proposed_rep_id]));
    expect(byLead.w).toBe('manake');
    expect(byLead.m).toBe('tanya');
  });

  it('managers are never recipients (only reps came back from getRecipients)', async () => {
    // getRecipients query filters role=sales_rep; the mock returns reps only.
    build([lead('w', 'Bulawayo')], {});
    const res = await service.runDistribution();
    expect(res.preview.every((p) => p.cohort === 'rep')).toBe(true);
    expect(res.preview.map((p) => p.rep_id).sort()).toEqual(['manake', 'tanya']);
  });

  it('never routes a West lead out of territory, even when the West rep is far ahead', async () => {
    // Manake starts 500 leads ahead of Tanya. Under HARD territory the 5
    // West leads STILL all go to Manake — fairness never overrides territory.
    build(
      Array.from({ length: 5 }, (_, i) => lead('w' + i, 'Bulawayo')),
      { manake: 500, tanya: 0 },
    );
    const res = await service.runDistribution();
    const manake = res.preview.find((p) => p.rep_id === 'manake')!;
    const tanya = res.preview.find((p) => p.rep_id === 'tanya')!;
    expect(manake.will_gain).toBe(5);
    expect(tanya.will_gain).toBe(0);
  });

  it('a West lead stays with the West rep no matter the load gap', async () => {
    build([lead('w', 'Bulawayo')], { manake: 999, tanya: 0 });
    await service.runDistribution();
    expect(saved[0].proposed_rep_id).toBe('manake'); // territory is hard
  });

  it('skips a lead whose province no rep covers — never forced onto the wrong rep', async () => {
    build([lead('x', 'Matabeleland North')], {}); // covered by neither rep
    const res = await service.runDistribution();
    expect(res.proposed).toBe(0);
    expect(res.skipped).toBe(1);
    expect(proposalRepo.save).not.toHaveBeenCalled();
  });

  it('within a SHARED territory, the lighter-loaded rep gets the lead', async () => {
    build([lead('w', 'Bulawayo')], { manake: 10, tanya: 3 });
    const shared = [
      { id: 'manake', first_name: 'Manake', last_name: 'D', territory_provinces: JSON.stringify(['Bulawayo']) },
      { id: 'tanya', first_name: 'Tanya', last_name: 'G', territory_provinces: JSON.stringify(['Bulawayo']) },
    ];
    dataSource.createQueryBuilder.mockReturnValue(makeQb(shared));
    await service.runDistribution();
    expect(saved[0].proposed_rep_id).toBe('tanya'); // lighter of the two who cover it
  });

  it('does nothing when no rep has a territory configured', async () => {
    build([lead('w', 'Bulawayo')], {});
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
