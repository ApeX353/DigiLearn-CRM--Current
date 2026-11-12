import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
  HttpStatus,
  Req,
  Res,
  BadRequestException,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UploadFileDto } from './dto/upload-file.dto';
import { MAX_FILE_BYTES } from './file-content.validation';
import { ContentUploadLimitInterceptor } from './content-upload-limit.interceptor';
import { ApiTags, ApiOperation, ApiParam, ApiResponse } from '@nestjs/swagger';
import { FileManagerService } from './file-manager.service';
import { CreateFileDto } from './dto/create-file.dto';
import { UpdateFileDto } from './dto/update-file.dto';
import { QueryFileDto } from './dto/query-file.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { FILE_ENTITY_TYPES, type FileEntityType } from './constants/providers';
import { OneOfPipe } from '../common/pipes/one-of.pipe';
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import type { Request, Response } from 'express';
import { ALLOWED_CONTENT_TYPES } from './constants/allowed-content-types';
import { Optional } from '@nestjs/common';
import { DiagnosticsService } from '../diagnostics/diagnostics.service';

@ApiTags('File Manager')
@Controller('file-manager')
export class FileManagerController {
  constructor(
    private readonly fileManagerService: FileManagerService,
    @Optional() private readonly diagnostics?: DiagnosticsService,
  ) {}

  @Post('content')
  @Roles('admin', 'sales_manager', 'sales_rep')
  @UseInterceptors(
    ContentUploadLimitInterceptor,
    FileInterceptor('file', {
      limits: {
        // Busboy signals its limit at equality. Allow the inclusive 10 MiB
        // boundary; service validation still rejects every byte above it.
        fileSize: MAX_FILE_BYTES + 1,
        files: 1,
        fields: 2,
        parts: 4,
        fieldSize: 100,
      },
    }),
  )
  @ApiOperation({ summary: 'Store file bytes and metadata atomically' })
  async uploadContent(
    @UploadedFile()
    file:
      | { buffer: Buffer; mimetype: string; originalname: string }
      | undefined,
    @Body() dto: UploadFileDto,
    @CurrentUser('id') userId: string,
    @CurrentUser('role') role: string,
  ) {
    if (!file) throw new BadRequestException('A file is required');
    const data = await this.fileManagerService.saveContent(
      {
        ...dto,
        buffer: file.buffer,
        file_type: file.mimetype,
        file_name: file.originalname,
      },
      userId,
      role === 'sales_rep' ? userId : undefined,
    );
    return { data, status: 'success' };
  }

  @Get(':id/content')
  @ApiOperation({
    summary: 'Download file bytes with the same access rules as metadata',
  })
  async downloadContent(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') userId: string,
    @CurrentUser('role') role: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { file, buffer } = await this.fileManagerService.getContent(
      id,
      role === 'sales_rep' ? userId : undefined,
    );
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const encodedName = encodeURIComponent(file.file_name).replace(
      /['()*]/g,
      (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
    );
    return new StreamableFile(buffer, {
      type: file.file_type || 'application/octet-stream',
      disposition: `attachment; filename*=UTF-8''${encodedName}`,
      length: buffer.length,
    });
  }

  @Post()
  @Roles('admin', 'sales_manager', 'sales_rep')
  @ApiOperation({ summary: 'Upload file metadata' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'File record created',
  })
  async create(@Body() dto: CreateFileDto, @CurrentUser('id') userId: string) {
    const data = await this.fileManagerService.create(dto, userId);
    return { data, status: 'success' };
  }

  @Post('upload')
  @Roles('admin', 'sales_manager', 'sales_rep')
  @ApiOperation({ summary: 'Handle Vercel Upload file' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Vercel File uploaded',
  })
  async handleUpload(@Req() req: Request, @Res() res: Response) {
    try {
      const body = req.body as HandleUploadBody;

      const jsonResponse = await handleUpload({
        body,
        request: req,
        onBeforeGenerateToken: async (pathname, clientPayload) => {
          // Add your authentication/validation here
          // const user = req.user; // if using auth guards

          return {
            allowedContentTypes: ALLOWED_CONTENT_TYPES.filter(
              (type) => type.isAllowed,
            ).map((type) => type.type),
            tokenPayload: JSON.stringify({
              // Optional metadata
              // userId: user.id,
            }),
          };
        },
        onUploadCompleted: async ({ blob, tokenPayload }) => {
          // The CRM still writes no managed_files row for a client-side blob
          // upload (pre-existing gap); at least the attempt is on record now,
          // so an orphaned blob can be traced to a time and a request.
          this.diagnostics?.recordDelivery({
            channel: 'blob',
            provider: 'vercel',
            eventType: 'client-upload-completed',
            target: blob.pathname,
            requestSummary: { content_type: blob.contentType, token_payload: tokenPayload ? 'present' : 'empty' },
            success: true,
          });
        },
      });

      return res.json(jsonResponse);
    } catch (error) {
      const reference = this.diagnostics?.recordEvent({
        kind: 'delivery_failure',
        level: 'warn',
        message: `Blob upload handshake failed: ${error?.message ?? String(error)}`,
        error,
        entity: 'ManagedFile',
      });
      return res.status(400).json({ error: error.message, ...(reference ? { reference } : {}) });
    }
  }

  @Get()
  @ApiOperation({ summary: 'List files with filters' })
  async findAll(
    @Query() query: QueryFileDto,
    @CurrentUser('id') userId: string,
    @CurrentUser('role') role: string,
  ) {
    // DOC-1: a rep's file list covers their own records and uploads,
    // not every contract, PO and ID scan in the company.
    const scopeUserId = role === 'sales_rep' ? userId : undefined;
    const data = await this.fileManagerService.findAll(query, scopeUserId);
    return {
      data: data.items,
      meta: data.meta,
      links: data.links,
      status: 'success',
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get file by ID' })
  @ApiParam({ name: 'id', description: 'File UUID' })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') userId: string,
    @CurrentUser('role') role: string,
  ) {
    const scopeUserId = role === 'sales_rep' ? userId : undefined;
    const data = await this.fileManagerService.findOne(id, scopeUserId);
    return { data, status: 'success' };
  }

  @Get('entity/:entityType/:entityId')
  @ApiOperation({ summary: 'Get all files for a specific entity' })
  @ApiParam({
    name: 'entityType',
    enum: FILE_ENTITY_TYPES,
    description: 'Entity type',
  })
  @ApiParam({ name: 'entityId', description: 'Entity UUID' })
  async findByEntity(
    @Param('entityType', new OneOfPipe(FILE_ENTITY_TYPES, 'entityType'))
    entityType: FileEntityType,
    @Param('entityId', ParseUUIDPipe) entityId: string,
    @CurrentUser('id') userId: string,
    @CurrentUser('role') role: string,
  ) {
    const scopeUserId = role === 'sales_rep' ? userId : undefined;
    const data = await this.fileManagerService.findByEntity(
      entityType,
      entityId,
      scopeUserId,
    );
    return { data, status: 'success' };
  }

  @Patch(':id')
  @Roles('admin', 'sales_manager', 'sales_rep')
  @ApiOperation({ summary: 'Update file metadata' })
  @ApiParam({ name: 'id', description: 'File UUID' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateFileDto,
    @CurrentUser('id') userId: string,
    @CurrentUser('role') role: string,
  ) {
    // DOC-1: a rep can only rename files on records they can see.
    const scopeUserId = role === 'sales_rep' ? userId : undefined;
    const data = await this.fileManagerService.update(
      id,
      dto,
      userId,
      scopeUserId,
    );
    return { data, status: 'success' };
  }

  // TODO - Make sure to also delete the file on vercel blob storage,
  // or whatever storage being used.
  @Delete(':id')
  @Roles('admin', 'sales_manager', 'sales_rep')
  @ApiOperation({ summary: 'Delete file record' })
  @ApiParam({ name: 'id', description: 'File UUID' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') userId: string,
    @CurrentUser('role') role: string,
  ) {
    // DOC-1: a rep can only delete files on records they can see.
    const scopeUserId = role === 'sales_rep' ? userId : undefined;
    await this.fileManagerService.remove(id, userId, scopeUserId);
    return { status: 'success', message: 'File deleted' };
  }
}
