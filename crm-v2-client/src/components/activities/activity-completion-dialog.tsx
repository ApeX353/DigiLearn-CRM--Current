import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { useActivityCompletionStore } from "~/stores/use-activity-completion-store";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { Button } from "~/components/ui/button";
import { Textarea } from "~/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Label } from "~/components/ui/label";
import { Badge } from "~/components/ui/badge";
import {
  ACTIVITY_OUTCOMES,
  ACTIVITY_OUTCOME_LABELS,
  type ActivityOutcome,
  useUpdateActivityStatus,
} from "~/api/activities";
import { getActivityChip, getActivityLabel } from "~/lib/activity-visuals";
import { toast } from "sonner";

/**
 * Mounted once at the app root. Reads from the activity-completion
 * queue (populated via `useActivityCompletionStore.request(...)`)
 * and forces the user to capture an outcome before the activity is
 * actually persisted as done.
 *
 * Enforcement:
 *
 *   - The dialog CANNOT be dismissed without recording an outcome:
 *     Esc, outside-click, the close affordance, and the onOpenChange
 *     handler all refuse to close the dialog when it's open.
 *   - "Save" requires a selected outcome; button is disabled until
 *     the user picks one.
 *   - Only "Cancel" unwinds — the callsite's `onCancelled` callback
 *     fires and the activity stays open.
 *
 * Server enforces the same rule independently (`UpdateStatusDto`
 * + service `BadRequestException`), so even a malicious client that
 * bypassed this dialog can't land a completion without outcome.
 */
const DEFAULT_OUTCOME: ActivityOutcome = "successful";

export function ActivityCompletionDialog() {
  const queue = useActivityCompletionStore((s) => s.queue);
  const dequeue = useActivityCompletionStore((s) => s.dequeue);
  const updateStatus = useUpdateActivityStatus();

  const head = queue[0] ?? null;
  const sourceActivity = head?.activity ?? null;

  const [outcome, setOutcome] = useState<ActivityOutcome>(DEFAULT_OUTCOME);
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!sourceActivity) return;
    setOutcome(DEFAULT_OUTCOME);
    setNote("");
  }, [sourceActivity]);

  if (!sourceActivity || !head) return null;

  const onCancel = () => {
    head.onCancelled?.();
    dequeue();
  };

  const onSubmit = async () => {
    if (!outcome) {
      toast.error("Pick an outcome before saving.");
      return;
    }
    try {
      const updated = await updateStatus.mutateAsync({
        id: sourceActivity.id,
        status: "completed",
        outcome,
        completionNote: note.trim() || undefined,
      });
      head.onCompleted?.(updated);
      toast.success("Activity marked done");
      dequeue();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not mark activity done";
      toast.error(message);
    }
  };

  const recordContext = (() => {
    const parts: string[] = [];
    if (sourceActivity.lead?.lead_name) {
      parts.push(`Lead: ${sourceActivity.lead.lead_name}`);
    }
    const dealName =
      sourceActivity.deal?.deal_name ?? sourceActivity.deal?.title;
    if (dealName) parts.push(`Deal: ${dealName}`);
    return parts.join("  •  ");
  })();

  return (
    <Dialog
      open
      onOpenChange={(nextOpen) => {
        // Never let Radix auto-close this dialog. The only exits are
        // the explicit Cancel / Save buttons below so the outcome
        // rule can't be bypassed.
        if (!nextOpen) {
          // no-op
        }
      }}
    >
      <DialogContent
        className="sm:max-w-lg"
        onEscapeKeyDown={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            Record the outcome
          </DialogTitle>
          <DialogDescription>
            Marking a{" "}
            <Badge
              variant="outline"
              className={getActivityChip(sourceActivity.type)}
            >
              {getActivityLabel(sourceActivity.type)}
            </Badge>{" "}
            as done:{" "}
            <span className="font-medium">{sourceActivity.subject}</span>
            {recordContext && (
              <span className="mt-1 block text-xs text-muted-foreground">
                {recordContext}
              </span>
            )}
            <span className="mt-2 block text-xs font-medium text-amber-700 dark:text-amber-400">
              An outcome is required for every completed activity — it
              becomes part of the record's audit trail.
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="completion-outcome">Outcome</Label>
            <Select
              value={outcome}
              onValueChange={(v) => setOutcome(v as ActivityOutcome)}
            >
              <SelectTrigger id="completion-outcome">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ACTIVITY_OUTCOMES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {ACTIVITY_OUTCOME_LABELS[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="completion-note">Notes (optional)</Label>
            <Textarea
              id="completion-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Anything worth noting about how this went."
              rows={3}
            />
          </div>
        </div>

        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-between">
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            onClick={onSubmit}
            disabled={!outcome || updateStatus.isPending}
          >
            {updateStatus.isPending ? "Saving…" : "Mark done"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
