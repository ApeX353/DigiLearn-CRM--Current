import { ForbiddenException } from '@nestjs/common';
import { LeadEscalationsController } from './lead-escalations.controller';

/**
 * BUG-046 regression cover: the per-lead escalation routes are scoped like
 * GET /leads/:id. A caller who may not read the lead gets the same 403 and
 * nothing is written.
 */
describe('LeadEscalationsController', () => {
  const service = {
    escalate: jest.fn(),
    byLead: jest.fn(),
    list: jest.fn(),
    resolve: jest.fn(),
  };
  const leadsService = { assertLeadReadable: jest.fn() };
  const ability = {} as any;
  const req = { user: { id: 'rep-1' } };
  let controller: LeadEscalationsController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new LeadEscalationsController(service as any, leadsService as any);
  });

  it('escalates only after the lead passes the read-scope check', async () => {
    leadsService.assertLeadReadable.mockResolvedValueOnce(undefined);
    service.escalate.mockResolvedValueOnce({ id: 'e1' });
    const body = { reason: 'no_response' } as any;

    const result = await controller.escalate('lead-1', body, req, ability);

    expect(leadsService.assertLeadReadable).toHaveBeenCalledWith('lead-1', ability);
    expect(service.escalate).toHaveBeenCalledWith('lead-1', 'rep-1', body);
    expect(result).toEqual({ success: true, data: { id: 'e1' } });
  });

  it('refuses to escalate a lead the caller may not read, and writes nothing', async () => {
    leadsService.assertLeadReadable.mockRejectedValueOnce(new ForbiddenException('no'));

    await expect(
      controller.escalate('lead-2', { reason: 'no_response' } as any, req, ability),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(service.escalate).not.toHaveBeenCalled();
  });

  it('lists a lead history only after the read-scope check', async () => {
    leadsService.assertLeadReadable.mockResolvedValueOnce(undefined);
    service.byLead.mockResolvedValueOnce([{ id: 'e1' }]);

    const result = await controller.forLead('lead-1', ability);

    expect(leadsService.assertLeadReadable).toHaveBeenCalledWith('lead-1', ability);
    expect(result).toEqual({ success: true, data: [{ id: 'e1' }] });
  });

  it('refuses the history of a lead the caller may not read', async () => {
    leadsService.assertLeadReadable.mockRejectedValueOnce(new ForbiddenException('no'));

    await expect(controller.forLead('lead-2', ability)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(service.byLead).not.toHaveBeenCalled();
  });
});
