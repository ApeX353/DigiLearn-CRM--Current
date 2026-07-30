import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Loader2,
  ShieldCheck,
  AlertTriangle,
  ArrowLeft,
  FileSpreadsheet,
} from "lucide-react";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  useImportBatches,
  useImportBatch,
  useApproveImportBatch,
  useRejectImportBatch,
  useUpdateImportDecisions,
  type PendingImportRow,
} from "~/api/leads/import-batches";

function dupText(row: PendingImportRow): string | null {
  if (row.status === "invalid") return row.invalidReason ?? "invalid";
  if (!row.duplicate) return null;
  switch (row.duplicate.kind) {
    case "existing-school":
      return "duplicate — school already exists";
    case "existing-lead":
      return "duplicate — lead already exists";
    case "within-batch":
      return "duplicate — repeated in this file";
  }
}

/** Review one staged batch: per-row include/skip, then approve or reject. */
function BatchDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const { data: batch, isLoading } = useImportBatch(id);
  const approve = useApproveImportBatch();
  const reject = useRejectImportBatch();
  const setDecisions = useUpdateImportDecisions();
  // Local overrides keyed by rowNumber; falls back to the row's stored decision.
  const [overrides, setOverrides] = useState<Record<number, "approve" | "skip">>(
    {},
  );

  const rows = batch?.rows ?? [];
  const decisionOf = (r: PendingImportRow): "approve" | "skip" =>
    overrides[r.rowNumber] ?? r.decision;
  const approveCount = useMemo(
    () => rows.filter((r) => decisionOf(r) === "approve").length,
    [rows, overrides],
  );

  const busy = approve.isPending || reject.isPending || setDecisions.isPending;

  const toggle = (r: PendingImportRow) => {
    if (r.status === "invalid") return; // can never be approved
    setOverrides((o) => ({
      ...o,
      [r.rowNumber]: decisionOf(r) === "approve" ? "skip" : "approve",
    }));
  };

  const onApprove = async () => {
    try {
      const decisions = rows.map((r) => ({
        rowNumber: r.rowNumber,
        decision: decisionOf(r),
      }));
      await setDecisions.mutateAsync({ id, decisions });
      const res = await approve.mutateAsync(id);
      toast.success(res.message ?? "Import approved");
      onBack();
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? "Could not approve the batch");
    }
  };

  const onReject = async () => {
    try {
      await reject.mutateAsync(id);
      toast.success("Import rejected — nothing was created");
      onBack();
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? "Could not reject the batch");
    }
  };

  if (isLoading || !batch) {
    return (
      <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading batch…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="mr-1 h-4 w-4" /> Back
          </Button>
          <span className="font-medium">{batch.filename ?? "Import"}</span>
          {batch.campaign?.name && (
            <Badge variant="secondary">{batch.campaign.name}</Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">
            {approveCount} of {batch.total_rows} will be created
          </span>
          <Button variant="outline" size="sm" onClick={onReject} disabled={busy}>
            Reject
          </Button>
          <Button
            size="sm"
            onClick={onApprove}
            disabled={busy || approveCount === 0}
            data-testid="import-approve"
          >
            {busy ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <ShieldCheck className="mr-1 h-4 w-4" />
            )}
            Approve ({approveCount})
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto rounded border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="p-2">School</th>
              <th className="p-2">Province</th>
              <th className="p-2">Contact</th>
              <th className="p-2">Flag</th>
              <th className="p-2 text-right">Decision</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const flag = dupText(r);
              const decision = decisionOf(r);
              return (
                <tr key={r.rowNumber} className="border-t">
                  <td className="p-2 font-medium">{r.schoolName}</td>
                  <td className="p-2 text-muted-foreground">
                    {r.province ?? "—"}
                  </td>
                  <td className="p-2 text-muted-foreground">
                    {[r.contactFirst, r.contactLast].filter(Boolean).join(" ") ||
                      "—"}
                  </td>
                  <td className="p-2">
                    {flag ? (
                      <span className="inline-flex items-center gap-1 text-amber-700">
                        <AlertTriangle className="h-3.5 w-3.5" /> {flag}
                      </span>
                    ) : (
                      <span className="text-green-700">ok</span>
                    )}
                  </td>
                  <td className="p-2 text-right">
                    <Button
                      variant={decision === "approve" ? "default" : "outline"}
                      size="sm"
                      disabled={r.status === "invalid"}
                      onClick={() => toggle(r)}
                    >
                      {r.status === "invalid"
                        ? "Skip"
                        : decision === "approve"
                          ? "Include"
                          : "Skip"}
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        Duplicates and invalid rows are set to <strong>Skip</strong> by default.
        Toggle a row to <strong>Include</strong> it. Nothing is created until
        you approve.
      </p>
    </div>
  );
}

/** The "Import approvals" section of the manager Approval Queue. */
export function ImportApprovalsQueue() {
  const { data: batches = [], isLoading } = useImportBatches();
  const [openId, setOpenId] = useState<string | null>(null);

  if (openId) return <BatchDetail id={openId} onBack={() => setOpenId(null)} />;

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading imports…
      </div>
    );
  }
  if (batches.length === 0) {
    return (
      <div className="py-10 text-center text-sm text-muted-foreground">
        No imports waiting for approval. Use <strong>Import Leads</strong> on the
        Leads page (or inside a campaign) to stage one.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {batches.map((b) => (
        <button
          key={b.id}
          onClick={() => setOpenId(b.id)}
          className="flex w-full items-center justify-between rounded border p-3 text-left hover:bg-muted/40"
          data-testid="import-batch-row"
        >
          <div className="flex items-center gap-3">
            <FileSpreadsheet className="h-5 w-5 text-muted-foreground" />
            <div>
              <div className="font-medium">{b.filename ?? "Import"}</div>
              <div className="text-xs text-muted-foreground">
                by{" "}
                {[b.uploaded_by?.first_name, b.uploaded_by?.last_name]
                  .filter(Boolean)
                  .join(" ") || "—"}
                {b.campaign?.name ? ` · ${b.campaign.name}` : ""}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge className="bg-green-100 text-green-800">
              {b.importable_count} ready
            </Badge>
            {b.duplicate_count > 0 && (
              <Badge className="bg-amber-100 text-amber-800">
                {b.duplicate_count} dup
              </Badge>
            )}
            <Badge variant="secondary">{b.total_rows} rows</Badge>
          </div>
        </button>
      ))}
    </div>
  );
}
