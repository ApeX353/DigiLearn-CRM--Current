import { useEffect, useRef } from "react";
import { useAllLeadReversalRequests } from "~/api/lead-reversal-requests";
import { useAssignmentProposals } from "~/api/assignment-proposals";
import { useImportBatches } from "~/api/leads/import-batches";

/** Short chime when the approval count goes up (something new came in). */
function chime() {
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ctx = new Ctx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g);
    g.connect(ctx.destination);
    o.type = "sine";
    o.frequency.value = 880;
    g.gain.setValueAtTime(0.07, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
    o.start();
    o.stop(ctx.currentTime + 0.35);
  } catch {
    /* audio not available — badge still updates silently */
  }
}

/**
 * Live counter on the Approval Queue nav item. Counts everything waiting on a
 * manager: pending auto-assign proposals + pending review requests + the
 * ROWS across pending import batches (so 360 imported leads read as 360, not
 * 1 batch). Beeps when the total rises.
 */
export function ApprovalNavBadge() {
  const reversals = useAllLeadReversalRequests({
    status: "pending",
    limit: 500,
  });
  const proposals = useAssignmentProposals("pending");
  const batches = useImportBatches();

  const importRows = (batches.data ?? []).reduce(
    (sum, b) => sum + (b.total_rows ?? 0),
    0,
  );
  const count =
    (reversals.data?.length ?? 0) +
    (proposals.data?.length ?? 0) +
    importRows;

  const prev = useRef<number | null>(null);
  useEffect(() => {
    if (prev.current !== null && count > prev.current) chime();
    prev.current = count;
  }, [count]);

  if (count <= 0) return null;
  return (
    <span
      className="ml-auto min-w-5 rounded-full bg-primary px-1.5 text-center text-[11px] font-semibold leading-5 text-primary-foreground"
      data-testid="approval-nav-count"
    >
      {count > 999 ? "999+" : count}
    </span>
  );
}
