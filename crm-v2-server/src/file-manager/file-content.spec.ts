import {
  BadRequestException,
  NotFoundException,
  PayloadTooLargeException,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { FileManagerController } from './file-manager.controller';
import { FileManagerService } from './file-manager.service';
import { MAX_FILE_BYTES, validateFileContent } from './file-content.validation';
import { DatabaseFileContents1788000000000 } from '../database/migrations/1788000000000-DatabaseFileContents';
import { createHash } from 'node:crypto';
import { QuotesService } from '../quotes/quotes.service';
import { InvoicesService } from '../invoices/invoices.service';
import { ContentUploadLimitInterceptor } from './content-upload-limit.interceptor';
import { Subject } from 'rxjs';

const entityId = '00000000-0000-4000-8000-000000000001';
const userId = '00000000-0000-4000-8000-000000000002';
const pdf = Buffer.from('%PDF-1.4\nCRM upload test\n%%EOF');
const input = {
  entity_type: 'lead' as const,
  entity_id: entityId,
  file_name: 'sample.pdf',
  file_type: 'application/pdf',
  buffer: pdf,
};

describe('upload memory concurrency bound', () => {
  it('admits four multipart requests and frees the slot on completion/error', () => {
    const limiter = new ContentUploadLimitInterceptor();
    const streams = Array.from({ length: 4 }, () => new Subject());
    for (const stream of streams)
      limiter
        .intercept({} as any, { handle: () => stream })
        .subscribe({ error: () => undefined });
    expect(() =>
      limiter.intercept({} as any, { handle: () => new Subject() }),
    ).toThrow('Uploads are busy');
    streams[0].complete();
    const replacement = new Subject();
    expect(() =>
      limiter.intercept({} as any, { handle: () => replacement }).subscribe(),
    ).not.toThrow();
    streams[1].error(new Error('bad multipart'));
    expect(() =>
      limiter.intercept({} as any, { handle: () => new Subject() }).subscribe(),
    ).not.toThrow();
    replacement.complete();
    streams[2].complete();
    streams[3].complete();
  });
});

describe('database file content validation', () => {
  it('accepts supported formats and strips client paths', () => {
    expect(
      validateFileContent('C:\\fakepath\\sample.pdf', '', pdf).fileName,
    ).toBe('sample.pdf');
    for (const [name, bytes] of [
      ['a.png', [137, 80, 78, 71, 13, 10, 26, 10]],
      ['a.jpg', [255, 216, 255]],
      ['a.docx', [80, 75, 3, 4]],
      ['a.xlsx', [80, 75, 3, 4]],
    ] as [string, number[]][])
      expect(() =>
        validateFileContent(name, '', Buffer.from(bytes)),
      ).not.toThrow();
  });
  it('rejects oversized, empty, unsupported, mismatched and unsafe files', () => {
    expect(() =>
      validateFileContent('a.pdf', '', Buffer.alloc(MAX_FILE_BYTES + 1)),
    ).toThrow(PayloadTooLargeException);
    expect(() => validateFileContent('a.pdf', '', Buffer.alloc(0))).toThrow(
      BadRequestException,
    );
    expect(() => validateFileContent('a.html', 'text/html', pdf)).toThrow(
      BadRequestException,
    );
    expect(() => validateFileContent('a.pdf', 'image/png', pdf)).toThrow(
      BadRequestException,
    );
    expect(() =>
      validateFileContent('a.pdf', '', Buffer.from('not a PDF')),
    ).toThrow(BadRequestException);
    expect(() => validateFileContent('a\r\n.pdf', '', pdf)).toThrow(
      BadRequestException,
    );
  });
});

describe('database file service', () => {
  let service: FileManagerService;
  let repo: any, source: any, manager: any, logs: any;
  beforeEach(() => {
    repo = { findOne: jest.fn(), save: jest.fn(), create: jest.fn() };
    manager = {
      create: jest.fn((_entity, value) => value),
      save: jest.fn(),
      query: jest.fn(),
    };
    source = {
      query: jest.fn().mockResolvedValue([{}]),
      transaction: jest.fn((callback) => callback(manager)),
    };
    logs = { logCreate: jest.fn() };
    service = new FileManagerService(repo, logs, source);
  });
  it('stores bytes, hash, metadata and audit in one transaction', async () => {
    repo.findOne.mockResolvedValue({
      provider: 'database',
      uploaded_by_id: userId,
    });
    await service.saveContent(input, userId, userId);
    expect(source.transaction).toHaveBeenCalledTimes(1);
    expect(manager.save.mock.calls[0][1]).toMatchObject({
      provider: 'database',
      file_size: pdf.length,
      entity_id: entityId,
    });
    expect(manager.query.mock.calls[0][1].slice(1)).toEqual([
      pdf,
      createHash('sha256').update(pdf).digest('hex'),
    ]);
    expect(logs.logCreate.mock.calls[0][6]).toBe(manager);
  });
  it('does not commit metadata outside the content transaction on failure', async () => {
    manager.query.mockRejectedValue(new Error('database unavailable'));
    await expect(service.saveContent(input, userId)).rejects.toThrow(
      'database unavailable',
    );
    expect(repo.save).not.toHaveBeenCalled();
    expect(logs.logCreate).not.toHaveBeenCalled();
    expect(repo.findOne).not.toHaveBeenCalled();
  });
  it('rejects missing parents even for administrators', async () => {
    source.query.mockResolvedValue([]);
    await expect(service.saveContent(input, userId)).rejects.toThrow(
      NotFoundException,
    );
    expect(source.transaction).not.toHaveBeenCalled();
  });
  it("rejects an upload to another representative's record", async () => {
    source.query.mockResolvedValueOnce([{}]).mockResolvedValueOnce([]);
    await expect(service.saveContent(input, userId, userId)).rejects.toThrow(
      NotFoundException,
    );
    expect(source.transaction).not.toHaveBeenCalled();
  });
  it('denies binary access before querying the content table', async () => {
    repo.findOne.mockResolvedValue({
      provider: 'database',
      uploaded_by_id: 'someone-else',
      entity_type: 'lead',
      entity_id: entityId,
    });
    source.query.mockResolvedValue([]);
    await expect(service.getContent(entityId, userId)).rejects.toThrow(
      NotFoundException,
    );
    expect(
      source.query.mock.calls.every(
        ([sql]) => !sql.includes('managed_file_contents'),
      ),
    ).toBe(true);
  });
  it('returns exact bytes only for visible database files', async () => {
    repo.findOne.mockResolvedValue({
      provider: 'database',
      uploaded_by_id: userId,
    });
    source.query.mockResolvedValue([{ content: pdf }]);
    expect((await service.getContent(entityId, userId)).buffer).toEqual(pdf);
    repo.findOne.mockResolvedValue({ provider: 'vercel' });
    await expect(service.getContent(entityId)).rejects.toThrow(
      NotFoundException,
    );
  });
  it('blocks metadata-only forgery and content metadata rewrites', async () => {
    await expect(
      service.create(
        { ...input, provider: 'database', file_url: 'fake' },
        userId,
      ),
    ).rejects.toThrow(BadRequestException);
    repo.findOne.mockResolvedValue({ provider: 'database' });
    await expect(
      service.update(entityId, { file_url: 'fake' }, userId),
    ).rejects.toThrow(BadRequestException);
    repo.findOne.mockResolvedValue({ provider: 'vercel' });
    await expect(
      service.update(entityId, { provider: 'database' }, userId),
    ).rejects.toThrow(BadRequestException);
  });
  it('refuses destructive schema rollback with any stored file', async () => {
    const runner = {
      query: jest.fn().mockResolvedValue([{ contents: '1', files: '1' }]),
    };
    await expect(
      new DatabaseFileContents1788000000000().down(runner as any),
    ).rejects.toThrow('Refusing');
    expect(runner.query).toHaveBeenCalledTimes(1);
  });
});

describe('multipart and download HTTP boundary', () => {
  let app: any;
  const service = {
    saveContent: jest
      .fn()
      .mockResolvedValue({ id: entityId, provider: 'database' }),
    getContent: jest.fn().mockResolvedValue({
      file: { file_name: 'test.pdf', file_type: 'application/pdf' },
      buffer: pdf,
    }),
  };
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [FileManagerController],
      providers: [{ provide: FileManagerService, useValue: service }],
    }).compile();
    app = module.createNestApplication();
    app.use((req, _res, next) => {
      req.user = { id: userId, role: 'sales_rep' };
      next();
    });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    // Reuse one bound listener across requests instead of repeatedly opening
    // ephemeral listeners (intermittent loopback timeouts on Windows).
    await app.listen(0, '127.0.0.1');
  });
  afterAll(async () => {
    await app.close();
  });
  const upload = () =>
    request(app.getHttpServer()).post('/file-manager/content');
  it('accepts one bounded file and passes rep scope', async () => {
    await upload()
      .field('entity_type', 'lead')
      .field('entity_id', entityId)
      .attach('file', pdf, 'a.pdf')
      .expect(201);
    expect(service.saveContent).toHaveBeenLastCalledWith(
      expect.objectContaining({ buffer: pdf }),
      userId,
      userId,
    );
  });
  it('accepts a file exactly at the inclusive 10 MiB limit', async () => {
    const boundary = Buffer.alloc(MAX_FILE_BYTES, 65);
    pdf.copy(boundary);
    await upload()
      .field('entity_type', 'lead')
      .field('entity_id', entityId)
      .attach('file', boundary, 'boundary.pdf')
      .expect(201);
    expect(service.saveContent).toHaveBeenLastCalledWith(
      expect.objectContaining({ buffer: boundary }),
      userId,
      userId,
    );
  });
  it('rejects invalid/missing targets, missing file and oversize', async () => {
    await upload()
      .field('entity_type', 'lead')
      .field('entity_id', 'invalid')
      .attach('file', pdf, 'a.pdf')
      .expect(400);
    await upload()
      .field('entity_type', 'lead')
      .field('entity_id', entityId)
      .expect(400);
    await upload()
      .field('entity_type', 'lead')
      .field('entity_id', entityId)
      .attach('file', Buffer.alloc(MAX_FILE_BYTES + 1), 'a.pdf')
      .expect(413);
  });
  it('forces private attachment responses and forwards scope', async () => {
    const res = await request(app.getHttpServer())
      .get(`/file-manager/${entityId}/content`)
      .expect(200);
    expect(res.headers['content-disposition']).toContain('attachment');
    expect(res.headers['cache-control']).toBe('private, no-store');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.body).toEqual(pdf);
    expect(service.getContent).toHaveBeenLastCalledWith(entityId, userId);
  });
});

describe('generated quote and invoice storage compatibility', () => {
  it.each([
    ['quote', QuotesService, 'generateAndSendQuote', 'generateQuotePdf'],
    [
      'invoice',
      InvoicesService,
      'generateAndSendInvoice',
      'generateInvoicePdf',
    ],
  ])(
    'stores the %s PDF and retains the exact email attachment without external storage',
    async (kind, serviceClass, method, generator) => {
      const instance = Object.create((serviceClass as any).prototype);
      const document = {
        [`${kind}_number`]: 'TEST-2026-001',
        client_email: 'test@example.invalid',
        client_name: 'Test',
        total: 100,
      };
      instance.findOneWithItems = jest.fn().mockResolvedValue(document);
      instance.documentGeneratorService = {
        [generator as string]: jest.fn().mockResolvedValue(pdf),
      };
      instance.fileManagerService = {
        saveContent: jest.fn().mockResolvedValue({ id: entityId }),
      };
      instance.appSettingsService = {
        getSetting: jest.fn().mockResolvedValue({ value: 'USD' }),
      };
      instance.notificationsService = {
        sendEmailWithTemplate: jest.fn().mockResolvedValue({ success: true }),
      };
      instance.logger = { log: jest.fn(), error: jest.fn() };
      await instance[method as string](entityId, userId);
      expect(instance.logger.error).not.toHaveBeenCalled();
      expect(instance.fileManagerService.saveContent).toHaveBeenCalledWith(
        {
          file_name: 'TEST-2026-001.pdf',
          buffer: pdf,
          entity_type: kind,
          entity_id: entityId,
          file_type: 'application/pdf',
        },
        userId,
      );
      expect(
        instance.notificationsService.sendEmailWithTemplate.mock.calls[0][5]
          .attachments[0].content,
      ).toBe(pdf);
    },
  );
});
