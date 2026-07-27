import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { School } from './entities/schools.entity';
import { Contact } from '../contacts/entities/contact.entity';
import {
  CreateSchoolDto,
  CreateSchoolWithContactsDto,
  UpdateSchoolDto,
  QuerySchoolDto,
} from './dto';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import {
  paginate,
  Pagination,
  IPaginationOptions,
} from 'nestjs-typeorm-paginate';
import { count } from 'console';

@Injectable()
export class SchoolsService {
  constructor(
    @InjectRepository(School)
    private readonly schoolRepository: Repository<School>,
    private readonly dataSource: DataSource,
    private readonly activityLogsService: ActivityLogsService,
  ) {}

  /**
   * City is mandatory on every user-created school. The single exception
   * is the admin bulk-import path (Nash file carries no city): those
   * schools land city-less and anyone can backfill via setCity().
   */
  private assertCityPresent(city: string | undefined, role?: string): void {
    const importRoles = ['admin', 'admin_support'];
    if (!city?.trim() && !importRoles.includes(role ?? '')) {
      throw new BadRequestException('City is required');
    }
  }

  async createWithContacts(
    dto: CreateSchoolWithContactsDto,
    userId: string,
    role?: string,
  ): Promise<{ school: School; contacts: Contact[] }> {
    const { school: schoolData, contacts: contactsList } = dto;
    this.assertCityPresent(schoolData.city, role);

    return await this.dataSource.transaction(async (manager) => {
      // Step 1: Create school
      const school = manager.create(School, schoolData);
      const savedSchool = await manager.save(School, school);

      // Step 2: Create contacts
      const savedContacts: Contact[] = [];

      for (const contactDto of contactsList) {
        let contact: Contact;

        if (contactDto.email) {
          // Check if contact already exists by email + school
          const existing = await manager.findOne(Contact, {
            where: { email: contactDto.email, school_id: savedSchool.id },
          });

          if (existing) {
            existing.first_name = contactDto.first_name;
            existing.last_name = contactDto.last_name;
            existing.phone = contactDto.phone || existing.phone;
            existing.whatsapp_number = contactDto.whatsapp_number || existing.whatsapp_number;
            existing.role = contactDto.role || existing.role;
            existing.notes = contactDto.notes || existing.notes;
            existing.is_primary = contactDto.is_primary;
            contact = await manager.save(Contact, existing);
          } else {
            contact = await manager.save(Contact, manager.create(Contact, {
              school_id: savedSchool.id,
              first_name: contactDto.first_name,
              last_name: contactDto.last_name,
              email: contactDto.email,
              phone: contactDto.phone,
              whatsapp_number: contactDto.whatsapp_number,
              role: contactDto.role,
              notes: contactDto.notes,
              is_primary: contactDto.is_primary,
              is_active: true,
            }));
          }
        } else {
          contact = await manager.save(Contact, manager.create(Contact, {
            school_id: savedSchool.id,
            first_name: contactDto.first_name,
            last_name: contactDto.last_name,
            phone: contactDto.phone,
            whatsapp_number: contactDto.whatsapp_number,
            role: contactDto.role,
            notes: contactDto.notes,
            is_primary: contactDto.is_primary,
            is_active: true,
          }));
        }

        savedContacts.push(contact);
      }

      // Step 3: Log activity
      await this.activityLogsService.logCreate(
        'School',
        savedSchool.id,
        { ...savedSchool, contacts: savedContacts },
        userId,
        `Created school: ${savedSchool.name} with ${savedContacts.length} contact(s)`,
      );

      const resultSchool = await manager.findOne(School, {
        where: { id: savedSchool.id },
        relations: ['contacts'],
      });

      return {
        school: resultSchool!,
        contacts: savedContacts,
      };
    });
  }

  async create(
    createSchoolDto: CreateSchoolDto,
    userId: string,
    role?: string,
  ): Promise<School> {
    this.assertCityPresent(createSchoolDto.city, role);
    const school = this.schoolRepository.create(createSchoolDto);
    const savedSchool = await this.schoolRepository.save(school);

    await this.activityLogsService.logCreate(
      'School',
      savedSchool.id,
      savedSchool,
      userId,
      `Created school: ${savedSchool.name}`,
    );

    return savedSchool;
  }

  async findAll(
    querySchoolDto: QuerySchoolDto,
  ): Promise<Pagination<School>> {
    // Default page size was '10'; bumped to '25' so any caller that
    // omits `limit` — health checks, curl probes, the Scalar API
    // playground, any client that forgets the query param — gets the
    // same page size the Schools management page now uses. Belt-and-
    // braces: the frontend already sends an explicit `limit=25`.
    const { page = '1', limit = '25', search, school_type, province, region, include_inactive } = querySchoolDto;

    // Previously this query did:
    //   .leftJoinAndSelect('school.contacts', 'contacts')
    //   .leftJoinAndSelect('school.leads', 'leads')
    // That multiplied the SQL result by (contacts × leads) for every
    // school. `nestjs-typeorm-paginate` then counted and sliced those
    // joined rows, so `totalItems` was inflated (84 for 55 distinct
    // schools) and pages 2+ came up short (19 / 10 instead of 25 / 5).
    // The list view doesn't need eager child collections — the school
    // detail page fetches them separately — so we drop the joins
    // here. Pagination now operates on distinct schools and every
    // page returns exactly `limit` rows (except the final one).
    const queryBuilder = this.schoolRepository.createQueryBuilder('school');

    if (!include_inactive) {
      queryBuilder.andWhere('school.is_active = :isActive', { isActive: true });
    }

    if (search) {
      queryBuilder.andWhere(
        '(school.name ILIKE :search OR school.city ILIKE :search OR CAST(school.region AS TEXT) ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    if (school_type) {
      queryBuilder.andWhere('school.school_type = :schoolType', {
        schoolType: school_type,
      });
    }

    if (province) {
      queryBuilder.andWhere('school.province = :province', { province });
    }

    if (region) {
      queryBuilder.andWhere('school.region = :region', { region });
    }

    queryBuilder.orderBy('school.created_at', 'DESC');

    const options: IPaginationOptions = {
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
    };

    return paginate<School>(queryBuilder, options);
  }

  async findOne(id: string): Promise<School> {
    const school = await this.schoolRepository.findOne({
      where: { id },
      relations: ['contacts', 'leads'],
    });

    if (!school) {
      throw new NotFoundException(`School with ID ${id} not found`);
    }

    return school;
  }

  async update(
    id: string,
    updateSchoolDto: UpdateSchoolDto,
    userId: string,
  ): Promise<School> {
    const school = await this.findOne(id);

    const oldValues = { ...school };
    Object.assign(school, updateSchoolDto);
    const updatedSchool = await this.schoolRepository.save(school);

    await this.activityLogsService.logUpdate(
      'School',
      updatedSchool.id,
      oldValues,
      updatedSchool,
      userId,
      `Updated school: ${updatedSchool.name}`,
    );

    return updatedSchool;
  }

  /**
   * Fill in a missing city — open to every signed-in user, because the
   * Nash import lands schools without one and whoever is on the phone
   * with the school is the person who learns where it is. Changing a
   * city that is already set stays a manager/admin action (Edit School).
   */
  async setCity(
    id: string,
    city: string,
    userId: string,
    role: string,
  ): Promise<School> {
    const school = await this.findOne(id);

    const alreadySet = !!school.city?.trim();
    const canOverwrite = ['admin', 'admin_support', 'sales_manager'].includes(
      role,
    );
    if (alreadySet && !canOverwrite) {
      throw new ForbiddenException(
        'This school already has a city — ask a manager to change it',
      );
    }

    const oldValues = { ...school };
    school.city = city.trim();
    const updatedSchool = await this.schoolRepository.save(school);

    await this.activityLogsService.logUpdate(
      'School',
      updatedSchool.id,
      oldValues,
      updatedSchool,
      userId,
      `Set city on school: ${updatedSchool.name} → ${updatedSchool.city}`,
    );

    return updatedSchool;
  }

  async remove(id: string, userId: string): Promise<void> {
    const school = await this.findOne(id);

    await this.schoolRepository.softDelete(id);

    await this.activityLogsService.logDelete(
      'School',
      school.id,
      school,
      userId,
      `Deleted school: ${school.name}`,
    );
  }

  async restore(id: string, userId: string): Promise<School> {
    const school = await this.schoolRepository.findOne({
      where: { id },
      withDeleted: true,
    });

    if (!school) {
      throw new NotFoundException(`School with ID ${id} not found`);
    }

    if (!school.deleted_at) {
      throw new NotFoundException(`School with ID ${id} is not deleted`);
    }

    await this.schoolRepository.restore(id);
    const restoredSchool = await this.findOne(id);

    await this.activityLogsService.logCreate(
      'School',
      restoredSchool.id,
      restoredSchool,
      userId,
      `Restored school: ${restoredSchool.name}`,
    );

    return restoredSchool;
  }

  async getSchoolStats(schoolId: string) {
    await this.findOne(schoolId); // validates school exists

    const [activeDeals, openQuotes, deals, outstandingInvoices] = await Promise.all([
      // Active deals: ongoing close_status
      this.dataSource
        .createQueryBuilder()
        .select('COUNT(*)', 'count')
        .addSelect('COALESCE(SUM(d.value), 0)', 'totalValue')
        .from('deals', 'd')
        .where('d.school_id = :schoolId', { schoolId })
        .andWhere('d.close_status = :status', { status: 'ongoing' })
        .getRawOne(),

      // Open quotes: Draft or Sent
      this.dataSource
        .createQueryBuilder()
        .select('COUNT(*)', 'count')
        .addSelect('COALESCE(SUM(q.total), 0)', 'totalValue')
        .from('quotes', 'q')
        .where('q.school_id = :schoolId', { schoolId })
        .andWhere('q.status IN (:...statuses)', { statuses: ['Draft', 'Sent'] })
        .getRawOne(),
      
        // Open quotes: Draft or Sent
      this.dataSource
        .createQueryBuilder()
        .select('COUNT(*)', 'count')
        .addSelect('COALESCE(SUM(d.value), 0)', 'totalValue')
        .from('deals', 'd')
        .where('d.school_id = :schoolId', { schoolId })
        .getRawOne(),

      // Outstanding invoices: Sent, Overdue, or Partially-Paid
      this.dataSource
        .createQueryBuilder()
        .select('COUNT(*)', 'count')
        .addSelect('COALESCE(SUM(i.total), 0)', 'totalValue')
        .from('invoices', 'i')
        .where('i.school_id = :schoolId', { schoolId })
        .andWhere('i.status IN (:...statuses)', { statuses: ['Sent', 'Overdue', 'Partially-Paid'] })
        .getRawOne(),
    ]);

    return {
      activeDeals: {
        count: Number(activeDeals.count),
        totalValue: Number(activeDeals.totalValue),
      },
      openQuotes: {
        count: Number(openQuotes.count),
        totalValue: Number(openQuotes.totalValue),
      },
      deals: {
        count: Number(deals.count),
        totalValue: Number(deals.totalValue),
      },
      outstandingInvoices: {
        count: Number(outstandingInvoices.count),
        totalValue: Number(outstandingInvoices.totalValue),
      },
    };
  }
}
