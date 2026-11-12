// EBI-FOCUS-001 Fix 1. The client has no test runner, so this uses Node's own,
// against the real TanStack QueryClient. Outside src, so the build never sees it.
//
//   node --experimental-strip-types --test test/invoice-dependents.test.ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { QueryClient } from "@tanstack/react-query";
import { invalidateInvoiceDependents } from "../src/api/invoices/invoice-dependents.ts";
import {
  auditEnvironmentNote,
  auditSourceLabel,
  harareDayBound,
  harareTime,
} from "../src/lib/audit-presentation.ts";
import {
  paymentDatesNote,
  termDateFromDay,
  termDatePayload,
  termDatesProblem,
} from "../src/api/payment-terms/term-dates.ts";
import { installmentDisplayStatus } from "../src/api/invoices/installment-display.ts";
const INVOICE_STATUSES = ["Draft", "Sent", "Paid", "Partially-Paid", "Overdue", "Cancelled"];
import {
  familyInView,
  groupInvoiceFamilies,
  INVOICE_VIEW_LABELS,
  INVOICE_VIEWS,
  invoiceFamilyNote,
  invoiceHistoryPath,
  invoiceRowTone,
  invoicesWithoutSchedule,
  isUnissuedDraft,
  outstandingLabel,
  splitInstalmentBalances,
  statusInView,
  refusedInvoicesLine,
  showPaymentBadge,
} from "../src/api/invoices/invoice-family.ts";

const seeded = () => {
  const queryClient = new QueryClient();
  const keys = {
    openDeal: ["deals", "detail", "deal-1"],
    dealList: ["deals", "list", {}],
    invoiceList: ["invoices", "list", {}],
    invoiceDetail: ["invoices", "detail", "invoice-1"],
    schedule: ["invoices", "payment-schedule", "invoice-1"],
    school: ["schools", "detail", "school-1"],
    aging: ["collections", "aging-report", {}],
    terms: ["payment-terms", "schedule", "invoice-1"],
    kpi: ["dashboard", "kpis"],
    report: ["reports", "sales-performance"],
  };
  Object.values(keys).forEach((key) =>
    queryClient.setQueryData(key, { seeded: true }),
  );
  queryClient.setQueryData(["users", "list"], { seeded: true });
  return { queryClient, keys };
};

test("an open deal is refreshed after an invoice status change", async () => {
  const { queryClient, keys } = seeded();
  await invalidateInvoiceDependents(queryClient);
  assert.equal(queryClient.getQueryState(keys.openDeal)?.isInvalidated, true);
});

test("every screen that shows invoice data is refreshed", async () => {
  const { queryClient, keys } = seeded();
  await invalidateInvoiceDependents(queryClient);
  for (const [name, key] of Object.entries(keys)) {
    assert.equal(queryClient.getQueryState(key)?.isInvalidated, true, name);
  }
});

test("queries that hold no invoice data are left alone", async () => {
  const { queryClient } = seeded();
  await invalidateInvoiceDependents(queryClient);
  assert.equal(
    queryClient.getQueryState(["users", "list"])?.isInvalidated,
    false,
  );
});

test("every invoice mutation hook uses the shared refresh", () => {
  const source = readFileSync("src/api/invoices/use-invoices.ts", "utf8");
  const successes = source.match(/on(Success|Settled):/g) ?? [];
  const shared = source.match(/invalidateInvoiceDependents\(queryClient\)/g) ?? [];
  assert.ok(successes.length >= 9);
  assert.equal(shared.length, successes.length);
  assert.doesNotMatch(source, /invalidateQueries\(/);
});

test("an instalment reads cancelled when its own invoice is cancelled", () => {
  assert.equal(installmentDisplayStatus("pending", "Cancelled"), "cancelled");
});

test("an instalment under a live invoice keeps its own status", () => {
  assert.equal(installmentDisplayStatus("pending", "Draft"), "pending");
  assert.equal(installmentDisplayStatus("paid", "Paid"), "paid");
  assert.equal(installmentDisplayStatus("pending"), "pending");
});

test("a parent with one cancelled instalment says so and keeps its own status", () => {
  const parent = {
    status: "Draft",
    family_summary: { instalments: 2, cancelled: 1 },
  };
  assert.equal(invoiceFamilyNote(parent), "1 of 2 instalments cancelled");
  assert.equal(parent.status, "Draft");
});

test("a family with nothing cancelled shows no note", () => {
  const family_summary = { instalments: 2, cancelled: 0 };
  assert.equal(invoiceFamilyNote({ status: "Draft", family_summary }), null);
  assert.equal(invoiceFamilyNote({ status: "Draft" }), null);
});

test("a live instalment under a cancelled parent says so", () => {
  assert.equal(
    invoiceFamilyNote({ status: "Draft", parent_status: "Cancelled" }),
    "Parent invoice cancelled",
  );
});

test("a cancelled instalment needs no note, and a live parent is not mentioned", () => {
  assert.equal(
    invoiceFamilyNote({ status: "Cancelled", parent_status: "Cancelled" }),
    null,
  );
  assert.equal(
    invoiceFamilyNote({ status: "Cancelled", parent_status: "Draft" }),
    null,
  );
});

test("a refusal's named invoices become the line under its message", () => {
  const error = {
    response: {
      data: {
        details: {
          instalments: [
            { invoice_number: "INV-1", status: "Draft" },
            { invoice_number: "INV-2", status: "Sent" },
          ],
        },
      },
    },
  };
  assert.equal(refusedInvoicesLine(error), "INV-1 (Draft), INV-2 (Sent)");
});

test("a permission refusal shows no invoices", () => {
  const error = {
    response: { data: { code: "INVOICE_UPDATE_FORBIDDEN", message: "No." } },
  };
  assert.equal(refusedInvoicesLine(error), undefined);
  assert.equal(refusedInvoicesLine(new Error("network")), undefined);
});

test("cancelling reaches the server only through the review", () => {
  const modal = readFileSync(
    "src/components/invoices/invoice-preview-modal.tsx",
    "utf8",
  );
  assert.match(modal, /useInvoiceCancellationReview/);
  assert.match(modal, /expectedStatus: invoice\.status/);
  assert.doesNotMatch(modal, /Failed to update invoice status/);
  assert.equal(modal.split("{canUpdateInvoice && (").length - 1, 2);
});

test("a single-payment plan needs no term dates", () => {
  assert.equal(termDatesProblem(0, []), null);
  assert.equal(termDatesProblem(1, []), null);
});

test("every term needs a date", () => {
  assert.equal(
    termDatesProblem(2, [new Date(2027, 0, 12), undefined]),
    "Enter a payment date for Term 2.",
  );
  assert.equal(
    termDatesProblem(2, []),
    "Enter a payment date for Term 1.",
  );
});

test("terms run in order, and the same day twice is refused", () => {
  assert.equal(
    termDatesProblem(2, [new Date(2027, 4, 4), new Date(2027, 0, 12)]),
    "Term 2 must be later than Term 1.",
  );
  assert.equal(
    termDatesProblem(2, [new Date(2027, 0, 12), new Date(2027, 0, 12)]),
    "Term 2 must be later than Term 1.",
  );
  assert.equal(
    termDatesProblem(2, [new Date(2027, 0, 12), new Date(2027, 4, 4)]),
    null,
  );
});

test("the date sent is the calendar day picked, whatever the timezone", () => {
  assert.equal(termDatePayload(new Date(2027, 0, 12, 23, 30)), "2027-01-12");
  assert.equal(termDatePayload(new Date(2027, 0, 12, 0, 15)), "2027-01-12");
});

test("a suggested day shows as that same calendar day and round-trips", () => {
  const date = termDateFromDay("2027-01-31");
  assert.equal(date.getDate(), 31);
  assert.equal(date.getMonth(), 0);
  assert.equal(termDatePayload(date), "2027-01-31");
});

test("conversion confirms dates through the dialog, not straight from the button", () => {
  const page = readFileSync("src/pages/deals/view-deal-details.tsx", "utf8");
  assert.match(page, /onClick=\{\(\) => setReviewQuoteId\(quote\.id\)\}/);
  assert.match(page, /isSubmitting=\{convertQuoteToInvoice\.isPending\}/);
});

test("prefilled dates read as suggested, never as agreed", () => {
  const note = paymentDatesNote("suggested");
  assert.match(note, /^Suggested by the CRM/);
  assert.match(note, /has not confirmed/);
});

test("dates saved on a quote read as proposed: saving is not agreement", () => {
  const note = paymentDatesNote("agreed");
  assert.match(note, /^Proposed dates saved on this quote/);
  assert.match(note, /does not record whether the school has agreed/);
});

test("editing a date changes no label: the note follows the source, not the date", () => {
  const before = paymentDatesNote("suggested");
  const edited = termDatesProblem(2, [new Date(2027, 1, 15), new Date(2027, 5, 20)]);
  assert.equal(edited, null);
  assert.equal(paymentDatesNote("suggested"), before);
});

test("no screen can claim agreement: there is no confirmed state to show", () => {
  const files = [
    "src/components/invoices/quote-conversion-dialog.tsx",
    "src/components/payment-terms/term-dates-card.tsx",
  ];
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(source, /=== "agreed"/, file);
    assert.doesNotMatch(source, /[Aa]greed (date|on)|were agreed|was agreed/, file);
  }
  assert.equal(paymentDatesNote("suggested").startsWith("Agreed"), false);
  assert.equal(paymentDatesNote("agreed").startsWith("Agreed"), false);
});

test("conversion still needs the person to confirm the schedule", () => {
  const dialog = readFileSync(
    "src/components/invoices/quote-conversion-dialog.tsx",
    "utf8",
  );
  assert.match(dialog, /Confirm Schedule and Create Invoice/);
  assert.match(dialog, /No invoice is created until you/);
});

test("audit times read in Harare, wherever the browser is", () => {
  assert.equal(harareTime("2026-10-28T07:27:18.714Z"), "28 Oct 2026, 09:27:18 Harare");
  assert.equal(harareTime("2026-11-02T06:45:27.997Z"), "02 Nov 2026, 08:45:27 Harare");
});

test("a UTC time near midnight lands on the correct Harare day", () => {
  assert.equal(harareTime("2026-10-05T22:30:00Z"), "06 Oct 2026, 00:30:00 Harare");
});

test("an unreadable time shows nothing rather than a wrong one", () => {
  assert.equal(harareTime("not a date"), "");
});

test("date filters are whole Harare days", () => {
  assert.equal(
    new Date(harareDayBound("2026-11-02", "start")).toISOString(),
    "2026-11-01T22:00:00.000Z",
  );
  assert.equal(
    new Date(harareDayBound("2026-11-02", "end")).toISOString(),
    "2026-11-02T21:59:59.999Z",
  );
});

test("the source says only what is recorded", () => {
  assert.equal(auditSourceLabel("user"), "Signed-in user");
  assert.equal(auditSourceLabel("script"), "System script");
  assert.equal(auditSourceLabel(undefined), "");
});

test("the audit page stays gated and filters on the server", () => {
  const page = readFileSync("src/pages/admin/audit-log-page.tsx", "utf8");
  assert.match(page, /useAnyRole\(\["admin", "admin_support", "sales_manager"\]\)/);
  assert.doesNotMatch(page, /logs\.filter\(/);
  assert.match(page, /category,\s+\.\.\.filters/);
  assert.doesNotMatch(page, /toLocaleString\(\)\}\s*<\/span>\s*<\/div>/);
});

// EBI-FOCUS-002. The eight EBI invoices as staging holds them. 0090 and 0102 are the
// parents; each total already contains its instalments.
const ebi = [
  { id: "0090", invoice_number: "INV-2026-0090", status: "Cancelled", total: 7800, amount_paid: 0, is_summary_invoice: true, parent_invoice_id: null },
  { id: "0091", invoice_number: "INV-2026-0091", status: "Draft", total: 3900, amount_paid: 0, parent_invoice_id: "0090", parent_status: "Cancelled", parent_invoice_number: "INV-2026-0090" },
  { id: "0092", invoice_number: "INV-2026-0092", status: "Cancelled", total: 3900, amount_paid: 0, parent_invoice_id: "0090", parent_status: "Cancelled" },
  { id: "0093", invoice_number: "INV-2026-0093", status: "Cancelled", total: 7800, amount_paid: 0, parent_invoice_id: null },
  { id: "0102", invoice_number: "INV-2026-0102", status: "Draft", total: 7800, amount_paid: 0, is_summary_invoice: true, parent_invoice_id: null },
  { id: "0103", invoice_number: "INV-2026-0103", status: "Cancelled", total: 3900, amount_paid: 0, parent_invoice_id: "0102", parent_status: "Draft" },
  { id: "0104", invoice_number: "INV-2026-0104", status: "Draft", total: 3900, amount_paid: 0, parent_invoice_id: "0102", parent_status: "Draft" },
  { id: "0105", invoice_number: "INV-2026-0105", status: "Partially-Paid", total: 7800, amount_paid: 3900, parent_invoice_id: null },
];
const leads = (families: Array<{ lead: { id: string } }>) => families.map((f) => f.lead.id);

test("EBI groups into four families with every invoice accounted for once", () => {
  const families = groupInvoiceFamilies(ebi);
  assert.deepEqual(leads(families), ["0090", "0093", "0102", "0105"]);
  assert.deepEqual(families[0].children.map((c) => c.id), ["0091", "0092"]);
  assert.deepEqual(families[2].children.map((c) => c.id), ["0103", "0104"]);
  const seen = families.flatMap((f) => [f.lead.id, ...f.children.map((c) => c.id)]);
  assert.equal(new Set(seen).size, ebi.length);
  assert.equal(seen.length, ebi.length);
});

test("a standalone invoice gets no invented instalments", () => {
  const family = groupInvoiceFamilies(ebi).find((f) => f.lead.id === "0105");
  assert.deepEqual(family?.children, []);
  assert.deepEqual(family?.warnings, []);
});

test("parent totals alone are the sale, never parent plus children", () => {
  const live = groupInvoiceFamilies(ebi).filter((f) => f.lead.status !== "Cancelled");
  assert.deepEqual(leads(live), ["0102", "0105"]);
  assert.equal(live.find((f) => f.lead.id === "0102")?.lead.total, 7800);
  const allChildren = ebi.filter((i) => i.parent_invoice_id === "0102");
  assert.equal(allChildren.reduce((sum, i) => sum + i.total, 0), 7800);
});

test("a live instalment under a cancelled parent is flagged, and only that", () => {
  const families = groupInvoiceFamilies(ebi);
  assert.deepEqual(families.flatMap((f) => f.warnings), [
    "INV-2026-0091 is Draft under a cancelled parent. It needs review.",
  ]);
});

test("the views keep whole families and drop none from All", () => {
  const families = groupInvoiceFamilies(ebi);
  const inView = (view: "issued" | "drafts" | "cancelled" | "all") =>
    leads(families.filter((f) => familyInView(f, view)));
  assert.deepEqual(inView("issued"), ["0105"]);
  assert.deepEqual(inView("drafts"), ["0090", "0102"]);
  assert.deepEqual(inView("cancelled"), ["0090", "0093", "0102"]);
  assert.deepEqual(inView("all"), ["0090", "0093", "0102", "0105"]);
});

test("an instalment whose parent is outside the list still shows", () => {
  const families = groupInvoiceFamilies(ebi.filter((i) => i.id === "0091"));
  assert.deepEqual(leads(families), ["0091"]);
});

test("cancelled invoices are muted and lose their payment badge", () => {
  assert.equal(invoiceRowTone({ status: "Cancelled" }), "opacity-60");
  assert.equal(invoiceRowTone({ status: "Draft" }), "");
  assert.equal(showPaymentBadge({ status: "Cancelled" }), false);
  assert.equal(showPaymentBadge({ status: "Draft" }), false);
  assert.equal(showPaymentBadge({ status: "Partially-Paid" }), true);
});

test("the Instalments tab names 0105 as having no schedule, and nothing else", () => {
  const withRows = new Set(["0104"]);
  assert.deepEqual(
    invoicesWithoutSchedule(ebi, withRows).map((i) => i.invoice_number),
    ["INV-2026-0105"],
  );
});

test("a fully paid invoice with no schedule needs no note", () => {
  const paid = [{ ...ebi[7], amount_paid: 7800 }];
  assert.deepEqual(invoicesWithoutSchedule(paid, new Set()), []);
});

test("every status has exactly one view, and a Draft is never Issued", () => {
  for (const status of INVOICE_STATUSES) {
    const homes = INVOICE_VIEWS.filter((v) => v !== "all" && statusInView(status, v));
    assert.equal(homes.length, 1, status);
  }
  assert.equal(statusInView("Draft", "issued"), false);
  for (const status of ["Sent", "Partially-Paid", "Paid", "Overdue"]) {
    assert.equal(statusInView(status, "issued"), true, status);
  }
  assert.equal(INVOICE_VIEW_LABELS.issued, "Issued / Current");
});

test("each EBI record keeps its own status through grouping", () => {
  const byId = new Map(
    groupInvoiceFamilies(ebi).flatMap((f) => [f.lead, ...f.children]).map((i) => [i.id, i.status]),
  );
  assert.equal(byId.get("0105"), "Partially-Paid");
  assert.equal(byId.get("0102"), "Draft");
  assert.equal(byId.get("0091"), "Draft");
  assert.equal(byId.get("0104"), "Draft");
  for (const id of ["0090", "0092", "0093", "0103"]) assert.equal(byId.get(id), "Cancelled");
});

test("a Draft shows Not issued rather than a balance, and its amount stays", () => {
  assert.equal(outstandingLabel({ status: "Draft" }), "Not issued");
  assert.equal(outstandingLabel({ status: "Cancelled" }), "—");
  assert.equal(outstandingLabel({ status: "Partially-Paid" }), null);
  assert.equal(ebi.find((i) => i.id === "0102")?.total, 7800);
});

test("an issued instalment under a Draft parent is flagged too", () => {
  const families = groupInvoiceFamilies([
    { id: "p", invoice_number: "INV-2026-0068", status: "Draft", parent_invoice_id: null },
    { id: "c", invoice_number: "INV-2026-0070", status: "Paid", parent_invoice_id: "p", parent_status: "Draft" },
  ]);
  assert.deepEqual(families[0].warnings, [
    "INV-2026-0070 is Paid under a Draft parent. It needs review.",
  ]);
});

test("the parent is named on a surfaced instalment", () => {
  assert.equal(invoiceFamilyNote(ebi[1]), "Parent INV-2026-0090 cancelled");
  assert.equal(
    invoiceFamilyNote({ status: "Draft", parent_status: "Draft", parent_invoice_number: "INV-2026-0102" }),
    "Instalment of INV-2026-0102",
  );
  assert.equal(invoiceFamilyNote({ status: "Draft", parent_status: "Cancelled" }), "Parent invoice cancelled");
});

test("a Draft instalment is part of the debt once its parent is issued", () => {
  assert.equal(isUnissuedDraft({ status: "Draft" }), true);
  assert.equal(isUnissuedDraft({ status: "Draft", parent_status: "Draft" }), true);
  assert.equal(isUnissuedDraft({ status: "Draft", parent_status: "Cancelled" }), true);
  for (const parent_status of ["Sent", "Partially-Paid", "Overdue", "Paid"]) {
    assert.equal(isUnissuedDraft({ status: "Draft", parent_status }), false, parent_status);
  }
  assert.equal(isUnissuedDraft({ status: "Sent" }), false);
});

test("a Draft instalment of an issued parent shows its balance, not Not issued", () => {
  assert.equal(outstandingLabel({ status: "Draft", parent_status: "Partially-Paid" }), null);
  assert.equal(outstandingLabel({ status: "Draft", parent_status: "Draft" }), "Not issued");
});

test("EBI on the instalment tab: an issued parent's Draft child counts as owed", () => {
  const invoices = new Map([
    ["c", { status: "Draft", parent_status: "Partially-Paid" }],
    ["d", { status: "Draft", parent_status: "Draft" }],
  ]);
  assert.deepEqual(
    splitInstalmentBalances(
      [{ invoice_id: "c", balance: 2400 }, { invoice_id: "d", balance: 3900 }],
      invoices,
    ),
    { issued: 2400, draft: 3900 },
  );
});

test("the trail says when it is not production", () => {
  assert.match(auditEnvironmentNote("staging") ?? "", /staging system, not production/);
  assert.equal(auditEnvironmentNote("production"), null);
  assert.equal(auditEnvironmentNote(undefined), null);
});

test("EBI's instalment tab counts 0104 as Draft, not as owed, and keeps the balance", () => {
  const invoices = new Map(ebi.map((i) => [i.id, i]));
  assert.deepEqual(
    splitInstalmentBalances([{ invoice_id: "0104", balance: "3900.00" }], invoices),
    { issued: 0, draft: 3900 },
  );
});

test("the history link opens the Audit Trail on that invoice", () => {
  assert.equal(
    invoiceHistoryPath("INV-2026-0104"),
    "/admin/audit-log?category=financial&record=INV-2026-0104",
  );
});
