import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import * as ExcelJS from 'exceljs';
import { LeadsService } from '../leads.service';
import { ActivityLogsService } from '../../activity-logs/activity-logs.service';
import { PROVINCES } from '../../schools/constants/provinces';
import type { LeadSource } from '../constants/lead-source';
import type { ContactRole } from '../../contacts/constants';
import {
  LeadImportBatch,
  LeadImportBatchStatus,
  PendingImportRow,
} from '../entities/lead-import-batch.entity';

export interface LeadImportRowResult {
  row: number;
  school: string;
  status: 'created' | 'skipped' | 'failed';
  reason?: string;
}

export interface LeadImportSummary {
  created: number;
  skipped: number;
  failed: number;
  total: number;
  rows: LeadImportRowResult[];
}

/**
 * Server-side bulk lead import from an Excel (.xlsx) file, parsed with the
 * exceljs already in the stack (no browser loop, no per-row API storm —
 * fixes CSV4). The manager uploads the workbook as base64; we decode,
 * parse the "new schools" sheet, and create a school + head contact +
 * unassigned New lead per row via the same transactional path the app
 * uses for a single lead. The whole import is logged with its count.
 */
@Injectable()
export class LeadsXlsxImportService {
  private readonly logger = new Logger(LeadsXlsxImportService.name);

  // Canonical province by normalized key; also maps the alternate
  // "Matabeleland" spelling the source files use onto the CRM's
  // "Matebeleland".
  private readonly provinceByKey = new Map<string, string>(
    PROVINCES.map((p) => [this.normKey(p), p]),
  );

  constructor(
    private readonly leadsService: LeadsService,
    private readonly activityLogs: ActivityLogsService,
    @InjectRepository(LeadImportBatch)
    private readonly batches: Repository<LeadImportBatch>,
    private readonly dataSource: DataSource,
  ) {}

  private normKey(s: string): string {
    return s
      .toLowerCase()
      // Expand the abbreviations the source files use before matching:
      // "Mash East" → Mashonaland East, "Mat South" → Matebeleland South.
      .replace(/\bmash\b/g, 'mashonaland')
      .replace(/\bmat\b/g, 'matebeleland')
      .replace(/matabeleland/g, 'matebeleland')
      .replace(/[^a-z]/g, '');
  }

  private titleCase(s: string): string {
    return s
      .toLowerCase()
      .replace(/\b\w/g, (c) => c.toUpperCase())
      .trim();
  }

  private toProvince(raw?: string): string | null {
    if (!raw) return null;
    return this.provinceByKey.get(this.normKey(raw)) ?? null;
  }

  private toRegion(raw?: string): 'urban' | 'rural' | null {
    const v = (raw ?? '').trim().toLowerCase();
    if (v.includes('peri')) return null; // peri-urban not accepted
    if (v.startsWith('urban')) return 'urban';
    if (v.startsWith('rural')) return 'rural';
    return null;
  }

  private toRole(raw?: string): ContactRole {
    const v = (raw ?? '').trim().toLowerCase();
    if (v.includes('head') && v.includes('deput')) return 'Deputy Head';
    if (v.includes('head')) return 'Head';
    if (v.includes('bursar')) return 'Bursar';
    if (v.includes('ict')) return 'ICT Coordinator';
    if (v.includes('teacher')) return 'Teacher';
    if (v.includes('admin')) return 'Administrator';
    return 'Other';
  }

  /** Names in the file are "SURNAME First" (surname first). */
  private splitContact(raw?: string): { first: string; last: string } | null {
    const cleaned = (raw ?? '').trim().replace(/\s+/g, ' ');
    if (!cleaned) return null;
    const parts = cleaned.split(' ');
    const last = this.titleCase(parts[0]);
    const first = this.titleCase(parts.slice(1).join(' ') || parts[0]);
    return { first, last };
  }

  /**
   * Stage an import for approval — DOES NOT create any leads. Parses the
   * workbook, dedup-checks every row, and saves a PENDING LeadImportBatch. A
   * manager reviews and approves before anything hits the CRM (TEST-BACKLOG
   * §2). If `campaignId` is set (import run from inside a campaign), every
   * lead created on approval is attributed to it.
   */
  async importFromBase64(
    base64: string,
    userId: string,
    _userRole: string | undefined,
    filename?: string,
    campaignId?: string | null,
  ): Promise<LeadImportBatch> {
    const raw = base64.replace(/^data:[^;]*;base64,/, '');
    let buffer: Buffer;
    try {
      buffer = Buffer.from(raw, 'base64');
    } catch {
      throw new BadRequestException('The uploaded file could not be read');
    }

    const wb = new ExcelJS.Workbook();
    try {
      // exceljs types want a plain Buffer; Buffer.from's generic differs.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await wb.xlsx.load(buffer as any);
    } catch {
      throw new BadRequestException('That file is not a readable Excel workbook');
    }

    // Pick the sheet that actually has a "School" column (not "Summary").
    let ws: ExcelJS.Worksheet | undefined;
    let cols: Record<string, number> = {};
    wb.eachSheet((sheet) => {
      if (ws) return;
      const idx = this.columnIndex(sheet);
      if (idx.school) {
        ws = sheet;
        cols = idx;
      }
    });
    if (!ws || !cols.school) {
      throw new BadRequestException(
        'No sheet with a "School" column was found in the workbook',
      );
    }

    const cell = (row: ExcelJS.Row, col?: number): string =>
      col ? String(row.getCell(col).value ?? '').trim() : '';

    // 1) Parse every row into a staged row — no DB writes.
    const parsed: PendingImportRow[] = [];
    for (let r = 2; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const schoolName = cell(row, cols.school);
      if (!schoolName) continue; // blank row

      const provinceRaw =
        cell(row, cols.provinceWeb) || cell(row, cols.provinceFile);
      const province = this.toProvince(provinceRaw);
      const region = this.toRegion(cell(row, cols.area));
      const contact = this.splitContact(cell(row, cols.contact));

      let status: 'importable' | 'invalid' = 'importable';
      let invalidReason: string | undefined;
      if (!province) {
        status = 'invalid';
        invalidReason = `province "${provinceRaw}" not recognised`;
      } else if (!region) {
        status = 'invalid';
        invalidReason = `area "${cell(row, cols.area)}" is not urban/rural`;
      } else if (!contact) {
        status = 'invalid';
        invalidReason = 'no contact name';
      }

      parsed.push({
        rowNumber: r,
        schoolName: this.titleCase(schoolName),
        contactFirst: contact?.first ?? '',
        contactLast: contact?.last ?? '',
        province,
        region,
        city: cell(row, cols.city) || undefined,
        district: cell(row, cols.district) || undefined,
        phone: cell(row, cols.phone) || undefined,
        role: this.toRole(cell(row, cols.position)),
        status,
        invalidReason,
        decision: 'approve', // provisional; finalised below
      });
    }

    // 2) Dedup-check against existing schools/leads and within the batch.
    await this.flagDuplicates(parsed);

    // 3) Default decision: skip anything invalid or duplicated, else approve.
    for (const row of parsed) {
      row.decision =
        row.status === 'invalid' || row.duplicate ? 'skip' : 'approve';
    }

    const importable = parsed.filter((r) => r.decision === 'approve').length;
    const duplicates = parsed.filter((r) => r.duplicate).length;

    // 4) Save the PENDING batch — still nothing in the live CRM.
    const batch = await this.batches.save(
      this.batches.create({
        filename: filename ?? null,
        uploaded_by_id: userId,
        campaign_id: campaignId ?? null,
        status: LeadImportBatchStatus.PENDING,
        rows: parsed,
        total_rows: parsed.length,
        importable_count: importable,
        duplicate_count: duplicates,
      }),
    );

    try {
      await this.activityLogs.logCreate(
        'LeadImportBatch',
        batch.id,
        {
          total: parsed.length,
          importable,
          duplicates,
          filename: filename ?? null,
        },
        userId,
        `Staged ${parsed.length} row(s) for approval (${duplicates} possible duplicate(s)) from ${filename ?? 'an Excel file'}`,
      );
    } catch {
      // A logging failure must not fail the import.
    }

    this.logger.log(
      `xlsx import staged: batch ${batch.id}, ${parsed.length} rows, ${importable} to import, ${duplicates} dupes (by ${userId})`,
    );
    return batch;
  }

  /**
   * Stamp `duplicate` on any row that collides with an existing school, an
   * existing lead, or an earlier row in the same batch (name match, ignoring
   * case/punctuation). An existing match wins over a within-batch one.
   */
  private async flagDuplicates(rows: PendingImportRow[]): Promise<void> {
    const norm = (s: string): string =>
      s.toUpperCase().replace(/[^A-Z0-9]/g, '');

    const schoolRows: { id: string; name: string }[] =
      await this.dataSource.query(
        `SELECT id, name FROM schools WHERE deleted_at IS NULL`,
      );
    const leadRows: { id: string; lead_name: string }[] =
      await this.dataSource.query(
        `SELECT id, lead_name FROM leads WHERE deleted_at IS NULL`,
      );

    const schoolByName = new Map<string, string>();
    for (const s of schoolRows) schoolByName.set(norm(s.name), s.id);
    const leadByName = new Map<string, string>();
    for (const l of leadRows) leadByName.set(norm(l.lead_name), l.id);

    const seenInBatch = new Set<string>();
    for (const row of rows) {
      const key = norm(row.schoolName);
      if (schoolByName.has(key)) {
        row.duplicate = {
          kind: 'existing-school',
          name: row.schoolName,
          id: schoolByName.get(key),
        };
      } else if (leadByName.has(key)) {
        row.duplicate = {
          kind: 'existing-lead',
          name: row.schoolName,
          id: leadByName.get(key),
        };
      } else if (seenInBatch.has(key)) {
        row.duplicate = { kind: 'within-batch', name: row.schoolName };
      } else {
        seenInBatch.add(key);
      }
    }
  }

  /** Pending batches for the approval queue (newest first), rows omitted. */
  async listPending(): Promise<Partial<LeadImportBatch>[]> {
    const batches = await this.batches.find({
      where: { status: LeadImportBatchStatus.PENDING },
      order: { created_at: 'DESC' },
      relations: ['uploaded_by', 'campaign'],
    });
    return batches.map(({ rows: _rows, ...rest }) => rest);
  }

  async getBatch(id: string): Promise<LeadImportBatch> {
    const batch = await this.batches.findOne({
      where: { id },
      relations: ['uploaded_by', 'campaign', 'decided_by'],
    });
    if (!batch) throw new NotFoundException('Import batch not found');
    return batch;
  }

  /** Override per-row approve/skip before approving (e.g. keep a flagged dup). */
  async updateDecisions(
    id: string,
    decisions: { rowNumber: number; decision: 'approve' | 'skip' }[],
  ): Promise<LeadImportBatch> {
    const batch = await this.getBatch(id);
    if (batch.status !== LeadImportBatchStatus.PENDING) {
      throw new BadRequestException('This batch has already been decided');
    }
    const byRow = new Map(decisions.map((d) => [d.rowNumber, d.decision]));
    for (const row of batch.rows) {
      const d = byRow.get(row.rowNumber);
      if (!d) continue;
      // An invalid row can never be approved — missing fields to make a lead.
      row.decision = d === 'approve' && row.status === 'invalid' ? 'skip' : d;
    }
    batch.importable_count = batch.rows.filter(
      (r) => r.decision === 'approve',
    ).length;
    return this.batches.save(batch);
  }

  /**
   * Approve the batch: create a real school + head contact + New lead for
   * every row marked 'approve'. Only now does anything hit the CRM. Skipped,
   * invalid and duplicate rows are left out. Idempotent by status — a decided
   * batch cannot be approved twice.
   */
  async approveBatch(
    id: string,
    userId: string,
    userRole: string | undefined,
  ): Promise<LeadImportBatch> {
    const batch = await this.getBatch(id);
    if (batch.status !== LeadImportBatchStatus.PENDING) {
      throw new BadRequestException('This batch has already been decided');
    }

    let created = 0;
    let failed = 0;
    for (const row of batch.rows) {
      if (row.decision !== 'approve' || row.status !== 'importable') continue;
      try {
        await this.leadsService.createWithSchoolAndContacts(
          {
            lead: {
              name: row.schoolName,
              school_name: row.schoolName,
              source: 'Other' as LeadSource,
              province: row.province as never,
              region: row.region as never,
              city: row.city,
              district: row.district,
              ...(batch.campaign_id
                ? { source_campaign_id: batch.campaign_id }
                : {}),
            },
            contacts: [
              {
                first_name: row.contactFirst,
                last_name: row.contactLast,
                phone: row.phone,
                role: row.role as never,
                is_primary: true,
              } as never,
            ],
          } as never,
          userId,
          userRole,
          { bulkImport: true },
        );
        created++;
      } catch {
        failed++;
      }
    }

    batch.status = LeadImportBatchStatus.APPROVED;
    batch.decided_at = new Date();
    batch.decided_by_id = userId;
    batch.created_count = created;
    await this.batches.save(batch);

    try {
      await this.activityLogs.logUpdate(
        'LeadImportBatch',
        batch.id,
        {},
        { created, failed },
        userId,
        `Approved import batch — created ${created} lead(s)${failed ? `, ${failed} failed` : ''}`,
      );
    } catch {
      /* ignore */
    }
    this.logger.log(
      `import batch ${batch.id} approved: created ${created}, failed ${failed}`,
    );
    return batch;
  }

  /** Discard the batch — nothing is created. */
  async rejectBatch(id: string, userId: string): Promise<LeadImportBatch> {
    const batch = await this.getBatch(id);
    if (batch.status !== LeadImportBatchStatus.PENDING) {
      throw new BadRequestException('This batch has already been decided');
    }
    batch.status = LeadImportBatchStatus.REJECTED;
    batch.decided_at = new Date();
    batch.decided_by_id = userId;
    await this.batches.save(batch);
    try {
      await this.activityLogs.logUpdate(
        'LeadImportBatch',
        batch.id,
        {},
        { rejected: true },
        userId,
        `Rejected import batch — ${batch.total_rows} row(s) discarded, nothing created`,
      );
    } catch {
      /* ignore */
    }
    this.logger.log(`import batch ${batch.id} rejected by ${userId}`);
    return batch;
  }

  private columnIndex(sheet: ExcelJS.Worksheet): Record<string, number> {
    const idx: Record<string, number> = {};
    const header = sheet.getRow(1);
    header.eachCell({ includeEmpty: true }, (c, i) => {
      const key = String(c.value ?? '')
        .toLowerCase()
        .replace(/[^a-z]/g, '');
      if (key === 'school') idx.school = i;
      else if (key === 'contact') idx.contact = i;
      else if (key === 'position') idx.position = i;
      else if (key === 'phone') idx.phone = i;
      else if (key === 'provinceweb') idx.provinceWeb = i;
      else if (key === 'provincefile') idx.provinceFile = i;
      else if (key === 'areafile' || key === 'area') idx.area = i;
      else if (key === 'citytownweb' || key === 'city') idx.city = i;
      else if (key === 'districtweb' || key === 'district') idx.district = i;
    });
    return idx;
  }
}
