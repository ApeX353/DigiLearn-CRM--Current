import * as ExcelJS from 'exceljs';
import { LeadsXlsxImportService } from './leads-xlsx-import.service';
import {
  LeadImportBatch,
  LeadImportBatchStatus,
} from '../entities/lead-import-batch.entity';

/**
 * The import GATE (TEST-BACKLOG §2): an upload creates a PENDING batch and
 * NOTHING in the live CRM. Duplicates are flagged at upload time; leads are
 * created only when a manager approves. These tests pin that contract.
 */
describe('LeadsXlsxImportService — staged import + dedup gate', () => {
  let service: LeadsXlsxImportService;
  let leadsService: any;
  let activityLogs: any;
  let batches: any;
  let dataSource: any;
  let lastSaved: LeadImportBatch;

  beforeEach(() => {
    leadsService = { createWithSchoolAndContacts: jest.fn().mockResolvedValue({}) };
    activityLogs = { logCreate: jest.fn(), logUpdate: jest.fn() };
    batches = {
      create: jest.fn((x: any) => ({ ...x })),
      save: jest.fn((x: any) => {
        lastSaved = { id: x.id ?? 'batch-1', ...x };
        return Promise.resolve(lastSaved);
      }),
      find: jest.fn(),
      findOne: jest.fn(),
    };
    // dedup queries: schools first, then leads
    dataSource = {
      query: jest
        .fn()
        .mockResolvedValueOnce([{ id: 's1', name: 'Alpha High' }]) // existing school
        .mockResolvedValueOnce([]), // existing leads
    };
    service = new LeadsXlsxImportService(
      leadsService, activityLogs, batches, dataSource,
    );
  });

  async function xlsxBase64(dataRows: any[][]): Promise<string> {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('New schools');
    ws.addRow([
      '#', 'File sheet', 'File row', 'School', 'Contact', 'Position', 'Phone',
      'Province (file)', 'Area (file)', 'Lookup result', 'City / town (web)',
      'District (web)', 'Province (web)',
    ]);
    dataRows.forEach((r) => ws.addRow(r));
    const buf = await wb.xlsx.writeBuffer();
    return Buffer.from(buf).toString('base64');
  }

  const row = (school: string, contact: string, province: string, area = 'Urban') =>
    [0, 'X', 2, school, contact, 'Head', '0771', province, area, 'confident', 'City', 'Dist', province];

  it('stages a PENDING batch and creates NOTHING in the CRM', async () => {
    const b64 = await xlsxBase64([
      row('Alpha High', 'Moyo John', 'Bulawayo'),   // dup of existing school
      row('Beta High', 'Ncube Jane', 'Harare'),     // clean
    ]);
    const batch = await service.importFromBase64(b64, 'kim', 'sales_manager', 'f.xlsx');

    expect(leadsService.createWithSchoolAndContacts).not.toHaveBeenCalled(); // the gate
    expect(batch.status).toBe(LeadImportBatchStatus.PENDING);
    expect(batch.total_rows).toBe(2);
    expect(batch.duplicate_count).toBe(1);
    expect(batch.importable_count).toBe(1); // only Beta defaults to approve
  });

  it('flags an existing-school duplicate and defaults it to skip', async () => {
    const b64 = await xlsxBase64([
      row('Alpha High', 'Moyo John', 'Bulawayo'),
      row('Beta High', 'Ncube Jane', 'Harare'),
    ]);
    await service.importFromBase64(b64, 'kim', 'sales_manager');
    const alpha = lastSaved.rows.find((r) => r.schoolName === 'Alpha High')!;
    const beta = lastSaved.rows.find((r) => r.schoolName === 'Beta High')!;
    expect(alpha.duplicate?.kind).toBe('existing-school');
    expect(alpha.decision).toBe('skip');
    expect(beta.duplicate).toBeUndefined();
    expect(beta.decision).toBe('approve');
  });

  it('flags a within-batch duplicate (same name twice in the file)', async () => {
    const b64 = await xlsxBase64([
      row('Gamma High', 'A B', 'Harare'),
      row('Gamma High', 'C D', 'Harare'), // same name again
    ]);
    await service.importFromBase64(b64, 'kim', 'sales_manager');
    const dups = lastSaved.rows.filter((r) => r.duplicate);
    expect(dups).toHaveLength(1);
    expect(dups[0].duplicate?.kind).toBe('within-batch');
  });

  it('marks a row with an unrecognised province as invalid (never approvable)', async () => {
    dataSource.query = jest.fn().mockResolvedValue([]);
    const b64 = await xlsxBase64([row('Delta High', 'E F', 'Atlantis')]);
    await service.importFromBase64(b64, 'kim', 'sales_manager');
    const r = lastSaved.rows[0];
    expect(r.status).toBe('invalid');
    expect(r.decision).toBe('skip');
  });

  it('approveBatch creates leads ONLY for approved rows, then marks approved', async () => {
    batches.findOne.mockResolvedValue({
      id: 'b1', status: LeadImportBatchStatus.PENDING, campaign_id: null,
      total_rows: 2, rows: [
        { rowNumber: 2, schoolName: 'Beta High', contactFirst: 'J', contactLast: 'N', province: 'Harare', region: 'urban', role: 'Head', status: 'importable', decision: 'approve' },
        { rowNumber: 3, schoolName: 'Alpha High', contactFirst: 'M', contactLast: 'J', province: 'Bulawayo', region: 'urban', role: 'Head', status: 'importable', decision: 'skip' },
      ],
    });
    const res = await service.approveBatch('b1', 'kim', 'sales_manager');
    expect(leadsService.createWithSchoolAndContacts).toHaveBeenCalledTimes(1); // only Beta
    expect(res.status).toBe(LeadImportBatchStatus.APPROVED);
    expect(res.created_count).toBe(1);
  });

  it('rejectBatch creates nothing and marks rejected', async () => {
    batches.findOne.mockResolvedValue({
      id: 'b2', status: LeadImportBatchStatus.PENDING, total_rows: 3, rows: [],
    });
    const res = await service.rejectBatch('b2', 'kim');
    expect(leadsService.createWithSchoolAndContacts).not.toHaveBeenCalled();
    expect(res.status).toBe(LeadImportBatchStatus.REJECTED);
  });

  it('a decided batch cannot be approved again', async () => {
    batches.findOne.mockResolvedValue({
      id: 'b3', status: LeadImportBatchStatus.APPROVED, rows: [],
    });
    await expect(service.approveBatch('b3', 'kim', 'sales_manager')).rejects.toThrow();
  });
});
