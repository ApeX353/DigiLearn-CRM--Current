import { ForbiddenException } from '@nestjs/common';
import { LeadQualificationController } from './lead-qualification.controller';

/**
 * BUG-046 regression cover: every qualification route resolves to a lead
 * and is scoped exactly as GET /leads/:id, whether addressed by lead id or
 * by the qualification's own id.
 */
describe('LeadQualificationController', () => {
  const qualificationService = {
    create: jest.fn(),
    findAll: jest.fn(),
    findByLeadId: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };
  const leadsService = { assertLeadReadable: jest.fn() };
  const ability = {} as any;
  let controller: LeadQualificationController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new LeadQualificationController(
      qualificationService as any,
      leadsService as any,
    );
  });

  it('create checks the lead named in the body before writing', async () => {
    leadsService.assertLeadReadable.mockRejectedValueOnce(new ForbiddenException('no'));
    await expect(
      controller.create({ lead_id: 'lead-2' } as any, 'rep-1', ability),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(qualificationService.create).not.toHaveBeenCalled();
  });

  it('list passes the ability through so the query is scoped by lead', async () => {
    qualificationService.findAll.mockResolvedValueOnce({ data: [], total: 0 });
    await controller.findAll({} as any, ability);
    expect(qualificationService.findAll).toHaveBeenCalledWith({}, ability);
  });

  it('by-lead read is refused for a lead the caller may not read', async () => {
    leadsService.assertLeadReadable.mockRejectedValueOnce(new ForbiddenException('no'));
    await expect(controller.findByLeadId('lead-2', ability)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(qualificationService.findByLeadId).not.toHaveBeenCalled();
  });

  it('by-id read resolves the record to its lead and checks that', async () => {
    qualificationService.findOne.mockResolvedValueOnce({ id: 'q1', lead_id: 'lead-1' });
    leadsService.assertLeadReadable.mockResolvedValueOnce(undefined);
    const result = await controller.findOne('q1', ability);
    expect(leadsService.assertLeadReadable).toHaveBeenCalledWith('lead-1', ability);
    expect(result).toEqual({ success: true, data: { id: 'q1', lead_id: 'lead-1' } });
  });

  it('update is refused before anything changes when the lead is out of scope', async () => {
    qualificationService.findOne.mockResolvedValueOnce({ id: 'q1', lead_id: 'lead-2' });
    leadsService.assertLeadReadable.mockRejectedValueOnce(new ForbiddenException('no'));
    await expect(
      controller.update('q1', { has_needs: true } as any, 'rep-1', ability),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(qualificationService.update).not.toHaveBeenCalled();
  });

  it('update proceeds for a lead in scope', async () => {
    qualificationService.findOne.mockResolvedValueOnce({ id: 'q1', lead_id: 'lead-1' });
    leadsService.assertLeadReadable.mockResolvedValueOnce(undefined);
    qualificationService.update.mockResolvedValueOnce({ id: 'q1', has_needs: true });
    const dto = { has_needs: true } as any;
    const result = await controller.update('q1', dto, 'rep-1', ability);
    expect(qualificationService.update).toHaveBeenCalledWith('q1', dto, 'rep-1');
    expect(result.success).toBe(true);
  });
});
