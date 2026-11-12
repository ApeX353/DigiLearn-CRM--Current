import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../users/entities/user.entity';

const INTERNAL_DOMAINS = new Set([
  'cleahue.co.zw',
  'cleahue.com',
  'clearhue.co.zw',
  'clearhue.com',
]);
const BLOCKED_SHARED_EMAILS = new Set(['digilearnadmin@gmail.com']);

const normalizeName = (value?: string | null): string =>
  (value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

@Injectable()
export class CustomerIdentityService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {}

  normalizeEmail(value?: string | null): string | null {
    const email = (value ?? '').trim().toLowerCase();
    return email || null;
  }

  isInternalDomainEmail(value?: string | null): boolean {
    const email = this.normalizeEmail(value);
    const domain = email?.split('@')[1];
    return !!domain && INTERNAL_DOMAINS.has(domain);
  }

  async isActiveStaffEmail(value?: string | null): Promise<boolean> {
    const email = this.normalizeEmail(value);
    if (!email) return false;
    if (BLOCKED_SHARED_EMAILS.has(email) || this.isInternalDomainEmail(email)) {
      return true;
    }
    return !!(await this.usersRepository
      .createQueryBuilder('user')
      .where('user.is_active = true')
      .andWhere('LOWER(TRIM(user.email)) = :email', { email })
      .getOne());
  }

  async isActiveStaffName(
    firstName?: string | null,
    lastName?: string | null,
  ): Promise<boolean> {
    const first = normalizeName(firstName);
    const last = normalizeName(lastName);
    if (!first || !last) return false;
    return !!(await this.usersRepository
      .createQueryBuilder('user')
      .where('user.is_active = true')
      .andWhere('LOWER(TRIM(user.first_name)) = :first', { first })
      .andWhere('LOWER(TRIM(user.last_name)) = :last', { last })
      .getOne());
  }

  async validateCustomerEmail(value?: string | null): Promise<string | null> {
    const email = this.normalizeEmail(value);
    if (!email) return null;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new BadRequestException('Enter a valid customer email address');
    }
    if (await this.isActiveStaffEmail(email)) {
      throw new BadRequestException(
        'Use the customer contact email, not a DigiLearn/Clearhue staff address',
      );
    }
    return email;
  }
}
