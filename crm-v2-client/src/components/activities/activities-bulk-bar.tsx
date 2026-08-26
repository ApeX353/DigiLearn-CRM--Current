import { CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "~/components/ui/button";

/**
 * Sticky bulk-action bar shown above the activities feed when at least
 * one row is selected. Single primary action — "Mark done" — matching
 * the canonical sales-tool pattern. Anything else lives in the
 * inspector.
 *
 * (Extracted from the retired activities-list-view table, which the
 * timeline feed replaced.)
 */
export function ActivitiesBulkBar({
  count,
  onMarkDone,
  onClear,
  pending,
}: {
  count: number;
  onMarkDone: () => void;
  onClear: () => void;
  pending: boolean;
}) {
  if (count === 0) return null;
  return (
    <div className="sticky top-0 z-20 mb-3 flex items-center justify-between rounded-md border bg-primary/5 px-3 py-2 text-sm shadow-sm">
      <span className="font-medium">{count} selected</span>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="ghost" onClick={onClear}>
          Clear
        </Button>
        <Button size="sm" onClick={onMarkDone} disabled={pending}>
          {pending ? (
            <>
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              Marking…
            </>
          ) : (
            <>
              <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
              Mark done
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
