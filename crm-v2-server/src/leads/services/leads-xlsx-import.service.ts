import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { LeadsService } from '../leads.service';
import { ActivityLogsService } from '../../activity-logs/activity-logs.service';
import { PROVINCES } from '../../schools/constants/provinces';
import type { LeadSource } from '../constants/lead-source';
import type { ContactRole } from '../../contacts/constants';

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

  async importFromBase64(
    base64: string,
    userId: string,
    userRole: string | undefined,
    filename?: string,
  ): Promise<LeadImportSummary> {
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

    const rows: LeadImportRowResult[] = [];
    let created = 0;
    let skipped = 0;
    let failed = 0;

    const cell = (row: ExcelJS.Row, col?: number): string =>
      col ? String(row.getCell(col).value ?? '').trim() : '';

    for (let r = 2; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const schoolName = cell(row, cols.school);
      if (!schoolName) continue; // blank row

      const provinceRaw = cell(row, cols.provinceWeb) || cell(row, cols.provinceFile);
      const province = this.toProvince(provinceRaw);
      const region = this.toRegion(cell(row, cols.area));
      const contact = this.splitContact(cell(row, cols.contact));

      if (!province) {
        skipped++;
        rows.push({ row: r, school: schoolName, status: 'skipped', reason: `province "${provinceRaw}" not recognised` });
        continue;
      }
      if (!region) {
        skipped++;
        rows.push({ row: r, school: schoolName, status: 'skipped', reason: `area "${cell(row, cols.area)}" is not urban/rural` });
        continue;
      }
      if (!contact) {
        skipped++;
        rows.push({ row: r, school: schoolName, status: 'skipped', reason: 'no contact name' });
        continue;
      }

      const niceName = this.titleCase(schoolName);
      const city = cell(row, cols.city) || undefined;
      const district = cell(row, cols.district) || undefined;
      const phone = cell(row, cols.phone) || undefined;

      try {
        await this.leadsService.createWithSchoolAndContacts(
          {
            lead: {
              // The lead's title. Manager is fine with it matching the
              // school (LNAME1). Source defaults to Other — the file's
              // Source column is a provenance URL, not a channel.
              name: niceName,
              school_name: niceName,
              source: 'Other' as LeadSource,
              province: province as never,
              region: region as never,
              city,
              district,
            },
            contacts: [
              {
                first_name: contact.first,
                last_name: contact.last,
                phone,
                role: this.toRole(cell(row, cols.position)) as never,
                is_primary: true,
              } as never,
            ],
          } as never,
          userId,
          userRole,
          { bulkImport: true },
        );
        created++;
        rows.push({ row: r, school: niceName, status: 'created' });
      } catch (e: any) {
        failed++;
        rows.push({ row: r, school: niceName, status: 'failed', reason: e?.message ?? 'creation failed' });
      }
    }

    // Log the whole import with its count and who ran it.
    try {
      await this.activityLogs.logCreate(
        'LeadImport',
        `import-${userId}`,
        { created, skipped, failed, filename: filename ?? null },
        userId,
        `Imported ${created} lead${created === 1 ? '' : 's'} from ${filename ?? 'an Excel file'}`,
      );
    } catch {
      // A logging failure must not fail the import.
    }

    this.logger.log(
      `xlsx import: created ${created}, skipped ${skipped}, failed ${failed} (by ${userId})`,
    );
    return { created, skipped, failed, total: created + skipped + failed, rows };
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
