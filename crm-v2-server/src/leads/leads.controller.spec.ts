import { LeadsController } from './leads.controller';

describe('LeadsController', () => {
  let controller: LeadsController;

  const leadsService = {
    findOne: jest.fn(),
    findReversalRequestsByLead: jest.fn(),
    createReversalRequest: jest.fn(),
  };

  const qualificationService = {
    findByLeadId: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new LeadsController(
      leadsService as any,
      qualificationService as any,
    );
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('submits a reversal request and returns success envelope', async () => {
    const leadId = 'lead-123';
    const userId = 'user-123';
    const ability = { can: jest.fn() } as any;
    const dto = {
      status: 'Qualified',
      reason: 'Contract updated, conversion should be reversed',
      notes: 'Requested by procurement team',
    };
    const savedRequest = {
      id: 'req-123',
      lead_id: leadId,
      requested_status: dto.status,
      reason: dto.reason,
      notes: dto.notes,
      status: 'pending',
      requested_by_id: userId,
    };

    leadsService.findOne.mockResolvedValueOnce({ id: leadId });
    leadsService.createReversalRequest.mockResolvedValueOnce(savedRequest);

    const result = await controller.createReversalRequest(
      leadId,
      dto as any,
      userId,
      ability,
    );

    expect(leadsService.findOne).toHaveBeenCalledWith(leadId, ability);
    expect(leadsService.createReversalRequest).toHaveBeenCalledWith(
      leadId,
      dto,
      userId,
    );
    expect(result).toEqual({
      success: true,
      message: 'Lead reversal request submitted successfully',
      data: savedRequest,
    });
  });

  it('gets reversal requests for a lead and returns success envelope', async () => {
    const leadId = 'lead-456';
    const ability = { can: jest.fn() } as any;
    const requests = [
      {
        id: 'req-2',
        lead_id: leadId,
        status: 'pending',
      },
      {
        id: 'req-1',
        lead_id: leadId,
        status: 'approved',
      },
    ];

    leadsService.findOne.mockResolvedValueOnce({ id: leadId });
    leadsService.findReversalRequestsByLead.mockResolvedValueOnce(requests);

    const result = await controller.findReversalRequests(leadId, ability);

    expect(leadsService.findOne).toHaveBeenCalledWith(leadId, ability);
    expect(leadsService.findReversalRequestsByLead).toHaveBeenCalledWith(leadId);
    expect(result).toEqual({
      success: true,
      data: requests,
    });
  });
});
