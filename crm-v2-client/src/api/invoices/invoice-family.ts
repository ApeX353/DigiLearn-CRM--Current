// An invoice's status is its own (EBI-FOCUS-001). This is the separate line that
// describes its relatives, so a split family is never relabelled as Cancelled.
export interface InvoiceFamilyFacts {
  status: string;
  family_summary?: { instalments: number; cancelled: number } | null;
  parent_status?: string | null;
  parent_invoice_number?: string | null;
}

export const invoiceFamilyNote = (invoice: InvoiceFamilyFacts) => {
  const family = invoice.family_summary;
  if (family && family.cancelled > 0) {
    return `${family.cancelled} of ${family.instalments} instalments cancelled`;
  }
  const parent = invoice.parent_invoice_number;
  if (invoice.parent_status === "Cancelled" && invoice.status !== "Cancelled") {
    return parent ? `Parent ${parent} cancelled` : "Parent invoice cancelled";
  }
  return parent ? `Instalment of ${parent}` : null;
};

// The invoices a refusal names, for the line under its message. A permission
// failure carries no details, so nothing financial can appear there.
export const refusedInvoicesLine = (error: unknown) => {
  const rows = (
    error as {
      response?: {
        data?: {
          details?: {
            instalments?: Array<{ invoice_number: string; status: string }>;
          };
        };
      };
    }
  )?.response?.data?.details?.instalments;
  if (!rows?.length) return undefined;
  return rows
    .map((row) => `${row.invoice_number} (${row.status})`)
    .join(", ");
};

export const INVOICE_VIEWS = ["issued", "drafts", "cancelled", "all"] as const;
export type InvoiceView = (typeof INVOICE_VIEWS)[number];

export const INVOICE_VIEW_LABELS: Record<InvoiceView, string> = {
  issued: "Issued / Current",
  drafts: "Drafts",
  cancelled: "Cancelled",
  all: "All",
};

interface FamilyMember extends InvoiceFamilyFacts {
  id: string;
  invoice_number?: string;
  parent_invoice_id?: string | null;
  is_summary_invoice?: boolean;
  total?: number | string;
  amount_paid?: number | string;
}

export interface InvoiceFamily<T extends FamilyMember> {
  /** The parent, or the invoice itself when it stands alone. */
  lead: T;
  children: T[];
  warnings: string[];
}

/** Which view an invoice belongs to by its own status. */
export const statusInView = (status: string, view: InvoiceView) => {
  if (view === "all") return true;
  if (view === "cancelled") return status === "Cancelled";
  if (view === "drafts") return status === "Draft";
  return status !== "Draft" && status !== "Cancelled";
};

/**
 * Groups a flat list into parents with their instalments. A parent's total already
 * covers its instalments, so only `lead` may ever be added up as a sale. An instalment
 * whose parent is not in the list leads its own group rather than disappearing.
 */
export const groupInvoiceFamilies = <T extends FamilyMember>(invoices: T[]) => {
  const byId = new Map(invoices.map((invoice) => [invoice.id, invoice]));
  const families = new Map<string, InvoiceFamily<T>>();
  for (const invoice of invoices) {
    if (!invoice.parent_invoice_id || !byId.has(invoice.parent_invoice_id)) {
      families.set(invoice.id, { lead: invoice, children: [], warnings: [] });
    }
  }
  for (const invoice of invoices) {
    if (invoice.parent_invoice_id && byId.has(invoice.parent_invoice_id)) {
      families.get(invoice.parent_invoice_id)?.children.push(invoice);
    }
  }
  for (const family of families.values()) {
    const parentCancelled =
      family.lead.status === "Cancelled" || family.lead.parent_status === "Cancelled";
    for (const child of family.children) {
      if (parentCancelled && child.status !== "Cancelled") {
        family.warnings.push(
          `${child.invoice_number} is ${child.status} under a cancelled parent. It needs review.`,
        );
      }
      if (family.lead.status === "Draft" && statusInView(child.status, "issued")) {
        family.warnings.push(
          `${child.invoice_number} is ${child.status} under a Draft parent. It needs review.`,
        );
      }
    }
  }
  return [...families.values()];
};

/** A family shows in a view when any member belongs there, always in full. */
export const familyInView = <T extends FamilyMember>(
  family: InvoiceFamily<T>,
  view: InvoiceView,
) =>
  [family.lead, ...family.children].some((member) =>
    statusInView(member.status, view),
  );

/** "Unpaid" reads as money owed, so the badge belongs to an issued invoice. */
export const showPaymentBadge = (invoice: { status: string }) =>
  statusInView(invoice.status, "issued");

// The server's rule: a Draft instalment under an issued parent is part of what is
// owed, and one under a Paid parent is settled, so neither reads as not issued.
const PARENT_ISSUED = ["Sent", "Partially-Paid", "Overdue", "Paid"];
export const isUnissuedDraft = (invoice: InvoiceFamilyFacts) =>
  invoice.status === "Draft" &&
  !PARENT_ISSUED.includes(invoice.parent_status ?? "");

/** What a screen shows instead of a balance when nothing is owed yet, or ever. */
export const outstandingLabel = (invoice: InvoiceFamilyFacts) => {
  if (invoice.status === "Cancelled") return "—";
  return isUnissuedDraft(invoice) ? "Not issued" : null;
};

/**
 * The aging report keeps Draft instalments, so a deal's tab separates them rather
 * than totalling them as owed. The rows and their balances are left as they are.
 */
export const splitInstalmentBalances = (
  rows: Array<{ invoice_id: string; balance?: number | string | null }>,
  invoiceById: Map<string, InvoiceFamilyFacts>,
) =>
  rows.reduce(
    (totals, row) => {
      const invoice = invoiceById.get(row.invoice_id);
      const key = invoice && isUnissuedDraft(invoice) ? "draft" : "issued";
      return { ...totals, [key]: totals[key] + Number(row.balance || 0) };
    },
    { issued: 0, draft: 0 },
  );

export const invoiceRowTone = (invoice: { status: string }) =>
  invoice.status === "Cancelled" ? "opacity-60" : "";

/**
 * Open invoices with no schedule, so nothing appears for them on an instalments tab.
 * Only ever a note: no instalment is implied for them.
 */
export const invoicesWithoutSchedule = <T extends FamilyMember>(
  invoices: T[],
  installmentInvoiceIds: Set<string>,
) =>
  invoices.filter(
    (invoice) =>
      !invoice.parent_invoice_id &&
      !invoice.is_summary_invoice &&
      invoice.status !== "Cancelled" &&
      Number(invoice.total ?? 0) > Number(invoice.amount_paid ?? 0) &&
      !installmentInvoiceIds.has(invoice.id),
  );

/** Opens the existing Audit Trail filtered to one invoice. */
export const invoiceHistoryPath = (invoiceNumber: string) =>
  `/admin/audit-log?category=financial&record=${encodeURIComponent(invoiceNumber)}`;
