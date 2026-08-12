import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import type { Invoice } from '../invoices/entities/invoice.entity';
import type { Quote } from '../quotes/entities/quote.entity';
import type { DocumentItem } from '../document-items/entities/document-item.entity';
import { SettingsService } from '../settings/settings.service';

interface CompanyInfo {
  name: string;
  address: string;
  email: string;
  phone: string;
}

@Injectable()
export class DocumentGeneratorService {
  private readonly company: CompanyInfo;

  constructor(private readonly appSettingsService: SettingsService) {
    this.company = {
      name: process.env.COMPANY_NAME || 'DigiLearn',
      address: process.env.COMPANY_ADDRESS || '',
      email: process.env.COMPANY_EMAIL || '',
      phone: process.env.COMPANY_PHONE || '',
    };
  }

  async generateInvoicePdf(
    invoice: Invoice & { items: DocumentItem[] },
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Header
      this.drawHeader(doc, 'INVOICE');

      // Document info
      const infoY = 160;
      doc.fontSize(10).fillColor('#333');
      doc.text(`Invoice Number: ${invoice.invoice_number}`, 50, infoY);
      doc.text(
        `Date: ${new Date(invoice.created_at).toLocaleDateString()}`,
        50,
        infoY + 15,
      );
      if (invoice.due_date) {
        doc.text(
          `Due Date: ${new Date(invoice.due_date).toLocaleDateString()}`,
          50,
          infoY + 30,
        );
      }
      doc.text(`Status: ${invoice.status}`, 50, infoY + 45);

      // Client info
      doc.text('Bill To:', 350, infoY);
      doc.font('Helvetica-Bold').text(invoice.client_name, 350, infoY + 15);
      doc.font('Helvetica');
      if (invoice.client_email) {
        doc.text(invoice.client_email, 350, infoY + 30);
      }
      if (invoice.client_address) {
        doc.text(invoice.client_address, 350, infoY + 45, { width: 200 });
      }

      // Items table
      const tableTop = infoY + 80;
      this.drawItemsTable(doc, invoice.items, tableTop);

      // Totals
      const totalsY = tableTop + 30 + invoice.items.length * 25 + 20;
      this.drawTotals(
        doc,
        {
          subtotal: Number(invoice.subtotal),
          discount: Number(invoice.discount),
          tax: Number(invoice.tax),
          total: Number(invoice.total),
        },
        totalsY,
      );

      // Notes
      if (invoice.notes) {
        const notesY = totalsY + 100;
        doc.fontSize(10).font('Helvetica-Bold').text('Notes:', 50, notesY);
        doc
          .font('Helvetica')
          .text(invoice.notes, 50, notesY + 15, { width: 500 });
      }

      // Footer
      this.drawFooter(doc);

      doc.end();
    });
  }

  async generateQuotePdf(
    quote: Quote & { items: DocumentItem[] },
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Header
      this.drawHeader(doc, 'QUOTATION');

      // Document info
      const infoY = 160;
      doc.fontSize(10).fillColor('#333');
      doc.text(`Quote Number: ${quote.quote_number}`, 50, infoY);
      doc.text(
        `Date: ${new Date(quote.created_at).toLocaleDateString()}`,
        50,
        infoY + 15,
      );
      if (quote.valid_until) {
        doc.text(
          `Valid Until: ${new Date(quote.valid_until).toLocaleDateString()}`,
          50,
          infoY + 30,
        );
      }
      doc.text(`Status: ${quote.status}`, 50, infoY + 45);
      doc.text(`Currency: ${quote.currency ?? 'Not recorded'}`, 50, infoY + 60);

      // Client info
      doc.text('Prepared For:', 350, infoY);
      doc.font('Helvetica-Bold').text(quote.client_name, 350, infoY + 15);
      doc.font('Helvetica');
      if (quote.client_email) {
        doc.text(quote.client_email, 350, infoY + 30);
      }
      if (quote.client_address) {
        doc.text(quote.client_address, 350, infoY + 45, { width: 200 });
      }

      // Items table
      const tableTop = infoY + 80;
      this.drawItemsTable(doc, quote.items, tableTop, quote.currency);

      // Totals
      const totalsY = tableTop + 30 + quote.items.length * 25 + 20;
      this.drawTotals(
        doc,
        {
          subtotal: Number(quote.subtotal),
          discount: Number(quote.discount),
          tax: Number(quote.tax),
          total: Number(quote.total),
        },
        totalsY,
        quote.currency,
      );

      // Notes
      if (quote.notes) {
        const notesY = totalsY + 100;
        doc.fontSize(10).font('Helvetica-Bold').text('Notes:', 50, notesY);
        doc
          .font('Helvetica')
          .text(quote.notes, 50, notesY + 15, { width: 500 });
      }

      // Footer
      this.drawFooter(doc);

      doc.end();
    });
  }

  private drawHeader(doc: PDFKit.PDFDocument, title: string): void {
    // Company name
    doc
      .fontSize(20)
      .font('Helvetica-Bold')
      .fillColor('#1a73e8')
      .text(this.company.name, 50, 50);

    // Company details
    doc.fontSize(9).font('Helvetica').fillColor('#666');
    let companyY = 75;
    if (this.company.address) {
      doc.text(this.company.address, 50, companyY);
      companyY += 12;
    }
    if (this.company.email) {
      doc.text(this.company.email, 50, companyY);
      companyY += 12;
    }
    if (this.company.phone) {
      doc.text(this.company.phone, 50, companyY);
    }

    // Document title
    doc
      .fontSize(28)
      .font('Helvetica-Bold')
      .fillColor('#1a73e8')
      .text(title, 350, 50, { align: 'right', width: 195 });

    // Divider
    doc
      .strokeColor('#1a73e8')
      .lineWidth(2)
      .moveTo(50, 140)
      .lineTo(545, 140)
      .stroke();
  }

  private drawItemsTable(
    doc: PDFKit.PDFDocument,
    items: DocumentItem[],
    startY: number,
    currency?: string | null,
  ): void {
    const colX = {
      description: 50,
      qty: 280,
      unitPrice: 330,
      discount: 400,
      tax: 450,
      total: 490,
    };

    // Table header
    doc.fontSize(9).font('Helvetica-Bold').fillColor('#fff');

    doc.rect(50, startY, 495, 22).fill('#1a73e8');

    doc
      .fillColor('#fff')
      .text('Description', colX.description + 5, startY + 6)
      .text('Qty', colX.qty, startY + 6, { width: 40, align: 'right' })
      .text('Unit Price', colX.unitPrice, startY + 6, {
        width: 60,
        align: 'right',
      })
      .text('Disc.', colX.discount, startY + 6, { width: 40, align: 'right' })
      .text('Tax', colX.tax, startY + 6, { width: 35, align: 'right' })
      .text('Total', colX.total, startY + 6, { width: 50, align: 'right' });

    // Table rows
    doc.font('Helvetica').fillColor('#333');
    let y = startY + 25;

    items.forEach(async (item, i) => {
      const bgColor = i % 2 === 0 ? '#f8f9fa' : '#ffffff';
      doc.rect(50, y - 3, 495, 22).fill(bgColor);

      doc
        .fillColor('#333')
        .fontSize(9)
        .text(item.description || '', colX.description + 5, y, { width: 220 })
        .text(String(item.quantity), colX.qty, y, { width: 40, align: 'right' })
        .text(await this.formatCurrency(Number(item.unit_price), currency), colX.unitPrice, y, {
          width: 60,
          align: 'right',
        })
        .text(await this.formatCurrency(Number(item.discount), currency), colX.discount, y, {
          width: 40,
          align: 'right',
        })
        .text(await this.formatCurrency(Number(item.tax), currency), colX.tax, y, {
          width: 35,
          align: 'right',
        })
        .text(await this.formatCurrency(Number(item.total), currency), colX.total, y, {
          width: 50,
          align: 'right',
        });

      y += 25;
    });

    // Bottom line
    doc
      .strokeColor('#1a73e8')
      .lineWidth(1)
      .moveTo(50, y)
      .lineTo(545, y)
      .stroke();
  }

  private async drawTotals(
    doc: PDFKit.PDFDocument,
    totals: { subtotal: number; discount: number; tax: number; total: number },
    startY: number,
    currency?: string | null,
  ): Promise<void> {
    const labelX = 380;
    const valueX = 490;
    let y = startY;

    doc.fontSize(10).font('Helvetica').fillColor('#333');

    doc.text('Subtotal:', labelX, y, { width: 100, align: 'right' });
    doc.text(await this.formatCurrency(totals.subtotal, currency), valueX, y, {
      width: 55,
      align: 'right',
    });
    y += 18;

    if (totals.discount > 0) {
      doc.text('Discount:', labelX, y, { width: 100, align: 'right' });
      doc.text(`-${await this.formatCurrency(totals.discount, currency)}`, valueX, y, {
        width: 55,
        align: 'right',
      });
      y += 18;
    }

    if (totals.tax > 0) {
      doc.text('Tax:', labelX, y, { width: 100, align: 'right' });
      doc.text(await this.formatCurrency(totals.tax, currency), valueX, y, {
        width: 55,
        align: 'right',
      });
      y += 18;
    }

    // Total line
    doc.strokeColor('#333').lineWidth(1).moveTo(380, y).lineTo(545, y).stroke();
    y += 8;

    doc.fontSize(12).font('Helvetica-Bold');
    doc.text('Total:', labelX, y, { width: 100, align: 'right' });
    doc.text(await this.formatCurrency(totals.total, currency), valueX, y, {
      width: 55,
      align: 'right',
    });
  }

  private drawFooter(doc: PDFKit.PDFDocument): void {
    const bottomY = doc.page.height - 60;
    doc
      .fontSize(8)
      .font('Helvetica')
      .fillColor('#999')
      .text(
        `Generated by ${this.company.name} on ${new Date().toLocaleDateString()}`,
        50,
        bottomY,
        { align: 'center', width: 495 },
      );
  }

  private async formatCurrency(
    value: number,
    currencyOverride?: string | null,
  ): Promise<string> {
    const currency = await this.appSettingsService.getSetting('currency');

    return value.toLocaleString('en-US', {
      style: 'currency',
      currency: currencyOverride ?? currency?.value ?? 'USD',
    });
  }
}
