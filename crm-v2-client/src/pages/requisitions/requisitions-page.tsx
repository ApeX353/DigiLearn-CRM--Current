import { useState } from "react";
import { Link } from "react-router";
import { format } from "date-fns";
import { Inbox, ListChecks, PieChart, Loader2 } from "lucide-react";
import Container from "~/components/container";
import PageHeader from "~/components/page-header";
import { Badge } from "~/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "~/components/ui/tabs";
import {
  useCashRequisitions,
  useCostToCloseReport,
  STATUS_LABELS,
  type CashRequisition,
} from "~/api/cash-requisitions";
import { useAnyRole } from "~/hooks/use-permission";

const money = (amount: string | number, currency: string) =>
  `${currency} ${Number(amount).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

function RequisitionTable({
  rows,
  emptyText,
}: {
  rows: CashRequisition[];
  emptyText: string;
}) {
  if (rows.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">{emptyText}</p>;
  }
  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-3 py-2">Raised</th>
            <th className="px-3 py-2">Requester</th>
            <th className="px-3 py-2">Linked to</th>
            <th className="px-3 py-2">Reason</th>
            <th className="px-3 py-2 text-right">Total</th>
            <th className="px-3 py-2">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((req) => (
            <tr key={req.id} className="hover:bg-muted/30" data-testid="requisitions-row">
              <td className="px-3 py-2 whitespace-nowrap">
                <Link to={`/requisitions/${req.id}`} className="text-primary underline-offset-2 hover:underline">
                  {format(new Date(req.created_at), "MMM d, yyyy")}
                </Link>
              </td>
              <td className="px-3 py-2 whitespace-nowrap">
                {req.requested_by
                  ? `${req.requested_by.first_name} ${req.requested_by.last_name}`
                  : "—"}
              </td>
              <td className="max-w-[180px] truncate px-3 py-2">
                {req.deal?.title ??
                  req.lead?.lead_name ??
                  req.campaign?.name ??
                  "—"}
              </td>
              <td className="max-w-[240px] truncate px-3 py-2" title={req.reason}>
                {req.reason}
              </td>
              <td className="px-3 py-2 text-right font-medium whitespace-nowrap">
                {money(req.total_amount, req.currency)}
              </td>
              <td className="px-3 py-2">
                <Badge variant="outline">{STATUS_LABELS[req.status]}</Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CostToCloseTab() {
  const { data, isLoading } = useCostToCloseReport();
  if (isLoading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  const section = (
    label: string,
    rows: NonNullable<typeof data>["won"],
    totals: NonNullable<typeof data>["totals"]["won"],
    hint: string,
  ) => (
    <div className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold">{label}</h3>
        <div className="flex gap-3 text-xs text-muted-foreground">
          {totals.length === 0
            ? "No spend"
            : totals.map((t) => (
                <span key={t.currency} data-testid={`ctc-total-${label}-${t.currency}`}>
                  {t.currency}: paid {money(t.paid, t.currency)} · committed{" "}
                  {money(t.committed, t.currency)}
                </span>
              ))}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{hint}</p>
      {rows.length === 0 ? (
        <p className="rounded-md border px-3 py-4 text-sm text-muted-foreground">
          No closed deals with costs yet.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Deal</th>
                <th className="px-3 py-2 text-right">Deal value</th>
                <th className="px-3 py-2">Cost currency</th>
                <th className="px-3 py-2 text-right">Paid</th>
                <th className="px-3 py-2 text-right">Committed</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((r) => (
                <tr key={`${r.deal_id}-${r.currency}`}>
                  <td className="px-3 py-2">
                    <Link
                      to={`/deals/${r.deal_id}`}
                      className="text-primary underline-offset-2 hover:underline"
                    >
                      {r.title}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    {money(r.deal_value, r.deal_currency)}
                  </td>
                  <td className="px-3 py-2">{r.currency}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    {money(r.paid, r.currency)}
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    {money(r.committed, r.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      {data &&
        section(
          "Won deals — acquisition cost",
          data.won,
          data.totals.won,
          "What it actually cost to win each deal. Paid = money out the door; committed also counts requisitions still in the approval pipeline.",
        )}
      {data &&
        section(
          "Lost deals — sunk cost",
          data.lost,
          data.totals.lost,
          "Money spent chasing deals that were lost.",
        )}
    </div>
  );
}

export default function RequisitionsPage() {
  const isApprover = useAnyRole(["admin", "manager", "sales_manager", "finance"]);
  const [tab, setTab] = useState(isApprover ? "inbox" : "all");

  const { data: inboxData, isLoading: inboxLoading } = useCashRequisitions({
    awaiting: "true",
    limit: 50,
  });
  const { data: allData, isLoading: allLoading } = useCashRequisitions({
    limit: 50,
  });

  const inbox = inboxData?.data ?? [];
  const all = allData?.data ?? [];

  return (
    <Container>
      <PageHeader
        title="Cash Requisitions"
        subtitle="Deal and lead costs: pre-approvals, reimbursements, and the approval chain."
      />
      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList>
          {isApprover && (
            <TabsTrigger value="inbox" data-testid="tab-inbox">
              <Inbox className="mr-1.5 h-4 w-4" />
              Approvals inbox {inbox.length > 0 && `(${inbox.length})`}
            </TabsTrigger>
          )}
          <TabsTrigger value="all" data-testid="tab-all">
            <ListChecks className="mr-1.5 h-4 w-4" />
            {isApprover ? "All requisitions" : "My requisitions"}
          </TabsTrigger>
          {isApprover && (
            <TabsTrigger value="report" data-testid="tab-report">
              <PieChart className="mr-1.5 h-4 w-4" />
              Cost to close
            </TabsTrigger>
          )}
        </TabsList>

        {isApprover && (
          <TabsContent value="inbox">
            {inboxLoading ? (
              <div className="flex justify-center py-10">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <RequisitionTable
                rows={inbox}
                emptyText="Nothing is waiting on you. New submissions land here."
              />
            )}
          </TabsContent>
        )}

        <TabsContent value="all">
          {allLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <RequisitionTable rows={all} emptyText="No requisitions yet." />
          )}
        </TabsContent>

        {isApprover && (
          <TabsContent value="report">
            <CostToCloseTab />
          </TabsContent>
        )}
      </Tabs>
    </Container>
  );
}
