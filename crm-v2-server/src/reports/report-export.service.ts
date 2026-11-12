import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Deal } from '../deals/entities/deal.entity';
import { Lead } from '../leads/entities/lead.entity';
import { Stage } from '../pipelines/entities/stage.entity';
import { Invoice } from '../invoices/entities/invoice.entity';
import { User } from '../users/entities/user.entity';
import PDFDocument from 'pdfkit';
import * as ExcelJS from 'exceljs';

export type DateRange = 'mtd' | 'qtd' | 'ytd';

@Injectable()
export class ReportExportService {
  constructor(
    @InjectRepository(Deal)
    private readonly dealRepository: Repository<Deal>,
    @InjectRepository(Lead)
    private readonly leadRepository: Repository<Lead>,
    @InjectRepository(Stage)
    private readonly stageRepository: Repository<Stage>,
    @InjectRepository(Invoice)
    private readonly invoiceRepository: Repository<Invoice>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly dataSource: DataSource,
  ) {}

  private getDateRange(range: DateRange): { start: Date; end: Date } {
    const now = new Date();
    const end = new Date(now);
    let start: Date;

    switch (range) {
      case 'mtd':
        start = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case 'qtd':
        const quarter = Math.floor(now.getMonth() / 3);
        start = new Date(now.getFullYear(), quarter * 3, 1);
        break;
      case 'ytd':
        start = new Date(now.getFullYear(), 0, 1);
        break;
      default:
        start = new Date(now.getFullYear(), now.getMonth(), 1);
    }

    return { start, end };
  }

  // ========================
  // SALES REPORT
  // ========================

  async generateSalesReport(
    format: 'pdf' | 'xlsx',
    dateRange: DateRange = 'mtd',
  ): Promise<Buffer> {
    const { start, end } = this.getDateRange(dateRange);

    // Get deals data
    const deals = await this.dealRepository
      .createQueryBuilder('deal')
      .leftJoinAndSelect('deal.assigned_user', 'assignee')
      .leftJoinAndSelect('deal.current_stage', 'stage')
      .where('deal.created_at BETWEEN :start AND :end', { start, end })
      .getMany();

    const wonDeals = deals.filter((d) => d.closeStatus === 'won');
    const lostDeals = deals.filter((d) => d.closeStatus === 'lost');
    const totalValue = deals.reduce((sum, d) => sum + Number(d.value || 0), 0);
    const wonValue = wonDeals.reduce(
      (sum, d) => sum + Number(d.value || 0),
      0,
    );
    const conversionRate =
      deals.length > 0 ? ((wonDeals.length / deals.length) * 100).toFixed(1) : '0';

    // Rep breakdown
    const repMap = new Map<string, { name: string; deals: number; won: number; value: number }>();
    for (const deal of deals) {
      const repName = deal.assigned_user
        ? `${deal.assigned_user.first_name} ${deal.assigned_user.last_name}`
        : 'Unassigned';
      const repId = deal.assigned_to || 'unassigned';
      if (!repMap.has(repId)) {
        repMap.set(repId, { name: repName, deals: 0, won: 0, value: 0 });
      }
      const rep = repMap.get(repId)!;
      rep.deals++;
      rep.value += Number(deal.value || 0);
      if (deal.closeStatus === 'won') rep.won++;
    }

    const reportData = {
      dateRange: `${start.toLocaleDateString()} - ${end.toLocaleDateString()}`,
      totalDeals: deals.length,
      wonDeals: wonDeals.length,
      lostDeals: lostDeals.length,
      totalValue,
      wonValue,
      conversionRate,
      reps: Array.from(repMap.values()),
    };

    if (format === 'pdf') {
      return this.generateSalesPdf(reportData);
    }
    return this.generateSalesXlsx(reportData);
  }

  private async generateSalesPdf(data: any): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50 });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Header
      doc.fontSize(20).fillColor('#1a73e8').text('Sales Performance Report', { align: 'center' });
      doc.moveDown(0.5);
      doc.fontSize(10).fillColor('#666').text(`Period: ${data.dateRange}`, { align: 'center' });
      doc.moveDown();
      doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke('#ddd');
      doc.moveDown();

      // KPIs
      doc.fontSize(14).fillColor('#333').text('Key Metrics');
      doc.moveDown(0.5);
      doc.fontSize(10).fillColor('#333');
      doc.text(`Total Deals: ${data.totalDeals}`);
      doc.text(`Won Deals: ${data.wonDeals}`);
      doc.text(`Lost Deals: ${data.lostDeals}`);
      doc.text(`Total Pipeline Value: $${data.totalValue.toLocaleString()}`);
      doc.text(`Won Value: $${data.wonValue.toLocaleString()}`);
      doc.text(`Conversion Rate: ${data.conversionRate}%`);
      doc.moveDown();

      // Rep breakdown table
      doc.fontSize(14).fillColor('#333').text('Sales Rep Breakdown');
      doc.moveDown(0.5);

      const tableTop = doc.y;
      const headers = ['Rep Name', 'Total Deals', 'Won', 'Value ($)'];
      const colWidths = [200, 80, 80, 130];
      let x = 50;

      // Header row
      doc.fontSize(9).fillColor('#fff');
      doc.rect(50, tableTop, 495, 20).fill('#1a73e8');
      x = 50;
      headers.forEach((h, i) => {
        doc.fillColor('#fff').text(h, x + 5, tableTop + 5, { width: colWidths[i] - 10 });
        x += colWidths[i];
      });

      // Data rows
      let y = tableTop + 20;
      data.reps.forEach((rep: any, idx: number) => {
        const bg = idx % 2 === 0 ? '#f8f9fa' : '#fff';
        doc.rect(50, y, 495, 18).fill(bg);
        x = 50;
        doc.fontSize(9).fillColor('#333');
        doc.text(rep.name, x + 5, y + 4, { width: colWidths[0] - 10 });
        x += colWidths[0];
        doc.text(String(rep.deals), x + 5, y + 4, { width: colWidths[1] - 10 });
        x += colWidths[1];
        doc.text(String(rep.won), x + 5, y + 4, { width: colWidths[2] - 10 });
        x += colWidths[2];
        doc.text(`$${rep.value.toLocaleString()}`, x + 5, y + 4, { width: colWidths[3] - 10 });
        y += 18;
      });

      // Footer
      doc.moveDown(2);
      doc.fontSize(8).fillColor('#999').text(`Generated on ${new Date().toLocaleString()} by DigiLearn CRM`, { align: 'center' });

      doc.end();
    });
  }

  private async generateSalesXlsx(data: any): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'DigiLearn CRM';

    const sheet = workbook.addWorksheet('Sales Report');

    // Title
    sheet.mergeCells('A1:D1');
    const titleCell = sheet.getCell('A1');
    titleCell.value = 'Sales Performance Report';
    titleCell.font = { size: 16, bold: true, color: { argb: '1a73e8' } };

    sheet.mergeCells('A2:D2');
    sheet.getCell('A2').value = `Period: ${data.dateRange}`;

    // KPIs
    sheet.addRow([]);
    sheet.addRow(['Key Metrics']);
    sheet.addRow(['Total Deals', data.totalDeals]);
    sheet.addRow(['Won Deals', data.wonDeals]);
    sheet.addRow(['Lost Deals', data.lostDeals]);
    sheet.addRow(['Total Pipeline Value', data.totalValue]);
    sheet.addRow(['Won Value', data.wonValue]);
    sheet.addRow(['Conversion Rate', `${data.conversionRate}%`]);

    sheet.addRow([]);
    sheet.addRow([]);

    // Rep table
    const headerRow = sheet.addRow(['Rep Name', 'Total Deals', 'Won', 'Value ($)']);
    headerRow.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '1a73e8' } };
      cell.font = { color: { argb: 'FFFFFF' }, bold: true };
    });

    for (const rep of data.reps) {
      sheet.addRow([rep.name, rep.deals, rep.won, rep.value]);
    }

    // Column widths
    sheet.columns = [
      { width: 30 },
      { width: 15 },
      { width: 10 },
      { width: 20 },
    ];

    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  // ========================
  // PIPELINE REPORT
  // ========================

  async generatePipelineReport(format: 'pdf' | 'xlsx'): Promise<Buffer> {
    const deals = await this.dealRepository
      .createQueryBuilder('deal')
      .leftJoinAndSelect('deal.current_stage', 'stage')
      .leftJoinAndSelect('deal.assigned_user', 'assignee')
      .leftJoinAndSelect('deal.school', 'school')
      .where('deal.close_status = :status', { status: 'ongoing' })
      .orderBy('stage.order', 'ASC')
      .addOrderBy('deal.value', 'DESC')
      .getMany();

    // Stage breakdown
    const stageMap = new Map<string, { name: string; count: number; value: number; deals: any[] }>();
    for (const deal of deals) {
      const stageName = deal.current_stage?.name || 'Unknown';
      const stageId = deal.current_stage_id || 'unknown';
      if (!stageMap.has(stageId)) {
        stageMap.set(stageId, { name: stageName, count: 0, value: 0, deals: [] });
      }
      const stage = stageMap.get(stageId)!;
      stage.count++;
      stage.value += Number(deal.value || 0);
      stage.deals.push({
        title: deal.title,
        value: Number(deal.value || 0),
        assignee: deal.assigned_user
          ? `${deal.assigned_user.first_name} ${deal.assigned_user.last_name}`
          : 'Unassigned',
        school: deal.school?.name || 'N/A',
        healthScore: deal.healthScore || 0,
      });
    }

    const reportData = {
      totalDeals: deals.length,
      totalValue: deals.reduce((sum, d) => sum + Number(d.value || 0), 0),
      stages: Array.from(stageMap.values()),
    };

    if (format === 'pdf') {
      return this.generatePipelinePdf(reportData);
    }
    return this.generatePipelineXlsx(reportData);
  }

  private async generatePipelinePdf(data: any): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50 });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      doc.fontSize(20).fillColor('#1a73e8').text('Pipeline Report', { align: 'center' });
      doc.moveDown(0.5);
      doc.fontSize(10).fillColor('#666').text(`Total Active Deals: ${data.totalDeals} | Total Value: $${data.totalValue.toLocaleString()}`, { align: 'center' });
      doc.moveDown();
      doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke('#ddd');
      doc.moveDown();

      for (const stage of data.stages) {
        doc.fontSize(13).fillColor('#1a73e8').text(`${stage.name} (${stage.count} deals - $${stage.value.toLocaleString()})`);
        doc.moveDown(0.3);

        const tableTop = doc.y;
        const headers = ['Deal', 'Value', 'Assignee', 'School', 'Health'];
        const colWidths = [140, 70, 100, 120, 60];
        let x = 50;

        doc.rect(50, tableTop, 495, 18).fill('#1a73e8');
        headers.forEach((h, i) => {
          doc.fontSize(8).fillColor('#fff').text(h, x + 3, tableTop + 4, { width: colWidths[i] - 6 });
          x += colWidths[i];
        });

        let y = tableTop + 18;
        for (const deal of stage.deals.slice(0, 10)) {
          if (y > 700) {
            doc.addPage();
            y = 50;
          }
          const bg = stage.deals.indexOf(deal) % 2 === 0 ? '#f8f9fa' : '#fff';
          doc.rect(50, y, 495, 16).fill(bg);
          x = 50;
          doc.fontSize(8).fillColor('#333');
          doc.text(deal.title, x + 3, y + 3, { width: colWidths[0] - 6 });
          x += colWidths[0];
          doc.text(`$${deal.value.toLocaleString()}`, x + 3, y + 3, { width: colWidths[1] - 6 });
          x += colWidths[1];
          doc.text(deal.assignee, x + 3, y + 3, { width: colWidths[2] - 6 });
          x += colWidths[2];
          doc.text(deal.school, x + 3, y + 3, { width: colWidths[3] - 6 });
          x += colWidths[3];
          doc.text(`${deal.healthScore}%`, x + 3, y + 3, { width: colWidths[4] - 6 });
          y += 16;
        }

        doc.y = y + 10;
        doc.moveDown(0.5);
      }

      doc.fontSize(8).fillColor('#999').text(`Generated on ${new Date().toLocaleString()} by DigiLearn CRM`, { align: 'center' });
      doc.end();
    });
  }

  private async generatePipelineXlsx(data: any): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'DigiLearn CRM';

    const sheet = workbook.addWorksheet('Pipeline Report');

    sheet.mergeCells('A1:E1');
    sheet.getCell('A1').value = 'Pipeline Report';
    sheet.getCell('A1').font = { size: 16, bold: true, color: { argb: '1a73e8' } };

    sheet.addRow([`Total Active Deals: ${data.totalDeals} | Total Value: $${data.totalValue.toLocaleString()}`]);
    sheet.addRow([]);

    for (const stage of data.stages) {
      const stageRow = sheet.addRow([`${stage.name} (${stage.count} deals - $${stage.value.toLocaleString()})`]);
      stageRow.font = { bold: true, size: 12 };

      const headerRow = sheet.addRow(['Deal', 'Value ($)', 'Assignee', 'School', 'Health Score']);
      headerRow.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '1a73e8' } };
        cell.font = { color: { argb: 'FFFFFF' }, bold: true };
      });

      for (const deal of stage.deals) {
        sheet.addRow([deal.title, deal.value, deal.assignee, deal.school, deal.healthScore]);
      }

      sheet.addRow([]);
    }

    sheet.columns = [
      { width: 30 },
      { width: 15 },
      { width: 20 },
      { width: 25 },
      { width: 15 },
    ];

    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  // ========================
  // COLLECTIONS REPORT
  // ========================

  async generateCollectionsReport(
    format: 'pdf' | 'xlsx',
    asOfDate?: string,
  ): Promise<Buffer> {
    const referenceDate = asOfDate ? new Date(asOfDate) : new Date();

    // Get all invoices with unpaid balance
    const invoices = await this.invoiceRepository
      .createQueryBuilder('inv')
      .leftJoinAndSelect('inv.school', 'school')
      .leftJoinAndSelect('inv.deal', 'deal')
      .where('inv.payment_status IN (:...statuses)', {
        statuses: ['Unpaid', 'Partial'],
      })
      .orderBy('inv.due_date', 'ASC')
      .getMany();

    // Classify by aging bucket
    const buckets = {
      current: [] as any[],
      '1-30': [] as any[],
      '31-60': [] as any[],
      '61-90': [] as any[],
      '90+': [] as any[],
    };

    for (const inv of invoices) {
      if (!inv.due_date) continue;
      const outstanding = Number(inv.total || 0) - Number(inv.amount_paid || 0);
      if (outstanding <= 0) continue;

      const dueDate = new Date(inv.due_date);
      const daysPast = Math.floor(
        (referenceDate.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24),
      );

      const item = {
        invoiceNumber: inv.invoice_number,
        school: inv.school?.name || 'N/A',
        amount: outstanding,
        dueDate: dueDate.toLocaleDateString(),
        daysOverdue: Math.max(0, daysPast),
      };

      if (daysPast <= 0) buckets.current.push(item);
      else if (daysPast <= 30) buckets['1-30'].push(item);
      else if (daysPast <= 60) buckets['31-60'].push(item);
      else if (daysPast <= 90) buckets['61-90'].push(item);
      else buckets['90+'].push(item);
    }

    const totals = Object.fromEntries(
      Object.entries(buckets).map(([key, items]) => [
        key,
        items.reduce((sum, i) => sum + i.amount, 0),
      ]),
    );

    const reportData = {
      asOfDate: referenceDate.toLocaleDateString(),
      buckets,
      totals,
      grandTotal: Object.values(totals).reduce((sum, v) => sum + v, 0),
    };

    if (format === 'pdf') {
      return this.generateCollectionsPdf(reportData);
    }
    return this.generateCollectionsXlsx(reportData);
  }

  private async generateCollectionsPdf(data: any): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50 });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      doc.fontSize(20).fillColor('#1a73e8').text('Collections Aging Report', { align: 'center' });
      doc.moveDown(0.5);
      doc.fontSize(10).fillColor('#666').text(`As of: ${data.asOfDate}`, { align: 'center' });
      doc.moveDown();
      doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke('#ddd');
      doc.moveDown();

      // Summary table
      doc.fontSize(14).fillColor('#333').text('Aging Summary');
      doc.moveDown(0.5);

      const summaryHeaders = ['Current', '1-30 Days', '31-60 Days', '61-90 Days', '90+ Days', 'Total'];
      const summaryValues = [
        data.totals.current,
        data.totals['1-30'],
        data.totals['31-60'],
        data.totals['61-90'],
        data.totals['90+'],
        data.grandTotal,
      ];

      const y = doc.y;
      const colW = 82;
      let x = 50;

      doc.rect(50, y, colW * 6, 18).fill('#1a73e8');
      summaryHeaders.forEach((h, i) => {
        doc.fontSize(8).fillColor('#fff').text(h, x + 3, y + 4, { width: colW - 6, align: 'center' });
        x += colW;
      });

      x = 50;
      doc.rect(50, y + 18, colW * 6, 18).fill('#f8f9fa');
      summaryValues.forEach((v, i) => {
        doc.fontSize(9).fillColor('#333').text(`$${v.toLocaleString()}`, x + 3, y + 22, { width: colW - 6, align: 'center' });
        x += colW;
      });

      doc.y = y + 50;
      doc.moveDown();

      // Detail per bucket
      const bucketLabels: Record<string, string> = {
        current: 'Current (Not Yet Due)',
        '1-30': '1-30 Days Overdue',
        '31-60': '31-60 Days Overdue',
        '61-90': '61-90 Days Overdue',
        '90+': '90+ Days Overdue',
      };

      for (const [key, label] of Object.entries(bucketLabels)) {
        const items = data.buckets[key];
        if (items.length === 0) continue;

        doc.fontSize(12).fillColor('#333').text(`${label} ($${data.totals[key].toLocaleString()})`);
        doc.moveDown(0.3);

        const tTop = doc.y;
        const hdrs = ['Invoice', 'School', 'Amount', 'Due Date'];
        const cW = [100, 180, 100, 110];
        let cx = 50;

        doc.rect(50, tTop, 495, 16).fill('#1a73e8');
        hdrs.forEach((h, i) => {
          doc.fontSize(8).fillColor('#fff').text(h, cx + 3, tTop + 3, { width: cW[i] - 6 });
          cx += cW[i];
        });

        let ry = tTop + 16;
        for (const item of items.slice(0, 15)) {
          if (ry > 700) {
            doc.addPage();
            ry = 50;
          }
          const bg = items.indexOf(item) % 2 === 0 ? '#f8f9fa' : '#fff';
          doc.rect(50, ry, 495, 14).fill(bg);
          cx = 50;
          doc.fontSize(8).fillColor('#333');
          doc.text(item.invoiceNumber, cx + 3, ry + 3, { width: cW[0] - 6 });
          cx += cW[0];
          doc.text(item.school, cx + 3, ry + 3, { width: cW[1] - 6 });
          cx += cW[1];
          doc.text(`$${item.amount.toLocaleString()}`, cx + 3, ry + 3, { width: cW[2] - 6 });
          cx += cW[2];
          doc.text(item.dueDate, cx + 3, ry + 3, { width: cW[3] - 6 });
          ry += 14;
        }

        doc.y = ry + 10;
        doc.moveDown(0.5);
      }

      doc.fontSize(8).fillColor('#999').text(`Generated on ${new Date().toLocaleString()} by DigiLearn CRM`, { align: 'center' });
      doc.end();
    });
  }

  private async generateCollectionsXlsx(data: any): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'DigiLearn CRM';

    const sheet = workbook.addWorksheet('Collections Aging');

    sheet.mergeCells('A1:F1');
    sheet.getCell('A1').value = 'Collections Aging Report';
    sheet.getCell('A1').font = { size: 16, bold: true, color: { argb: '1a73e8' } };

    sheet.addRow([`As of: ${data.asOfDate}`]);
    sheet.addRow([]);

    // Summary
    const summaryHeader = sheet.addRow(['Current', '1-30 Days', '31-60 Days', '61-90 Days', '90+ Days', 'Total']);
    summaryHeader.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '1a73e8' } };
      cell.font = { color: { argb: 'FFFFFF' }, bold: true };
    });
    sheet.addRow([
      data.totals.current,
      data.totals['1-30'],
      data.totals['31-60'],
      data.totals['61-90'],
      data.totals['90+'],
      data.grandTotal,
    ]);

    sheet.addRow([]);

    const bucketLabels: Record<string, string> = {
      current: 'Current (Not Yet Due)',
      '1-30': '1-30 Days Overdue',
      '31-60': '31-60 Days Overdue',
      '61-90': '61-90 Days Overdue',
      '90+': '90+ Days Overdue',
    };

    for (const [key, label] of Object.entries(bucketLabels)) {
      const items = data.buckets[key];
      if (items.length === 0) continue;

      sheet.addRow([]);
      const sectionRow = sheet.addRow([label]);
      sectionRow.font = { bold: true, size: 12 };

      const headerRow = sheet.addRow(['Invoice', 'School', 'Amount ($)', 'Due Date', 'Days Overdue']);
      headerRow.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '1a73e8' } };
        cell.font = { color: { argb: 'FFFFFF' }, bold: true };
      });

      for (const item of items) {
        sheet.addRow([item.invoiceNumber, item.school, item.amount, item.dueDate, item.daysOverdue]);
      }
    }

    sheet.columns = [
      { width: 20 },
      { width: 30 },
      { width: 15 },
      { width: 15 },
      { width: 15 },
      { width: 15 },
    ];

    return Buffer.from(await workbook.xlsx.writeBuffer());
  }
}
