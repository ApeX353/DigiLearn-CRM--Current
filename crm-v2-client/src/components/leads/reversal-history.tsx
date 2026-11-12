import { useState } from "react";
import { Undo2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { Badge } from "~/components/ui/badge";
import type { LeadReversalRequest } from "~/api/lead-reversal-requests/types";

/**
 * How many times this lead's status was reversed, and what each reversal did.
 *
 * This started as a full-width block on the lead page listing every field of
 * the latest decision. A long reason ran to several lines and pushed the actual
 * lead work off screen — the owner's words: "that panel is too big its blocking
 * live important data". The evidence still has to be reachable (it records
 * whether an invoice survived a reversal), so it is a count here and the detail
 * behind a click.
 */

const fullName = (
  actor?: { first_name?: string | null; last_name?: string | null; email?: string | null } | null,
  fallback = "Not recorded",
) =>
  [actor?.first_name, actor?.last_name].filter(Boolean).join(" ") ||
  actor?.email ||
  fallback;

const when = (value?: string | null) => {
  if (!value) return "Not recorded";
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? "Not recorded"
    : d.toLocaleString(undefined, {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
};

export function ReversalHistory({
  requests,
}: {
  /** Decided status reversals, newest first. */
  requests: LeadReversalRequest[];
}) {
  const [open, setOpen] = useState(false);
  if (!requests.length) return null;

  const n = requests.length;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-left text-sm text-foreground underline decoration-dotted underline-offset-4 hover:decoration-solid focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
      >
        {n} {n === 1 ? "reversal" : "reversals"}
        <span className="block text-xs text-muted-foreground no-underline">
          See what was kept
        </span>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Undo2 className="h-4 w-4" />
              Reversal history
            </DialogTitle>
            <DialogDescription>
              Every decided status reversal on this lead, newest first, and what
              happened to the records attached to it.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {requests.map((r) => {
              const approved = r.status === "approved";
              return (
                <div key={r.id} className="rounded-md border p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={approved ? "default" : "secondary"}>
                      {approved ? "Approved" : "Rejected"}
                    </Badge>
                    {r.requested_status && (
                      <span className="text-muted-foreground">
                        back to{" "}
                        <span className="text-foreground">
                          {r.requested_status}
                        </span>
                      </span>
                    )}
                    <span className="ml-auto text-xs text-muted-foreground">
                      {when(r.reviewed_at ?? r.approved_at ?? r.rejected_at)}
                    </span>
                  </div>

                  <dl className="mt-3 grid gap-x-4 gap-y-1.5 sm:grid-cols-[auto_1fr] text-sm">
                    <dt className="text-muted-foreground">Requested by</dt>
                    <dd>{fullName(r.requested_by)}</dd>

                    <dt className="text-muted-foreground">Decided by</dt>
                    <dd>
                      {fullName(
                        r.reviewed_by ?? r.approved_by ?? r.rejected_by,
                      )}
                    </dd>

                    <dt className="text-muted-foreground">Reason</dt>
                    <dd className="whitespace-pre-wrap">
                      {r.reason || "Not recorded"}
                    </dd>
                  </dl>

                  {/* The point of the whole feature: a reversal used to delete
                      the deal's invoices and cascade away their payments. It
                      now keeps them, and this line is the proof of what
                      survived. */}
                  {r.review_note && (
                    <div className="mt-3 rounded-sm bg-muted/50 p-2.5">
                      <div className="text-xs text-muted-foreground">
                        What happened to the records
                      </div>
                      <div className="mt-0.5 whitespace-pre-wrap">
                        {r.review_note}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
