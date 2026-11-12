import * as zlib from 'zlib';
import { DocumentGeneratorService } from './document-generator.service';
import type { SettingsService } from '../settings/settings.service';

/**
 * Regression test for the PDF generator finishing the document before the
 * item amounts and the totals block were written (ticket 2026-10-12,
 * "Quote and invoice PDFs are finished before their rows and totals are drawn").
 *
 * pdfkit compresses page content, so the assertion inflates every content
 * stream and joins the <hex> glyph strings pdfkit emits for the standard
 * fonts. Kerning can split one word across several hex runs inside a TJ
 * array; joining them in order reassembles it.
 */
function pdfText(buf: Buffer): string {
  const out: string[] = [];
  const src = buf.toString('latin1');
  const re = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const raw = Buffer.from(m[1], 'latin1');
    let body: string;
    try {
      body = zlib.inflateSync(raw).toString('latin1');
    } catch {
      body = raw.toString('latin1');
    }
    let piece = '';
    const hex = /<([0-9a-fA-F]+)>/g;
    let h: RegExpExecArray | null;
    while ((h = hex.exec(body))) {
      piece += Buffer.from(h[1], 'hex').toString('latin1');
    }
    if (piece) out.push(piece);
  }
  return out.join('\n');
}

const settings = {
  getSetting: jest.fn(async (key: string) =>
    key === 'currency' ? ({ value: 'USD' } as any) : null,
  ),
} as unknown as SettingsService;

const items = [
  {
    description: 'Interactive board 75in',
    quantity: 2,
    unit_price: 1500,
    discount: 0,
    tax: 150,
    total: 3150,
  },
  {
    description: 'Installation',
    quantity: 1,
    unit_price: 250.5,
    discount: 10,
    tax: 0,
    total: 240.5,
  },
] as any[];

const quote = {
  quote_number: 'QUO-2026-9999',
  created_at: new Date('2026-10-12T08:00:00Z'),
  valid_until: new Date('2026-11-11T08:00:00Z'),
  status: 'Draft',
  client_name: 'Test School',
  client_email: 'bursar@example.org',
  client_address: null,
  subtotal: 3390.5,
  discount: 10,
  tax: 150,
  total: 3390.5,
  notes: null,
  items,
} as any;

const invoice = {
  ...quote,
  invoice_number: 'INV-2026-9999',
  due_date: new Date('2026-11-11T08:00:00Z'),
} as any;

describe('DocumentGeneratorService — rows and totals are inside the finished PDF', () => {
  let service: DocumentGeneratorService;

  beforeEach(() => {
    service = new DocumentGeneratorService(settings);
  });

  it('quote PDF contains every item amount and the totals block', async () => {
    const buf = await service.generateQuotePdf(quote);
    const text = pdfText(buf);

    // Header labels — written synchronously, present before and after the fix
    expect(text).toContain('Description');
    expect(text).toContain('Unit Price');

    // Row amounts — these were written after doc.end() and dropped
    expect(text).toContain('$1,500.00');
    expect(text).toContain('$3,150.00');
    expect(text).toContain('$250.50');
    expect(text).toContain('$240.50');

    // Totals block
    expect(text).toContain('Subtotal:');
    expect(text).toContain('Discount:');
    expect(text).toContain('Tax:');
    expect(text).toContain('Total:');
    expect(text).toContain('$3,390.50');
  });

  it('invoice PDF contains every item amount and the totals block', async () => {
    const buf = await service.generateInvoicePdf(invoice);
    const text = pdfText(buf);
    expect(text).toContain('$1,500.00');
    expect(text).toContain('$240.50');
    expect(text).toContain('Subtotal:');
    expect(text).toContain('Total:');
    expect(text).toContain('$3,390.50');
  });

  it('reads the currency setting once per document, not once per amount', async () => {
    (settings.getSetting as jest.Mock).mockClear();
    await service.generateQuotePdf(quote);
    const currencyReads = (settings.getSetting as jest.Mock).mock.calls.filter(
      ([k]) => k === 'currency',
    ).length;
    expect(currencyReads).toBe(1);
  });
});
