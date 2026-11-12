import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
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

/** Stable across wording changes: clients and support match on these. */
export const InvoiceErrorCode = {
  ACTIVE_INSTALLMENTS: 'INVOICE_HAS_ACTIVE_INSTALLMENTS',
  RECORDED_PAYMENTS: 'INVOICE_HAS_RECORDED_PAYMENTS',
  INVALID_TRANSITION: 'INVALID_INVOICE_STATUS_TRANSITION',
  MODIFIED_CONCURRENTLY: 'INVOICE_MODIFIED_CONCURRENTLY',
  UPDATE_FORBIDDEN: 'INVOICE_UPDATE_FORBIDDEN',
  NOT_FOUND: 'INVOICE_NOT_FOUND',
  PARENT_CANCELLED: 'INVOICE_PARENT_CANCELLED',
  QUOTE_ALREADY_INVOICED: 'QUOTE_ALREADY_INVOICED',
} as const;

export const RECORDED_PAYMENTS_MESSAGE =
  'This invoice has recorded payments and cannot be cancelled through the ' +
  'standard cancellation process. A manager must review the appropriate ' +
  'financial correction.';

export const FAMILY_PAYMENTS_MESSAGE =
  'This instalment belongs to a payment plan with recorded payments, so it ' +
  'cannot be cancelled through the standard cancellation process. The whole ' +
  'payment plan requires financial review by a manager.';

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
    throw new ConflictException({
      code: InvoiceErrorCode.INVALID_TRANSITION,
      message:
        `Cannot mark ${invoice.invoice_number} as Paid: ${paid.toFixed(2)} of ` +
        `${owed.toFixed(2)} has been received. Record the payment and the ` +
        `status follows on its own — or leave it Partially-Paid until the ` +
        `balance arrives.`,
    });
  }

  if (status === 'Partially-Paid' && paid <= 0) {
    throw new ConflictException({
      code: InvoiceErrorCode.INVALID_TRANSITION,
      message:
        `Cannot mark ${invoice.invoice_number} as Partially-Paid: no payment ` +
        `has been recorded against it yet.`,
    });
  }

  if (status === 'Cancelled' && paid > 0) {
    throw new ConflictException({
      code: InvoiceErrorCode.RECORDED_PAYMENTS,
      message: RECORDED_PAYMENTS_MESSAGE,
    });
  }
}

/**
 * An instalment reopened under a cancelled parent would be a live obligation
 * that every report leaves out, because a child of a cancelled parent is never
 * counted (010B).
 */
export function assertInstalmentCanReopen(
  instalment: Pick<Invoice, 'invoice_number'>,
  parent: Pick<Invoice, 'invoice_number' | 'status'>,
): void {
  if (parent.status !== 'Cancelled') return;
  throw new ConflictException({
    code: InvoiceErrorCode.INVALID_TRANSITION,
    message:
      `${instalment.invoice_number} cannot be reopened because its parent ` +
      `invoice ${parent.invoice_number} is cancelled. Reopen the parent first.`,
    details: { parent: parent.invoice_number, parent_status: parent.status },
  });
}

type FamilyMember = Pick<
  Invoice,
  'id' | 'invoice_number' | 'status' | 'total' | 'amount_paid'
>;

export interface CancellationRefusal {
  code: string;
  message: string;
  details: {
    invoice_number: string;
    active_instalments: number;
    total_instalments: number;
    instalments: Array<{ invoice_number: string; status: string }>;
  };
}

/**
 * Whether the standard cancellation may go ahead, for the review dialog and for
 * the write itself, so the two cannot disagree. `recorded` holds money found in
 * the payment and allocation records: `amount_paid` is a cache that can lag them.
 *
 * Money anywhere in a payment plan blocks it, including on a sibling of the unpaid
 * instalment selected: the plan's remaining obligation must not leave the financial
 * reports through a standard cancellation. A parent over live instalments is
 * refused rather than cascaded, because what happens to those obligations is a
 * financial decision this route must not take (EBI-FOCUS-001).
 */
export function cancellationRefusal(
  invoice: FamilyMember,
  family: { parent: FamilyMember | null; instalments: FamilyMember[] },
  recorded: ReadonlyMap<string, number>,
): CancellationRefusal | null {
  const { parent, instalments } = family;
  const held = (row: FamilyMember) =>
    Math.max(Number(row.amount_paid ?? 0), recorded.get(row.id) ?? 0);
  const listed = (rows: FamilyMember[]) =>
    rows
      .map(({ invoice_number, status }) => ({ invoice_number, status }))
      .sort((a, b) => a.invoice_number.localeCompare(b.invoice_number));
  const active = instalments.filter((child) => child.status !== 'Cancelled');
  const details = {
    invoice_number: invoice.invoice_number,
    active_instalments: active.length,
    total_instalments: instalments.length,
  };

  const paid = instalments.filter((child) => held(child) > 0);
  const isInstalment = !!parent && parent.id !== invoice.id;
  if (held(invoice) > 0 || paid.length > 0 || (parent && held(parent) > 0)) {
    return {
      code: InvoiceErrorCode.RECORDED_PAYMENTS,
      message:
        isInstalment && held(invoice) === 0
          ? FAMILY_PAYMENTS_MESSAGE
          : RECORDED_PAYMENTS_MESSAGE,
      details: { ...details, instalments: listed(paid) },
    };
  }
  if (!isInstalment && active.length > 0) {
    const count =
      active.length === 1
        ? `1 of its ${instalments.length} instalments is`
        : `${active.length} of its ${instalments.length} instalments are`;
    return {
      code: InvoiceErrorCode.ACTIVE_INSTALLMENTS,
      message:
        `${invoice.invoice_number} cannot be cancelled because ${count} still ` +
        `active. Each one may still be money the customer owes. An unpaid ` +
        `instalment can be cancelled on its own, but only if the amount is ` +
        `genuinely not due: cancelling it takes it out of what the customer is ` +
        `shown as owing.`,
      details: { ...details, instalments: listed(active) },
    };
  }
  return null;
}

/**
 * A live instalment under a cancelled parent is counted nowhere (010B), so money
 * recorded on it would vanish from every report. Rows like that predate the rule
 * that stops new ones being made, and are left for a person to resolve.
 */
export function assertFamilyAcceptsPayments(
  invoice: Pick<Invoice, 'invoice_number'>,
  parent: Pick<Invoice, 'invoice_number' | 'status'> | null,
): void {
  if (parent?.status !== 'Cancelled') return;
  throw new ConflictException({
    code: InvoiceErrorCode.PARENT_CANCELLED,
    message:
      `No payment can be recorded against ${invoice.invoice_number} because ` +
      `its parent invoice ${parent.invoice_number} is cancelled. A manager must ` +
      `review this payment plan first.`,
    details: {
      invoice_number: invoice.invoice_number,
      parent: parent.invoice_number,
      parent_status: parent.status,
    },
  });
}

/** The manager rule for a route that handles more than invoices (EBI-FOCUS-001). */
export function assertMayUpdateInvoice(role: string | undefined): void {
  if (role === 'admin' || role === 'sales_manager') return;
  throw new ForbiddenException({
    code: InvoiceErrorCode.UPDATE_FORBIDDEN,
    message: 'Only a manager can change an invoice.',
  });
}

export const invoiceNotFound = (id: string) =>
  new NotFoundException({
    code: InvoiceErrorCode.NOT_FOUND,
    message: `Invoice with ID ${id} not found`,
  });

/** Two writers met on one invoice: Postgres aborted one, and nothing of it was saved. */
export function rethrowInvoiceConflict(error: unknown): never {
  const failure = error as { code?: string; driverError?: { code?: string } };
  const sqlState = failure?.driverError?.code ?? failure?.code;
  if (sqlState && ['40P01', '40001', '55P03'].includes(sqlState)) {
    throw new ConflictException({
      code: InvoiceErrorCode.MODIFIED_CONCURRENTLY,
      message:
        'This invoice was being changed by someone else at the same moment. ' +
        'Nothing was saved. Refresh and try again.',
    });
  }
  throw error;
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
