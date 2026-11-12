import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import {
  paginate,
  Pagination,
  IPaginationOptions,
} from 'nestjs-typeorm-paginate';
import { User } from '../users/entities/user.entity';
import { Role } from '../auth/entities/role.entity';
import { AccountSecurity } from '../auth/entities/account-security.entity';
import { AuthService } from '../auth/auth.service';
import { CreateUserDto } from './dto/create-users.dto';
import { UpdateUserDto } from './dto/update-users.dto';
import { QueryUserDto } from './dto/query-users.dto';

@Injectable()
export class UsersService {

  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Role)
    private roleRepository: Repository<Role>,
    @InjectRepository(AccountSecurity)
    private accountSecurityRepository: Repository<AccountSecurity>,

    private authService: AuthService,
    // Who created, changed or deactivated an account, and which roles they
    // gave it, left no audit row until 14 Oct 2026. Actor from the request context.
    @Optional() private readonly activityLogs?: ActivityLogsService,
  ) {}

  async findAll(query: QueryUserDto): Promise<Pagination<User>> {
    const page = parseInt(query.page || '1', 10);
    const limit = parseInt(query.limit || '10', 10);

    const options: IPaginationOptions = {
      page,
      limit,
    };

    const queryBuilder = this.userRepository
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.roles', 'role')

    // Search filter
    if (query.search) {
      queryBuilder.andWhere(
        '(user.first_name ILIKE :search OR user.last_name ILIKE :search OR user.email ILIKE :search)',
        { search: `%${query.search}%` },
      );
    }

    // Role filter
    if (query.role) {
      queryBuilder.andWhere('role.name = :role', { role: query.role });
    }

    // Status filter
    if (query.status === 'active') {
      queryBuilder.andWhere('user.is_active = :isActive', { isActive: true });
    } else if (query.status === 'inactive') {
      queryBuilder.andWhere('user.is_active = :isActive', { isActive: false });
    }

    queryBuilder.orderBy('user.created_at', 'DESC');

    return paginate<User>(queryBuilder, options);
  }

  async findOne(id: string): Promise<User> {
    const user = await this.userRepository.findOne({
      where: { id },
      relations: [
        'roles',
        'roles.rolePermissions',
        'roles.rolePermissions.permission',
      ],
    });

    if (!user) {
      throw new NotFoundException(`User member with ID ${id} not found`);
    }


    return user;
  }

  async create(createUserDto: CreateUserDto): Promise<User> {
    // Validate roles before registration
    let roleNames: string[] = [];
    if (createUserDto.role_ids && createUserDto.role_ids.length > 0) {
      const roles = await this.roleRepository.find({
        where: { id: In(createUserDto.role_ids) },
      });

      if (roles.length !== createUserDto.role_ids.length) {
        throw new BadRequestException('One or more roles not found');
      }

      roleNames = roles.map((r) => r.name);
    }

    // Use AuthService register method
    const authResponse = await this.authService.register(
      {
        email: createUserDto.email,
        first_name: createUserDto.first_name,
        last_name: createUserDto.last_name,
        password: createUserDto.password || this.generateTemporaryPassword(),
      },
      undefined, // ipAddress
      !createUserDto.password, // requirePasswordChange if no password provided
    );

    // i want another email with password and email to be sent here if no password is provided.

    // Update user roles if specific roles were provided
    if (roleNames.length > 0) {
      const user = await this.userRepository.findOne({
        where: { id: authResponse.user.id },
        relations: ['roles'],
      });

      if (user) {
        const roles = await this.roleRepository.find({
          where: { id: In(createUserDto.role_ids!) },
        });
        user.roles = roles;
        await this.userRepository.save(user);
      }
    }

    const created = await this.findOne(authResponse.user.id);
    void Promise.resolve(
      this.activityLogs?.logCreate(
        'User',
        created.id,
        {
          email: created.email,
          first_name: created.first_name,
          last_name: created.last_name,
          roles: (created.roles ?? []).map((r) => r.name),
          password_set_by_admin: !!createUserDto.password,
        },
        null,
        `Created user ${created.first_name} ${created.last_name} with roles ${(created.roles ?? []).map((r) => r.name).join(', ') || 'none'}`,
      ),
    ).catch(() => undefined);
    return created;
  }

  /**
   * Generate temporary password for staff
   */
  private generateTemporaryPassword(): string {
    const chars =
      'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%^&*';
    let password = '';
    for (let i = 0; i < 12; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
  }

  async update(id: string, updateUserDto: UpdateUserDto): Promise<User> {
    const user = await this.findOne(id);
    const before = {
      first_name: user.first_name,
      last_name: user.last_name,
      territory_provinces: user.territory_provinces,
      roles: (user.roles ?? []).map((r) => r.name),
    };

    // Update basic fields
    if (updateUserDto.first_name) {
      user.first_name = updateUserDto.first_name;
    }

    if (updateUserDto.last_name) {
      user.last_name = updateUserDto.last_name;
    }

    // AUTO2: territories for location-first auto-assign routing. An
    // empty array clears the field (rep then competes on load alone).
    if (updateUserDto.territory_provinces !== undefined) {
      const cleaned = updateUserDto.territory_provinces
        .map((p) => p.trim())
        .filter(Boolean);
      user.territory_provinces = cleaned.length
        ? JSON.stringify(cleaned)
        : null;
    }

    // Update roles if provided
    if (updateUserDto.role_ids && updateUserDto.role_ids.length > 0) {
      const roles = await this.roleRepository.find({
        where: { id: In(updateUserDto.role_ids) },
      });

      if (roles.length !== updateUserDto.role_ids.length) {
        throw new BadRequestException('One or more roles not found');
      }

      user.roles = roles;
    }

    await this.userRepository.save(user);

    const after = await this.findOne(id);
    const afterValues = {
      first_name: after.first_name,
      last_name: after.last_name,
      territory_provinces: after.territory_provinces,
      roles: (after.roles ?? []).map((r) => r.name),
    };
    const rolesChanged = before.roles.join(',') !== afterValues.roles.join(',');
    void Promise.resolve(
      this.activityLogs?.logUpdate(
        'User',
        id,
        before,
        afterValues,
        null,
        rolesChanged
          ? `Changed roles of ${after.first_name} ${after.last_name}: ${before.roles.join(', ') || 'none'} → ${afterValues.roles.join(', ') || 'none'}`
          : `Updated user ${after.first_name} ${after.last_name}`,
      ),
    ).catch(() => undefined);
    return after;
  }

  async remove(id: string): Promise<void> {
    const user = await this.findOne(id);

    // Soft delete by setting is_active to false
    user.is_active = false;
    await this.userRepository.save(user);
    void Promise.resolve(
      this.activityLogs?.logUpdate(
        'User',
        id,
        { is_active: true },
        { is_active: false },
        null,
        `Deactivated user ${user.first_name} ${user.last_name}`,
      ),
    ).catch(() => undefined);
  }

  async activate(id: string): Promise<User> {
    const user = await this.userRepository.findOne({
      where: { id },
      relations: ['roles'],
    });

    if (!user) {
      throw new NotFoundException(`User member with ID ${id} not found`);
    }

    user.is_active = true;
    await this.userRepository.save(user);

    return this.findOne(id);
  }

  async getStats(): Promise<{
    total: number;
    active: number;
    inactive: number;
    admins: number;
    staff: number;
  }> {
    const queryBuilder = this.userRepository
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.roles', 'role')

    const allUser = await queryBuilder.getMany();

    const stats = {
      total: allUser.length,
      active: allUser.filter((u) => u.is_active).length,
      inactive: allUser.filter((u) => !u.is_active).length,
      admins: allUser.filter((u) => u.roles.some((r) => r.name === 'admin'))
        .length,
      staff: allUser.filter(
        (u) =>
          u.roles.some((r) => r.name === 'staff') &&
          !u.roles.some((r) => r.name === 'admin'),
      ).length,
    };

    return stats;
  }
}
