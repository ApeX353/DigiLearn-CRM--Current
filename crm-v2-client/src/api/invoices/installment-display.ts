// An instalment row keeps its own status ("pending") when its invoice is
// cancelled, so the schedule reads the invoice. Judged on the row's own invoice,
// never the parent: historic cancelled parents still have instalments holding
// real receipts, and those must not read Cancelled (EBI-FOCUS-001).
export const installmentDisplayStatus = (
  installmentStatus: string,
  linkedInvoiceStatus?: string,
) => (linkedInvoiceStatus === "Cancelled" ? "cancelled" : installmentStatus);
