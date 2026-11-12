import { BadRequestException } from '@nestjs/common';
import type { Invoice } from './entities/invoice.entity';
import type { InvoiceStatus } from './constants';

/**
 * The money rules every writer of an invoice obeys (FIN-03, 19 Oct 2026).
 *
 * Until now each route checked what it happened to remember: PATCH /status
 * refused "Paid with nothing received", but PUT /invoices/:id stored it; the
 * status route refused cancelling an invoice holding money, the generic edit
 * did not; creation accepted status=Paid on a brand-new invoice; a line could
 * carry a discount larger than itself and push the total below zero; a paid
 * invoice's lines could be rewritten while it stayed "Paid". Three production
 * invoices (INV-2026-0022, 0023, 0070) read Paid with nothing received.
 *
 * These functions are pure and throw BadRequestException with a sentence a
 * person can act on. The services call them from inside their transactions,
 * after the row is locked, so the figures they judge are the figures that
 * will be written.
 */

const round2 = (n: number): number => Math.round(n * 100) / 100;

type MoneyFacts = Pick<Invoice, 'invoice_number' | 'total' | 'amount_paid'>;

/**
 * A status is a claim about money, so it has to match the money.
 * Paid needs the full amount received; Partially-Paid needs something
 * received; Cancelled needs nothing received (BUG-043: money against a
 * cancelled invoice has nowhere to go and used to revive it).
 */
export function assertStatusChangeAllowed(
  invoice: MoneyFacts,
  status: InvoiceStatus,
): void {
  const paid = Number(invoice.amount_paid ?? 0);
  const owed = Number(invoice.total ?? 0);

  if (status === 'Paid' && paid + 0.005 < owed) {
    throw new BadRequestException(
      `Cannot mark ${invoice.invoice_number} as Paid: ${paid.toFixed(2)} of ` +
        `${owed.toFixed(2)} has been received. Record the payment and the ` +
        `status follows on its own — or leave it Partially-Paid until the ` +
        `balance arrives.`,
    );
  }

  if (status === 'Partially-Paid' && paid <= 0) {
    throw new BadRequestException(
      `Cannot mark ${invoice.invoice_number} as Partially-Paid: no payment ` +
        `has been recorded against it yet.`,
    );
  }

  if (status === 'Cancelled' && paid > 0) {
    throw new BadRequestException(
      `Cannot cancel ${invoice.invoice_number}: ${paid.toFixed(2)} has been ` +
        `received against it. Remove or reassign those payments first, ` +
        `then cancel.`,
    );
  }
}

/**
 * A new invoice has received nothing, so it can only start as Draft or
 * Sent. Paid and Partially-Paid are derived from receipts; Cancelled and
 * Overdue are decisions about an invoice that already exists.
 */
export function assertCreateStatusAllowed(status: InvoiceStatus | undefined): void {
  if (status === undefined || status === 'Draft' || status === 'Sent') return;
  throw new BadRequestException(
    `An invoice cannot be created as ${status}: whether it is paid is worked ` +
      `out from the receipts recorded against it. Create it as Draft or Sent, ` +
      `then record the payment.`,
  );
}

export interface LineAmounts {
  description?: string;
  quantity: number | string;
  unit_price: number | string;
  discount?: number | string | null;
  tax_rate?: number | string | null;
}

/**
 * The relationships between a line's figures, which field-by-field
 * validation cannot see: a discount may not exceed the line amount, so no
 * line and no invoice can be worth less than nothing. A credit is its own
 * document, not a negative invoice.
 */
export function assertLineAmountsValid(line: LineAmounts): void {
  const label = line.description ? `"${line.description}"` : 'the line';
  const quantity = Number(line.quantity);
  const unitPrice = Number(line.unit_price);
  const discount = Number(line.discount ?? 0);
  const taxRate = Number(line.tax_rate ?? 0);

  if (!Number.isFinite(quantity) || quantity < 0) {
    throw new BadRequestException(`The quantity on ${label} must be zero or more`);
  }
  if (!Number.isFinite(unitPrice) || unitPrice < 0) {
    throw new BadRequestException(`The unit price on ${label} must be zero or more`);
  }
  if (!Number.isFinite(discount) || discount < 0) {
    throw new BadRequestException(`The discount on ${label} must be zero or more`);
  }
  if (!Number.isFinite(taxRate) || taxRate < 0) {
    throw new BadRequestException(`The tax rate on ${label} must be zero or more`);
  }

  const lineAmount = round2(quantity * unitPrice);
  if (discount > lineAmount + 0.005) {
    throw new BadRequestException(
      `The discount of ${discount.toFixed(2)} on ${label} is more than the line ` +
        `amount of ${lineAmount.toFixed(2)}. A line cannot be worth less than ` +
        `nothing; to give money back, raise a separate credit.`,
    );
  }
}

/**
 * Lines are the basis of the total, and the total is what receipts are
 * measured against. Once money has been recorded the lines are fixed; a
 * cancelled invoice is not edited back into life through its lines.
 */
export function assertItemsEditable(
  invoice: Pick<Invoice, 'invoice_number' | 'status'>,
  receiptsRecorded: number,
): void {
  if (invoice.status === 'Cancelled') {
    throw new BadRequestException(
      `${invoice.invoice_number} is cancelled, so its lines cannot be changed. ` +
        `Set it back to Sent first if it was cancelled by mistake.`,
    );
  }
  if (receiptsRecorded > 0) {
    throw new BadRequestException(
      `${invoice.invoice_number} has ${receiptsRecorded} payment(s) recorded ` +
        `against it, so its lines and total are fixed. To change what was ` +
        `billed, remove the payments first or raise a separate correcting ` +
        `document.`,
    );
  }
}
