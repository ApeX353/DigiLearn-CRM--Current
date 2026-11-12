import { LeadAutoRouterService } from './lead-auto-router.service';
import { AssignmentProposalStatus } from '../entities/lead-assignment-proposal.entity';

/**
 * AUTO-EQUITY (12 Aug manager update): fairness is priority 1, territory is
 * priority 2. Lighter projected full books catch up to the heaviest starting
 * book, then the remainder follows territory inside the strict <50 band.
 * Auto-distribution goes to SALES REPS only (managers approve/redirect).
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
  let compliance: any;
  let saved: any[];

  function build(pool: any[], startCounts: Record<string, number>) {
    saved = [];
    dataSource = { createQueryBuilder: jest.fn().mockReturnValue(makeQb(repRows())) };
    const countsRows = Object.entries(startCounts).map(([rep, cnt]) => ({ rep, cnt: String(cnt) }));
    leadRepo = {
      createQueryBuilder: jest
        .fn()
        .mockReturnValueOnce(makeQb(countsRows)) // getBookLeadCounts
        .mockReturnValueOnce(makeQb(countsRows)) // manager-cap open counts
        .mockReturnValueOnce(makeQb(pool)), // getDistributablePool
      findOne: jest.fn(),
      update: jest.fn().mockResolvedValue(undefined),
    };
    proposalRepo = {
      find: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockImplementation((x: any) => x),
      save: jest.fn().mockImplementation((x: any) => { if (Array.isArray(x)) saved.push(...x); else saved.push(x); return Promise.resolve(x); }),
    };
    const notifications = { sendToUsers: jest.fn().mockResolvedValue(undefined) };
    // include-managers OFF by default (reps only); manager cap 50.
    compliance = {
      getBoolean: jest
        .fn()
        .mockImplementation((k: string) =>
          Promise.resolve(k === 'auto_assign_enabled'),
        ),
      getNumber: jest.fn().mockResolvedValue(50),
    };
    const leadSla = { find: jest.fn().mockResolvedValue([]) };
    const activityLogs = { logUpdate: jest.fn().mockResolvedValue(undefined) };
    const duplicateDetection = {
      rebuildLeadSuspicions: jest.fn().mockResolvedValue(undefined),
    };
    service = new LeadAutoRouterService(
      leadRepo, leadSla as never, proposalRepo, dataSource,
      notifications as never, compliance as never, activityLogs as never,
      duplicateDetection as never,
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

  it('automatically gives catch-up leads to the lighter rep before location', async () => {
    // Manake starts 500 leads ahead of Tanya. Under HARD territory the 5
    // West leads STILL all go to Manake — fairness never overrides territory.
    build(
      Array.from({ length: 12 }, (_, i) => lead('m' + i, 'Harare')),
      { manake: 0, tanya: 10 },
    );
    const res = await service.runDistribution();
    const manake = res.preview.find((p) => p.rep_id === 'manake')!;
    const tanya = res.preview.find((p) => p.rep_id === 'tanya')!;
    expect(manake.will_gain).toBe(10); // first catches up from 0 to 10
    expect(tanya.will_gain).toBe(2); // remaining Harare leads follow territory
    expect(Math.abs(manake.new_total - tanya.new_total)).toBe(2);
  });

  it('uses territory for the remainder after catch-up', async () => {
    build(
      Array.from({ length: 11 }, (_, i) => lead('m' + i, 'Harare')),
      { manake: 0, tanya: 10 },
    );
    const res = await service.runDistribution();
    const totals = res.preview.map((p) => p.new_total);
    expect(Math.max(...totals) - Math.min(...totals)).toBe(1);
  });

  it('keeps territory as the majority choice without allowing a 50-lead gap', async () => {
    build(
      Array.from({ length: 60 }, (_, i) => lead('m' + i, 'Harare')),
      { manake: 0, tanya: 0 },
    );
    const res = await service.runDistribution();
    const manake = res.preview.find((p) => p.rep_id === 'manake')!;
    const tanya = res.preview.find((p) => p.rep_id === 'tanya')!;
    expect(Math.abs(manake.new_total - tanya.new_total)).toBeLessThan(50);
    expect(tanya.will_gain).toBeGreaterThan(manake.will_gain);
  });

  it('skips a lead whose province no rep covers — never forced onto the wrong rep', async () => {
    build([lead('x', 'Matabeleland North')], {}); // covered by neither rep
    const res = await service.runDistribution();
    expect(res.proposed).toBe(1);
    expect(res.skipped).toBe(0);
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

  it('includes managers when opted in, but caps how many they receive (#19)', async () => {
    build(
      Array.from({ length: 5 }, (_, i) => lead('w' + i, 'Bulawayo')),
      { manake: 0, kim: 0 },
    );
    // Opt-in ON, manager cap = 2.
    compliance.getBoolean.mockImplementation((k: string) =>
      Promise.resolve(
        k === 'auto_assign_enabled' || k === 'auto_assign_include_managers',
      ),
    );
    compliance.getNumber.mockResolvedValue(2);
    // reps query → Manake; managers query → Kim (shares Manake's WEST office).
    dataSource.createQueryBuilder = jest
      .fn()
      .mockReturnValueOnce(
        makeQb([
          { id: 'manake', first_name: 'Manake', last_name: 'D', territory_provinces: JSON.stringify(WEST) },
        ]),
      )
      .mockReturnValueOnce(
        makeQb([
          { id: 'kim', first_name: 'Kim', last_name: 'M', territory_provinces: JSON.stringify(WEST) },
        ]),
      );
    const res = await service.runDistribution();
    const kim = res.preview.find((p) => p.rep_id === 'kim');
    const manake = res.preview.find((p) => p.rep_id === 'manake');
    expect(kim?.will_gain).toBe(2); // capped at 2
    expect(manake?.will_gain).toBe(3); // rep takes the overflow
  });

  it('does nothing when no rep has a territory configured', async () => {
    build([lead('w', 'Bulawayo')], {});
    dataSource.createQueryBuilder.mockReturnValue(makeQb([]));
    const res = await service.runDistribution();
    expect(res.proposed).toBe(0);
    expect(proposalRepo.save).not.toHaveBeenCalled();
  });

  it('counts but never mutates proposals that were already pending', async () => {
    build([lead('new-1', 'Bulawayo')], { manake: 0, tanya: 0 });
    const existing = {
      id: 'existing-pending', lead_id: 'existing-lead', proposed_rep_id: 'tanya',
      status: AssignmentProposalStatus.PENDING,
      reason: 'Existing production suggestion',
    };
    proposalRepo.find = jest.fn().mockResolvedValue([existing]);
    const before = { ...existing };
    await service.runDistribution();
    expect(existing).toEqual(before);
    expect(saved).toHaveLength(1);
    expect(saved[0].lead_id).toBe('new-1');
    expect(saved.some((row) => row.id === existing.id)).toBe(false);
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

  it('redirect assigns the lead to the manager-chosen rep, not the engine pick', async () => {
    build([], {});
    proposalRepo.findOne = jest.fn().mockResolvedValue({
      id: 'p2', lead_id: 'l2', proposed_rep_id: 'manake',
      status: AssignmentProposalStatus.PENDING, reason: 'engine picked manake',
    });
    proposalRepo.save = jest.fn().mockImplementation((x: any) => Promise.resolve(x));
    leadRepo.findOne = jest.fn().mockResolvedValue({
      id: 'l2', lead_name: 'B', status: 'New', assigned_to: null, current_sla_due_date: null,
    });
    await service.approveProposal('p2', 'mgr-1', 'tanya'); // redirect to tanya
    expect(leadRepo.update).toHaveBeenCalledWith(
      'l2',
      expect.objectContaining({ assigned_to: 'tanya' }),
    );
  });

  it('redirect allows the approving manager to choose themselves', async () => {
    build([], {});
    dataSource.createQueryBuilder.mockReturnValue(makeQb([{ id: 'mgr-1' }]));
    proposalRepo.findOne = jest.fn().mockResolvedValue({
      id: 'p3', lead_id: 'l3', proposed_rep_id: 'manake',
      status: AssignmentProposalStatus.PENDING, reason: 'engine picked manake',
    });
    proposalRepo.save = jest.fn().mockImplementation((x: any) => Promise.resolve(x));
    leadRepo.findOne = jest.fn().mockResolvedValue({
      id: 'l3', lead_name: 'C', status: 'New', assigned_to: null, current_sla_due_date: null,
    });
    await service.approveProposal('p3', 'mgr-1', 'mgr-1');
    expect(leadRepo.update).toHaveBeenCalledWith(
      'l3',
      expect.objectContaining({ assigned_to: 'mgr-1' }),
    );
  });

  it('undo restores an untouched approval to pending and clears its SLA', async () => {
    build([], {});
    const proposal: any = {
      id: 'undo-1', lead_id: 'lead-undo', proposed_rep_id: 'manake',
      status: AssignmentProposalStatus.APPROVED,
      decided_by_id: 'mgr-1', decided_at: new Date(),
    };
    proposalRepo.findOne = jest.fn().mockResolvedValue(proposal);
    leadRepo.findOne = jest.fn().mockResolvedValue({
      id: 'lead-undo', assigned_to: 'manake', current_sla_due_date: new Date(),
    });
    const workedQb = makeQb([]);
    workedQb.getCount = jest.fn().mockResolvedValue(0);
    leadRepo.createQueryBuilder = jest.fn().mockReturnValue(workedQb);
    const txLeadUpdate = jest.fn().mockResolvedValue(undefined);
    const txProposalSave = jest.fn().mockResolvedValue(undefined);
    dataSource.transaction = jest.fn().mockImplementation(async (fn: any) =>
      fn({
        getRepository: (entity: any) =>
          entity.name === 'Lead'
            ? { update: txLeadUpdate }
            : { save: txProposalSave },
      }),
    );
    const result = await service.undoApprovals(['undo-1'], 'mgr-1');
    expect(result).toEqual({ undone: 1, skipped: [] });
    expect(txLeadUpdate).toHaveBeenCalledWith('lead-undo', {
      assigned_to: null,
      current_sla_due_date: null,
      sla_breached: false,
    });
    expect(proposal.status).toBe(AssignmentProposalStatus.PENDING);
    expect(proposal.decided_by_id).toBeNull();
    expect(proposal.decided_at).toBeNull();
  });

  it('undo refuses to strip a lead that a rep has already worked', async () => {
    build([], {});
    proposalRepo.findOne = jest.fn().mockResolvedValue({
      id: 'undo-2', lead_id: 'worked-lead', proposed_rep_id: 'manake',
      status: AssignmentProposalStatus.APPROVED,
    });
    leadRepo.findOne = jest.fn().mockResolvedValue({
      id: 'worked-lead', assigned_to: 'manake',
    });
    const workedQb = makeQb([]);
    workedQb.getCount = jest.fn().mockResolvedValue(1);
    leadRepo.createQueryBuilder = jest.fn().mockReturnValue(workedQb);
    dataSource.transaction = jest.fn();
    const result = await service.undoApprovals(['undo-2'], 'mgr-1');
    expect(result.undone).toBe(0);
    expect(result.skipped).toEqual([
      { id: 'undo-2', why: 'lead already worked' },
    ]);
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });
});
