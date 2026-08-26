import { LeadReversalRequestsController } from './lead-reversal-requests.controller';

describe('LeadReversalRequestsController', () => {
  let controller: LeadReversalRequestsController;

  const leadsService = {
    findReversalRequestById: jest.fn(),
    findOne: jest.fn(),
    reviewReversalRequest: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new LeadReversalRequestsController(leadsService as any);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('approves a reversal request', async () => {
    const requestId = 'req-1';
    const leadId = 'lead-1';
    const userId = 'manager-1';
    const ability = { can: jest.fn() } as any;
    const dto = { decision: 'approved', review_note: 'Looks good' } as const;
    const reviewed = {
      id: requestId,
      lead_id: leadId,
      status: 'approved',
      reviewed_by_id: userId,
    };

    leadsService.findReversalRequestById.mockResolvedValueOnce({
      id: requestId,
      lead_id: leadId,
    });
    leadsService.findOne.mockResolvedValueOnce({ id: leadId });
    leadsService.reviewReversalRequest.mockResolvedValueOnce(reviewed);

    const result = await controller.approveOrReject(
      requestId,
      dto as any,
      userId,
      ability,
    );

    expect(leadsService.findReversalRequestById).toHaveBeenCalledWith(requestId);
    expect(leadsService.findOne).toHaveBeenCalledWith(leadId, ability);
    expect(leadsService.reviewReversalRequest).toHaveBeenCalledWith(
      requestId,
      dto,
      userId,
    );
    expect(result).toEqual({
      success: true,
      message: 'Lead reversal request approved successfully',
      data: reviewed,
    });
  });

  it('rejects a reversal request', async () => {
    const requestId = 'req-2';
    const leadId = 'lead-2';
    const userId = 'manager-2';
    const ability = { can: jest.fn() } as any;
    const dto = { decision: 'rejected', review_note: 'Insufficient evidence' } as const;
    const reviewed = {
      id: requestId,
      lead_id: leadId,
      status: 'rejected',
      reviewed_by_id: userId,
    };

    leadsService.findReversalRequestById.mockResolvedValueOnce({
      id: requestId,
      lead_id: leadId,
    });
    leadsService.findOne.mockResolvedValueOnce({ id: leadId });
    leadsService.reviewReversalRequest.mockResolvedValueOnce(reviewed);

    const result = await controller.approveOrReject(
      requestId,
      dto as any,
      userId,
      ability,
    );

    expect(result).toEqual({
      success: true,
      message: 'Lead reversal request rejected successfully',
      data: reviewed,
    });
  });
});
