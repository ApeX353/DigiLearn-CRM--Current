import { BadRequestException } from '@nestjs/common';
import { LeadsService } from './leads.service';

describe('LeadsService direct manager assignment', () => {
  let service: LeadsService;

  beforeEach(() => {
    service = Object.create(LeadsService.prototype) as LeadsService;
    (service as any).findOne = jest
      .fn()
      .mockResolvedValue({ id: 'lead-1', assigned_to: 'user-old' });
    (service as any).usersRepository = {
      findOne: jest
        .fn()
        .mockResolvedValue({ id: 'user-new', first_name: 'New', last_name: 'Owner' }),
    };
    (service as any).leadRepository = { save: jest.fn() };
    (service as any).activityLogsService = { logUpdate: jest.fn() };
  });

  it('REA1 rejects an owner change without a reason', async () => {
    await expect(
      service.assignLead('lead-1', 'user-new', 'manager-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect((service as any).leadRepository.save).not.toHaveBeenCalled();
  });

  it('REA1 stores the reason in the visible assignment audit row', async () => {
    await service.assignLead(
      'lead-1',
      'user-new',
      'manager-1',
      'Territory cover',
    );

    expect((service as any).activityLogsService.logUpdate).toHaveBeenCalledWith(
      'Lead',
      'lead-1',
      { assigned_to: 'user-old' },
      {
        assigned_to: 'user-new',
        reassignment_reason: 'Territory cover',
      },
      'manager-1',
      expect.stringContaining('Reason: Territory cover'),
    );
  });
});
