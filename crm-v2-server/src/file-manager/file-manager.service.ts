import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, Brackets } from 'typeorm';
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
    private readonly dataSource: DataSource,
  ) {}

  /**
   * DOC-1: a rep sees a file when it hangs on a record assigned to them
   * (lead/deal by assigned_to, invoice/quote by owner), when it hangs on
   * a shared record (schools and contacts are visible to every operator,
   * so their files are too), or when they uploaded it themselves.
   * Elevated roles pass scopeUserId=undefined and see everything.
   */
  private async canSeeParent(
    entityType: FileEntityType,
    entityId: string,
    scopeUserId: string,
  ): Promise<boolean> {
    switch (entityType) {
      case 'school':
      case 'contact':
        return true;
      case 'lead':
      case 'deal': {
        const table = entityType === 'lead' ? 'leads' : 'deals';
        const rows = await this.dataSource.query(
          `SELECT 1 FROM ${table} WHERE id = $1 AND assigned_to = $2 LIMIT 1`,
          [entityId, scopeUserId],
        );
        return rows.length > 0;
      }
      case 'invoice':
      case 'quote': {
        const table = entityType === 'invoice' ? 'invoices' : 'quotes';
        const rows = await this.dataSource.query(
          `SELECT 1 FROM ${table} WHERE id = $1 AND owner_id = $2 LIMIT 1`,
          [entityId, scopeUserId],
        );
        return rows.length > 0;
      }
      default:
        return false;
    }
  }

  private async canSeeFile(
    file: ManagedFile,
    scopeUserId?: string,
  ): Promise<boolean> {
    if (!scopeUserId) return true;
    if (file.uploaded_by_id === scopeUserId) return true;
    return this.canSeeParent(file.entity_type, file.entity_id, scopeUserId);
  }

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

  async findAll(
    query: QueryFileDto,
    scopeUserId?: string,
  ): Promise<Pagination<ManagedFile>> {
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

    // DOC-1: same visibility rule as canSeeFile(), expressed in SQL so
    // the flat list never shows a rep other people's paperwork.
    if (scopeUserId) {
      qb.andWhere(
        new Brackets((w) => {
          w.where('file.uploaded_by_id = :scopeUserId', { scopeUserId })
            .orWhere("file.entity_type IN ('school', 'contact')")
            .orWhere(
              "file.entity_type = 'lead' AND EXISTS (SELECT 1 FROM leads l WHERE l.id = file.entity_id AND l.assigned_to = :scopeUserId)",
            )
            .orWhere(
              "file.entity_type = 'deal' AND EXISTS (SELECT 1 FROM deals d WHERE d.id = file.entity_id AND d.assigned_to = :scopeUserId)",
            )
            .orWhere(
              "file.entity_type = 'invoice' AND EXISTS (SELECT 1 FROM invoices i WHERE i.id = file.entity_id AND i.owner_id = :scopeUserId)",
            )
            .orWhere(
              "file.entity_type = 'quote' AND EXISTS (SELECT 1 FROM quotes q WHERE q.id = file.entity_id AND q.owner_id = :scopeUserId)",
            );
        }),
      );
    }

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

  async findOne(id: string, scopeUserId?: string): Promise<ManagedFile> {
    const file = await this.fileRepo.findOne({
      where: { id },
      relations: ['uploaded_by'],
    });

    if (!file) {
      throw new NotFoundException(`File with ID ${id} not found`);
    }

    // DOC-1: a foreign file answers 404 — not 403 — so ids can't be probed.
    if (!(await this.canSeeFile(file, scopeUserId))) {
      throw new NotFoundException(`File with ID ${id} not found`);
    }

    return file;
  }

  async findByEntity(
    entityType: FileEntityType,
    entityId: string,
    scopeUserId?: string,
  ): Promise<ManagedFile[]> {
    const files = await this.fileRepo.find({
      where: { entity_type: entityType, entity_id: entityId },
      relations: ['uploaded_by'],
      order: { created_at: 'DESC' },
    });
    if (!scopeUserId || files.length === 0) return files;
    // DOC-1: one parent, so one ownership check covers the whole list;
    // on a foreign record the rep still sees their own uploads.
    if (await this.canSeeParent(entityType, entityId, scopeUserId)) {
      return files;
    }
    return files.filter((f) => f.uploaded_by_id === scopeUserId);
  }

  async update(
    id: string,
    dto: UpdateFileDto,
    userId: string,
    scopeUserId?: string,
  ): Promise<ManagedFile> {
    const file = await this.findOne(id, scopeUserId);
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

  async remove(id: string, userId: string, scopeUserId?: string): Promise<void> {
    const file = await this.findOne(id, scopeUserId);

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
