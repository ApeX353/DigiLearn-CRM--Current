import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ManagedFile } from './entities/managed-file.entity';
import { CreateFileDto } from './dto/create-file.dto';
import { UpdateFileDto } from './dto/update-file.dto';
import { QueryFileDto } from './dto/query-file.dto';
import type { FileEntityType } from './constants/providers';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import {
  paginate,
  Pagination,
  IPaginationOptions,
} from 'nestjs-typeorm-paginate';

@Injectable()
export class FileManagerService {
  constructor(
    @InjectRepository(ManagedFile)
    private readonly fileRepo: Repository<ManagedFile>,
    private readonly activityLogsService: ActivityLogsService,
  ) {}

  async create(dto: CreateFileDto, userId: string): Promise<ManagedFile> {
    const file = this.fileRepo.create({
      ...dto,
      uploaded_by_id: userId,
    });

    const saved = await this.fileRepo.save(file);

    await this.activityLogsService.logCreate(
      'ManagedFile',
      saved.id,
      {
        file_name: saved.file_name,
        provider: saved.provider,
        entity_type: saved.entity_type,
        entity_id: saved.entity_id,
      },
      userId,
      `Uploaded file: ${saved.file_name} for ${saved.entity_type} ${saved.entity_id}`,
    );

    return this.findOne(saved.id);
  }

  async findAll(query: QueryFileDto): Promise<Pagination<ManagedFile>> {
    const {
      page = '1',
      limit = '10',
      entity_type,
      entity_id,
      provider,
      file_type,
      uploaded_by,
      search,
    } = query;

    const qb = this.fileRepo
      .createQueryBuilder('file')
      .leftJoinAndSelect('file.uploaded_by', 'uploader');

    if (entity_type) {
      qb.andWhere('file.entity_type = :entity_type', { entity_type });
    }

    if (entity_id) {
      qb.andWhere('file.entity_id = :entity_id', { entity_id });
    }

    if (provider) {
      qb.andWhere('file.provider = :provider', { provider });
    }

    if (file_type) {
      qb.andWhere('file.file_type = :file_type', { file_type });
    }

    if (uploaded_by) {
      qb.andWhere('file.uploaded_by_id = :uploaded_by', { uploaded_by });
    }

    if (search) {
      qb.andWhere('file.file_name LIKE :search', {
        search: `%${search}%`,
      });
    }

    qb.orderBy('file.created_at', 'DESC');

    const options: IPaginationOptions = {
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
    };

    return paginate<ManagedFile>(qb, options);
  }

  async findOne(id: string): Promise<ManagedFile> {
    const file = await this.fileRepo.findOne({
      where: { id },
      relations: ['uploaded_by'],
    });

    if (!file) {
      throw new NotFoundException(`File with ID ${id} not found`);
    }

    return file;
  }

  async findByEntity(
    entityType: FileEntityType,
    entityId: string,
  ): Promise<ManagedFile[]> {
    return this.fileRepo.find({
      where: { entity_type: entityType, entity_id: entityId },
      relations: ['uploaded_by'],
      order: { created_at: 'DESC' },
    });
  }

  async update(
    id: string,
    dto: UpdateFileDto,
    userId: string,
  ): Promise<ManagedFile> {
    const file = await this.findOne(id);
    const oldValues = { ...file };

    Object.assign(file, dto);
    const updated = await this.fileRepo.save(file);

    await this.activityLogsService.logUpdate(
      'ManagedFile',
      updated.id,
      { file_name: oldValues.file_name },
      { file_name: updated.file_name },
      userId,
      `Updated file: ${updated.file_name}`,
    );

    return this.findOne(updated.id);
  }

  async remove(id: string, userId: string): Promise<void> {
    const file = await this.findOne(id);

    await this.fileRepo.remove(file);

    await this.activityLogsService.logDelete(
      'ManagedFile',
      id,
      { file_name: file.file_name },
      userId,
      `Deleted file: ${file.file_name}`,
    );
  }
}
