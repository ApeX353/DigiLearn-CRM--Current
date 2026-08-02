import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { LeadsService } from './leads.service';
import { DecisionRole } from './entities/lead-stakeholders.entity';

function createActivityCountQuery(count: number) {
  return {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getCount: jest.fn().mockResolvedValue(count),
  };
}

describe('LeadsService', () => {
  let service: LeadsService;

  const leadRepository = {
    findOne: jest.fn(),
    save: jest.fn(),
  };

  const leadReversalRequestRepository = {
    findOne: jest.fn(),
    find: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };

  const activityLogsService = {
    logCreate: jest.fn(),
    logUpdate: jest.fn(),
  };

  const dataSource = {
    transaction: jest.fn(async (callback: any) =>
      callback({
        getRepository: jest.fn(() => ({
          find: jest.fn().mockResolvedValue([]),
          delete: jest.fn().mockResolvedValue(undefined),
        })),
      }),
    ),
  };

  beforeEach(() => {
    jest.clearAllMocks();

    service = new LeadsService(
      leadRepository as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      dataSource as any,
      activityLogsService as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      leadReversalRequestRepository as any,
      // Phase A.3 — ComplianceSettingsService mock so the gates in
      // update() short-circuit predictably in unit tests.
      {
        getNumber: async () => 0,
        getBoolean: async () => false,
      } as any,
      // DUP1 — DuplicateDetectionService mock (fire-and-forget on create).
      {
        peekLead: async () => [],
        recordSuspicion: async () => ({}),
      } as any,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('throws NotFoundException when lead does not exist', async () => {
    leadRepository.findOne.mockResolvedValueOnce(null);

    await expect(
      service.createReversalRequest(
        'lead-404',
        { status: 'Qualified', reason: 'Need rollback' } as any,
        'user-1',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('throws BadRequestException when lead is not converted', async () => {
    leadRepository.findOne.mockResolvedValueOnce({
      id: 'lead-1',
      status: 'Qualified',
    });

    await expect(
      service.createReversalRequest(
        'lead-1',
        { status: 'Contacted', reason: 'Need rollback' } as any,
        'user-1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('throws BadRequestException when requested status is Converted', async () => {
    leadRepository.findOne.mockResolvedValueOnce({
      id: 'lead-1',
      status: 'Converted',
    });

    await expect(
      service.createReversalRequest(
        'lead-1',
        { status: 'Converted', reason: 'Need rollback' } as any,
        'user-1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('throws ConflictException when pending request already exists', async () => {
    leadRepository.findOne.mockResolvedValueOnce({
      id: 'lead-1',
      status: 'Converted',
    });
    leadReversalRequestRepository.findOne.mockResolvedValueOnce({
      id: 'req-existing',
      status: 'pending',
    });

    await expect(
      service.createReversalRequest(
        'lead-1',
        { status: 'Qualified', reason: 'Need rollback' } as any,
        'user-1',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('creates a pending reversal request successfully', async () => {
    const leadId = 'lead-1';
    const userId = 'user-1';
    const dto = {
      status: 'Qualified',
      reason: '  Need rollback for contract correction  ',
      notes: '  Waiting for approval  ',
    };
    const lead = {
      id: leadId,
      status: 'Converted',
      lead_name: 'Alpha School Lead',
    };
    const created = {
      lead_id: leadId,
      kind: 'status_reversal',
      requested_status: dto.status,
      proposed_assignee_id: null,
      reason: 'Need rollback for contract correction',
      notes: 'Waiting for approval',
      status: 'pending',
      requested_by_id: userId,
      reviewed_by_id: null,
      reviewed_at: null,
      review_note: null,
    };
    const saved = { id: 'req-1', ...created };

    leadRepository.findOne.mockResolvedValueOnce(lead);
    leadReversalRequestRepository.findOne.mockResolvedValueOnce(null);
    leadReversalRequestRepository.create.mockReturnValueOnce(created);
    leadReversalRequestRepository.save.mockResolvedValueOnce(saved);
    activityLogsService.logCreate.mockResolvedValueOnce(undefined);

    const result = await service.createReversalRequest(
      leadId,
      dto as any,
      userId,
    );

    expect(leadReversalRequestRepository.create).toHaveBeenCalledWith(created);
    expect(leadReversalRequestRepository.save).toHaveBeenCalledWith(created);
    expect(activityLogsService.logCreate).toHaveBeenCalledWith(
      'Lead',
      leadId,
      { reversal_request: saved },
      userId,
      'Reopen / status reversal request submitted for "Alpha School Lead"',
    );
    expect(result).toEqual(saved);
  });

  it('returns lead reversal requests ordered by newest first', async () => {
    const leadId = 'lead-22';
    const requests = [
      { id: 'req-new', lead_id: leadId, status: 'pending' },
      { id: 'req-old', lead_id: leadId, status: 'approved' },
    ];

    leadReversalRequestRepository.find.mockResolvedValueOnce(requests);

    const result = await service.findReversalRequestsByLead(leadId);

    expect(leadReversalRequestRepository.find).toHaveBeenCalledWith({
      where: { lead_id: leadId },
      relations: ['requested_by', 'reviewed_by'],
      order: { created_at: 'DESC' },
    });
    expect(result).toEqual(requests);
  });

  it('findReversalRequestById throws NotFoundException when request does not exist', async () => {
    leadReversalRequestRepository.findOne.mockResolvedValueOnce(null);

    await expect(service.findReversalRequestById('req-missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('reviewReversalRequest throws BadRequestException when request is already reviewed', async () => {
    leadReversalRequestRepository.findOne.mockResolvedValueOnce({
      id: 'req-reviewed',
      lead_id: 'lead-1',
      requested_status: 'Qualified',
      status: 'approved',
    });

    await expect(
      service.reviewReversalRequest(
        'req-reviewed',
        { decision: 'rejected', review_note: 'no-op' } as any,
        'manager-1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('reviewReversalRequest rejects pending request', async () => {
    const pending = {
      id: 'req-pending',
      lead_id: 'lead-1',
      requested_status: 'Qualified',
      status: 'pending',
      reviewed_by_id: null,
      reviewed_at: null,
      review_note: null,
    };
    const saved = {
      ...pending,
      status: 'rejected',
      reviewed_by_id: 'manager-1',
      reviewed_at: new Date('2026-03-02T10:00:00.000Z'),
      review_note: 'Insufficient reason',
    };
    const hydrated = { ...saved, requested_by: null, reviewed_by: null };

    leadReversalRequestRepository.findOne
      .mockResolvedValueOnce({ ...pending })
      .mockResolvedValueOnce(hydrated);
    leadReversalRequestRepository.save.mockResolvedValueOnce(saved);
    activityLogsService.logUpdate.mockResolvedValueOnce(undefined);

    const result = await service.reviewReversalRequest(
      'req-pending',
      { decision: 'rejected', review_note: '  Insufficient reason  ' } as any,
      'manager-1',
    );

    expect(leadReversalRequestRepository.save).toHaveBeenCalled();
    expect(result.status).toBe('rejected');
    expect(result.review_note).toBe('Insufficient reason');
  });

  it('reviewReversalRequest approves pending request and updates lead status', async () => {
    const pending = {
      id: 'req-pending-approved',
      lead_id: 'lead-2',
      kind: 'status_reversal',
      requested_status: 'Qualified',
      status: 'pending',
      reviewed_by_id: null,
      reviewed_at: null,
      review_note: null,
    };
    const saved = {
      ...pending,
      status: 'approved',
      reviewed_by_id: 'manager-2',
      reviewed_at: new Date('2026-03-02T12:00:00.000Z'),
      review_note: 'Approved',
    };
    const hydrated = { ...saved, requested_by: null, reviewed_by: null };

    leadReversalRequestRepository.findOne
      .mockResolvedValueOnce({ ...pending })
      .mockResolvedValueOnce(hydrated);
    leadReversalRequestRepository.save.mockResolvedValueOnce(saved);
    activityLogsService.logUpdate.mockResolvedValueOnce(undefined);

    const updateStatusSpy = jest
      .spyOn(service, 'updateStatus')
      .mockResolvedValueOnce({ id: 'lead-2' } as any);

    const result = await service.reviewReversalRequest(
      'req-pending-approved',
      { decision: 'approved', review_note: 'Approved' } as any,
      'manager-2',
    );

    expect(updateStatusSpy).toHaveBeenCalledWith('lead-2', 'Qualified', 'manager-2');
    expect(result.status).toBe('approved');
    expect(result.reviewed_by_id).toBe('manager-2');
  });

  it('routes generic status updates through updateStatus', async () => {
    const lead = {
      id: 'lead-3',
      status: 'New',
      lead_name: 'Gamma School Lead',
      assigned_to: 'rep-1',
    };

    jest.spyOn(service, 'findOne').mockResolvedValueOnce(lead as any);
    const updateStatusSpy = jest
      .spyOn(service, 'updateStatus')
      .mockResolvedValueOnce({ ...lead, status: 'Contacted' } as any);

    const result = await service.update(
      'lead-3',
      { status: 'Contacted' } as any,
      'rep-1',
      ['sales_rep'],
    );

    expect(leadRepository.save).not.toHaveBeenCalled();
    expect(updateStatusSpy).toHaveBeenCalledWith(
      'lead-3',
      'Contacted',
      'rep-1',
    );
    expect(result.status).toBe('Contacted');
  });

  it('blocks qualification when MVD is incomplete even if the lead has contact data', async () => {
    const manager = {
      findOne: jest
        .fn()
        .mockResolvedValueOnce({
          id: 'lead-mvd',
          lead_name: 'MVD Lead',
          school: { name: 'MVD School' },
          primary_contact: {
            first_name: 'Pat',
            last_name: 'Principal',
            phone: '+263700000000',
          },
          stakeholders: [],
        })
        .mockResolvedValueOnce({
          lead_id: 'lead-mvd',
          needs: 'Interested in boards',
          qualification_needs: [],
          has_budget: false,
          timeline_type: null,
        }),
      getRepository: jest.fn().mockReturnValue({
        createQueryBuilder: jest
          .fn()
          .mockReturnValue(createActivityCountQuery(0)),
      }),
    };

    await expect(
      (service as any).assertMinimumViableDataForQualification(
        manager,
        'lead-mvd',
      ),
    ).rejects.toThrow(
      'Cannot qualify lead until Minimum Viable Data is complete',
    );
  });

  it('allows qualification only when MVD and a future next action are present', async () => {
    const manager = {
      findOne: jest
        .fn()
        .mockResolvedValueOnce({
          id: 'lead-ready',
          lead_name: 'Ready Lead',
          school: { name: 'Ready School' },
          primary_contact: {
            first_name: 'Dana',
            last_name: 'Director',
            email: 'dana@example.com',
          },
          stakeholders: [
            {
              decision_role: DecisionRole.DECISION_MAKER,
              contact: {
                first_name: 'Dana',
                last_name: 'Director',
                email: 'dana@example.com',
              },
            },
          ],
        })
        .mockResolvedValueOnce({
          lead_id: 'lead-ready',
          needs: 'Needs smart boards',
          qualification_needs: [{ product: 'Smart board', quantity: 3 }],
          has_budget: true,
          budget_indicator: 'Budget approved',
          has_timeline: true,
          timeline_type: 'This quarter',
          decision_maker_name: 'Dana Director',
        }),
      getRepository: jest.fn().mockReturnValue({
        createQueryBuilder: jest
          .fn()
          .mockReturnValue(createActivityCountQuery(1)),
      }),
    };

    await expect(
      (service as any).assertMinimumViableDataForQualification(
        manager,
        'lead-ready',
      ),
    ).resolves.toBeUndefined();
  });
});
