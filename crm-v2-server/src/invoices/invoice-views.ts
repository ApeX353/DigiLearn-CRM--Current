/**
 * How the invoice lists divide documents (EBI-FOCUS-002). A Draft has not been
 * issued, so being not cancelled does not make it current or collectable; it has
 * its own view. Each row stays in the view of its own status.
 *
 * Instalments normally sit under their parent, so the lists show only the parent.
 * Two kinds surface on their own because no live parent stands for them: a cancelled
 * instalment, and a live instalment under a cancelled parent. Issued, Drafts and
 * Cancelled therefore divide All exactly, with nothing in two views.
 */
export const INVOICE_VIEWS = ['issued', 'drafts', 'cancelled', 'all'] as const;
export type InvoiceView = (typeof INVOICE_VIEWS)[number];

const PARENT_CANCELLED = (alias: string) =>
  `EXISTS (SELECT 1 FROM invoices parent_row WHERE parent_row.id = ${alias}.parent_invoice_id AND parent_row.status = 'Cancelled')`;

export const invoiceViewClause = (view: InvoiceView, alias: string): string => {
  const standsAlone = `(${alias}.parent_invoice_id IS NULL OR ${PARENT_CANCELLED(alias)})`;
  if (view === 'issued') return `${alias}.status NOT IN ('Draft', 'Cancelled') AND ${standsAlone}`;
  if (view === 'drafts') return `${alias}.status = 'Draft' AND ${standsAlone}`;
  if (view === 'cancelled') return `${alias}.status = 'Cancelled'`;
  return `(${alias}.status = 'Cancelled' OR ${standsAlone})`;
};
