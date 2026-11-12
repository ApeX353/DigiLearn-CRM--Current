import { BadRequestException } from '@nestjs/common';
import { CustomerIdentityService } from './customer-identity.service';

describe('CustomerIdentityService', () => {
  const query = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getOne: jest.fn(),
  };
  const service = new CustomerIdentityService({
    createQueryBuilder: jest.fn(() => query),
  } as any);

  beforeEach(() => query.getOne.mockReset());

  it('accepts blank email as absent', async () => {
    await expect(service.validateCustomerEmail('   ')).resolves.toBeNull();
  });

  it.each([
    'person@cleahue.co.zw',
    'person@clearhue.com',
    'digilearnadmin@gmail.com',
  ])('rejects an internal/shared identity: %s', async (email) => {
    await expect(service.validateCustomerEmail(email)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects an exact active CRM user email', async () => {
    query.getOne.mockResolvedValueOnce({ id: 'staff-1' });
    await expect(
      service.validateCustomerEmail('Sales.Rep@example.com'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('normalizes and accepts a customer email', async () => {
    query.getOne.mockResolvedValueOnce(null);
    await expect(
      service.validateCustomerEmail(' Parent@School.ORG '),
    ).resolves.toBe('parent@school.org');
  });
});
