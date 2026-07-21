import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Contact } from './entities/contact.entity';
import { CreateContactDto, UpdateContactDto, QueryContactDto } from './dto';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import {
  paginate,
  Pagination,
  IPaginationOptions,
} from 'nestjs-typeorm-paginate';

@Injectable()
export class ContactsService {
  constructor(
    @InjectRepository(Contact)
    private readonly contactRepository: Repository<Contact>,
    private readonly activityLogsService: ActivityLogsService,
  ) {}

  async create(
    createContactDto: CreateContactDto,
    userId: string,
  ): Promise<Contact> {
    const contact = this.contactRepository.create(createContactDto);
    const savedContact = await this.contactRepository.save(contact);

    await this.activityLogsService.logCreate(
      'Contact',
      savedContact.id,
      savedContact,
      userId,
      `Created contact: ${savedContact.first_name} ${savedContact.last_name}`,
    );

    return savedContact;
  }

  async findAll(
    queryContactDto: QueryContactDto,
  ): Promise<Pagination<Contact>> {
    const {
      page = '1',
      limit = '10',
      search,
      school_id,
      role,
      preferred_contact_method,
      is_primary,
      include_inactive,
      stakeholder_type,
      is_sales_lead,
    } = queryContactDto;

    const queryBuilder = this.contactRepository
      .createQueryBuilder('contact')
      .leftJoinAndSelect('contact.school', 'school');

    if (!include_inactive) {
      queryBuilder.andWhere('contact.is_active = :isActive', {
        isActive: true,
      });
    }

    if (search) {
      queryBuilder.andWhere(
        '(contact.first_name LIKE :search OR contact.last_name LIKE :search OR contact.email LIKE :search)',
        { search: `%${search}%` },
      );
    }

    if (school_id) {
      queryBuilder.andWhere('contact.school_id = :schoolId', {
        schoolId: school_id,
      });
    }

    if (role) {
      queryBuilder.andWhere('contact.role = :role', { role });
    }

    if (preferred_contact_method) {
      queryBuilder.andWhere(
        'contact.preferred_contact_method = :preferredContactMethod',
        { preferredContactMethod: preferred_contact_method },
      );
    }

    if (is_primary !== undefined) {
      queryBuilder.andWhere('contact.is_primary = :isPrimary', {
        isPrimary: is_primary,
      });
    }

    if (stakeholder_type) {
      queryBuilder.andWhere('contact.stakeholder_type = :stakeholderType', {
        stakeholderType: stakeholder_type,
      });
    }

    if (is_sales_lead !== undefined) {
      queryBuilder.andWhere('contact.is_sales_lead = :isSalesLead', {
        isSalesLead: is_sales_lead,
      });
    }

    queryBuilder.orderBy('contact.created_at', 'DESC');

    const options: IPaginationOptions = {
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
    };

    return paginate<Contact>(queryBuilder, options);
  }

  async findOne(id: string): Promise<Contact> {
    const contact = await this.contactRepository.findOne({
      where: { id },
      relations: ['school'],
    });

    if (!contact) {
      throw new NotFoundException(`Contact with ID ${id} not found`);
    }

    return contact;
  }

  async update(
    id: string,
    updateContactDto: UpdateContactDto,
    userId: string,
  ): Promise<Contact> {
    const contact = await this.findOne(id);

    const oldValues = { ...contact };
    Object.assign(contact, updateContactDto);
    const updatedContact = await this.contactRepository.save(contact);

    await this.activityLogsService.logUpdate(
      'Contact',
      updatedContact.id,
      oldValues,
      updatedContact,
      userId,
      `Updated contact: ${updatedContact.first_name} ${updatedContact.last_name}`,
    );

    return updatedContact;
  }

  async remove(id: string, userId: string): Promise<void> {
    const contact = await this.findOne(id);

    await this.contactRepository.softDelete(id);

    await this.activityLogsService.logDelete(
      'Contact',
      contact.id,
      contact,
      userId,
      `Deleted contact: ${contact.first_name} ${contact.last_name}`,
    );
  }

  async restore(id: string, userId: string): Promise<Contact> {
    const contact = await this.contactRepository.findOne({
      where: { id },
      withDeleted: true,
    });

    if (!contact) {
      throw new NotFoundException(`Contact with ID ${id} not found`);
    }

    if (!contact.deleted_at) {
      throw new NotFoundException(`Contact with ID ${id} is not deleted`);
    }

    await this.contactRepository.restore(id);
    const restoredContact = await this.findOne(id);

    await this.activityLogsService.logCreate(
      'Contact',
      restoredContact.id,
      restoredContact,
      userId,
      `Restored contact: ${restoredContact.first_name} ${restoredContact.last_name}`,
    );

    return restoredContact;
  }
}
