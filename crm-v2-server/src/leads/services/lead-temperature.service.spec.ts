import { LeadTemperatureService } from './lead-temperature.service';

/**
 * Unit tests for the two fixes shipped with the nightly temperature
 * sweeper:
 *   1. `calculateTemperature` must count only the LAST 7 DAYS of
 *      activity (the original query had no date filter and counted
 *      lifetime activity, permanently inflating the behavioral score).
 *   2. `handleNightlyTemperatureSweep` must recalculate every
 *      non-terminal lead so quiet leads actually cool over time.
 *
 * Repositories are mocked, so this runs with no database.
 */
describe('LeadTemperatureService', () => {
  let service: LeadTemperatureService;
  let leadRepo: any;
  let activityRepo: any;
  let qualRepo: any;

  beforeEach(() => {
    leadRepo = {
      findOne: jest.fn(),
      update: jest.fn().mockResolvedValue(undefined),
      createQueryBuilder: jest.fn(),
    };
    activityRepo = { count: jest.fn().mockResolvedValue(0) };
    qualRepo = { findOne: jest.fn().mockResolvedValue(null) };
    service = new LeadTemperatureService(leadRepo, activityRepo, qualRepo);
  });

  describe('calculateTemperature — 7-day activity window', () => {
    it('counts only activities from the last 7 days, not lifetime', async () => {
      leadRepo.findOne.mockResolvedValue({
        id: 'lead-1',
        school: { student_count: 0 },
        estimated_value: 0,
        last_contacted_at: null,
        last_action_at: null,
      });

      await service.calculateTemperature('lead-1');

      // The first count() call is the recent-activity count. The bug
      // was that it carried NO created_at bound; assert it now does.
      const firstWhere = activityRepo.count.mock.calls[0][0].where;
      expect(firstWhere.lead_id).toBe('lead-1');
      expect(firstWhere.created_at).toBeDefined();

      // MoreThanOrEqual(date) is a FindOperator exposing `.value`.
      const bound: Date = firstWhere.created_at.value;
      const daysAgo = (Date.now() - new Date(bound).getTime()) / 86_400_000;
      expect(daysAgo).toBeGreaterThan(6.9);
      expect(daysAgo).toBeLessThan(7.1);
    });
  });

  describe('handleNightlyTemperatureSweep', () => {
    it('recalculates every non-terminal lead and excludes terminal states', async () => {
      const qb = {
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawMany: jest
          .fn()
          .mockResolvedValue([{ id: 'a' }, { id: 'b' }, { id: 'c' }]),
      };
      leadRepo.createQueryBuilder.mockReturnValue(qb);
      const recalcSpy = jest
        .spyOn(service, 'recalculate')
        .mockResolvedValue(undefined);

      await service.handleNightlyTemperatureSweep();

      expect(qb.where).toHaveBeenCalledWith('lead.deleted_at IS NULL');
      expect(qb.andWhere).toHaveBeenCalledWith(
        'lead.status NOT IN (:...terminal)',
        { terminal: ['Disqualified', 'Converted'] },
      );
      expect(recalcSpy).toHaveBeenCalledTimes(3);
      expect(recalcSpy).toHaveBeenNthCalledWith(1, 'a');
      expect(recalcSpy).toHaveBeenNthCalledWith(3, 'c');
    });

    it('never throws even if the lead query fails', async () => {
      leadRepo.createQueryBuilder.mockImplementation(() => {
        throw new Error('db down');
      });
      await expect(
        service.handleNightlyTemperatureSweep(),
      ).resolves.toBeUndefined();
    });
  });
});
