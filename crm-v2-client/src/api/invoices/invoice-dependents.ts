import type { QueryClient } from "@tanstack/react-query";

// Invoice data is shown under more than the invoice keys: Deal > Products reads
// deal.invoices from the deal query, the deal's Installments tab reads the aging
// report, and the school, dashboard and report pages carry their own copies. A
// mutation that refreshed only ["invoices"] left an open deal reading Draft after
// a successful cancellation (EBI-FOCUS-001).
export const invoiceDependentKeys = [
  ["invoices"],
  ["deals"],
  ["schools"],
  ["payments"],
  ["payment-terms"],
  ["collections"],
  ["dashboard"],
  ["reports"],
] as const;

export const invalidateInvoiceDependents = (queryClient: QueryClient) =>
  Promise.all(
    invoiceDependentKeys.map((queryKey) =>
      queryClient.invalidateQueries({ queryKey }),
    ),
  );
