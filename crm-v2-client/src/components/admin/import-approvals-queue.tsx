import { useMemo, useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import {
  Loader2,
  ShieldCheck,
  AlertTriangle,
  ArrowLeft,
  FileSpreadsheet,
  ChevronRight,
  ChevronDown,
  Folder,
  CalendarDays,
} from "lucide-react";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  useImportBatches,
  useImportBatch,
  useApproveImportBatch,
  useRejectImportBatch,
  useUpdateImportDecisions,
  useSetImportRowRegion,
  type ImportBatch,
  type PendingImportRow,
} from "~/api/leads/import-batches";

/** Best-effort date label; accepts an ISO datetime or a YYYY-MM-DD date. */
function fmtDate(d?: string | null): string | null {
  if (!d) return null;
  const parsed = new Date(d);
  return Number.isNaN(parsed.getTime()) ? null : format(parsed, "MMM d, yyyy");
}

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
  const setRegion = useSetImportRowRegion();
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

  const busy =
    approve.isPending ||
    reject.isPending ||
    setDecisions.isPending ||
    setRegion.isPending;

  // R3: rows the source left as "peri urban" (or any un-mappable region) can't
  // be admitted until a manager classifies them urban/rural. Block approval
  // while any remain, so nothing is silently dropped.
  const unresolvedRegion = rows.some((r) => r.needsRegion);

  const toggle = (r: PendingImportRow) => {
    if (r.status === "invalid") return; // can never be approved
    setOverrides((o) => ({
      ...o,
      [r.rowNumber]: decisionOf(r) === "approve" ? "skip" : "approve",
    }));
  };

  const chooseRegion = async (
    r: PendingImportRow,
    region: "urban" | "rural",
  ) => {
    try {
      await setRegion.mutateAsync({ id, rowNumber: r.rowNumber, region });
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? "Could not set the region");
    }
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
            disabled={busy || approveCount === 0 || unresolvedRegion}
            title={
              unresolvedRegion
                ? "Classify every peri-urban row (urban or rural) first"
                : undefined
            }
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

      {unresolvedRegion && (
        <div className="flex items-center gap-2 rounded border border-amber-300 bg-amber-50 p-2 text-sm text-amber-800">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          Some rows arrived as <strong>peri-urban</strong>, which the system
          can't store. Choose <strong>urban</strong> or <strong>rural</strong>{" "}
          on each before approving.
        </div>
      )}

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
                    {r.needsRegion ? (
                      <span
                        className="inline-flex items-center gap-1 text-amber-700"
                        title={r.invalidReason}
                      >
                        <AlertTriangle className="h-3.5 w-3.5" /> peri-urban —
                        classify to include
                      </span>
                    ) : flag ? (
                      <span className="inline-flex items-center gap-1 text-amber-700">
                        <AlertTriangle className="h-3.5 w-3.5" /> {flag}
                      </span>
                    ) : (
                      <span className="text-green-700">ok</span>
                    )}
                  </td>
                  <td className="p-2 text-right">
                    {r.needsRegion ? (
                      <div className="inline-flex items-center gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={busy}
                          onClick={() => chooseRegion(r, "urban")}
                        >
                          Urban
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={busy}
                          onClick={() => chooseRegion(r, "rural")}
                        >
                          Rural
                        </Button>
                      </div>
                    ) : (
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
                    )}
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

/** One staged batch, as a clickable row that opens its detail. */
function BatchRow({ b, onOpen }: { b: ImportBatch; onOpen: () => void }) {
  return (
    <button
      onClick={onOpen}
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
            {fmtDate(b.created_at) ? ` · ${fmtDate(b.created_at)}` : ""}
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
  );
}

interface CampaignFolder {
  key: string;
  title: string;
  /** Campaign entry date, else the (earliest) batch submission date. */
  date: string | null;
  batches: ImportBatch[];
  leadCount: number;
  readyCount: number;
  dupCount: number;
}

const NO_CAMPAIGN_KEY = "__none__";

/** R7: group staged batches into one folder per campaign so leads from
 *  different campaigns/batches stay visually separate, not mixed. */
function groupIntoFolders(batches: ImportBatch[]): CampaignFolder[] {
  const byKey = new Map<string, CampaignFolder>();
  for (const b of batches) {
    const key = b.campaign?.id ?? NO_CAMPAIGN_KEY;
    let folder = byKey.get(key);
    if (!folder) {
      folder = {
        key,
        title: b.campaign?.name ?? "No campaign / batch",
        // A campaign folder carries the campaign's entry date; the loose
        // "no campaign" folder shows each batch's own date on its row.
        date: b.campaign?.entry_date ?? null,
        batches: [],
        leadCount: 0,
        readyCount: 0,
        dupCount: 0,
      };
      byKey.set(key, folder);
    }
    folder.batches.push(b);
    folder.leadCount += b.total_rows ?? 0;
    folder.readyCount += b.importable_count ?? 0;
    folder.dupCount += b.duplicate_count ?? 0;
    // Fall back to the earliest batch submission date when the campaign has
    // no entry date (or there is no campaign).
    if (!b.campaign?.entry_date && b.created_at) {
      if (!folder.date || b.created_at < folder.date) folder.date = b.created_at;
    }
  }
  // Real campaigns first, the loose folder last.
  return [...byKey.values()].sort((a, b) =>
    a.key === NO_CAMPAIGN_KEY ? 1 : b.key === NO_CAMPAIGN_KEY ? -1 : 0,
  );
}

/** The "Import approvals" section of the manager Approval Queue. */
export function ImportApprovalsQueue() {
  const { data: batches = [], isLoading } = useImportBatches();
  const [openId, setOpenId] = useState<string | null>(null);
  // Folders are collapsed by default; expanding shows the batches inside.
  const [openFolders, setOpenFolders] = useState<Record<string, boolean>>({});

  const folders = useMemo(() => groupIntoFolders(batches), [batches]);

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

  const totalRows = batches.reduce((s, b) => s + (b.total_rows ?? 0), 0);
  const totalReady = batches.reduce((s, b) => s + (b.importable_count ?? 0), 0);
  const totalDup = batches.reduce((s, b) => s + (b.duplicate_count ?? 0), 0);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2 rounded-lg border bg-muted/30 p-2 text-sm">
        <Badge variant="secondary">{batches.length} batch{batches.length === 1 ? "" : "es"}</Badge>
        <Badge variant="secondary">{totalRows} rows</Badge>
        <Badge className="bg-green-100 text-green-800">{totalReady} ready</Badge>
        <Badge className="bg-amber-100 text-amber-800">{totalDup} duplicate{totalDup === 1 ? "" : "s"}</Badge>
      </div>
      {folders.map((f) => {
        const open = !!openFolders[f.key];
        const date = fmtDate(f.date);
        return (
          <div key={f.key} className="rounded border">
            <button
              onClick={() =>
                setOpenFolders((o) => ({ ...o, [f.key]: !o[f.key] }))
              }
              className="flex w-full items-center justify-between gap-2 p-3 text-left hover:bg-muted/40"
              aria-expanded={open}
              data-testid="import-campaign-folder"
            >
              <div className="flex min-w-0 items-center gap-2">
                {open ? (
                  <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                )}
                <Folder className="h-5 w-5 shrink-0 text-muted-foreground" />
                <span className="truncate font-medium">{f.title}</span>
                {date && (
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <CalendarDays className="h-3.5 w-3.5" /> {date}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Badge className="bg-green-100 text-green-800">
                  {f.readyCount} ready
                </Badge>
                {f.dupCount > 0 && (
                  <Badge className="bg-amber-100 text-amber-800">
                    {f.dupCount} dup
                  </Badge>
                )}
                <Badge variant="secondary">
                  {f.leadCount} lead{f.leadCount === 1 ? "" : "s"}
                </Badge>
              </div>
            </button>
            {open && (
              <div className="space-y-2 border-t p-2">
                {f.batches.map((b) => (
                  <BatchRow key={b.id} b={b} onOpen={() => setOpenId(b.id)} />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
