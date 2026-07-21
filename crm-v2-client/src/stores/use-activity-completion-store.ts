import { create } from "zustand";
import type { Activity } from "~/api/activities";

/**
 * Completion-outcome capture queue.
 *
 * Every "mark done" click in the CRM routes through here: the
 * callsite pushes the activity it wants to complete, a dialog
 * mounted at the app shell picks it up, forces the user to record
 * an outcome (+ optional note), then calls the real status mutation
 * with those fields attached.
 *
 * Keeping this centralised means every completion path — list row,
 * planned card, inspector sheet, bulk bar, task sheet — goes
 * through the same dialog and the same validation instead of each
 * page rolling its own "did we capture the outcome?" check.
 */
export interface CompletionRequest {
  activity: Activity;
  /**
   * Optional resolver fired after the completion mutation succeeds.
   * Useful for callsites that need to flip local UI state (spinner
   * off, clear selection, toast, etc.) once the round-trip lands.
   */
  onCompleted?: (completed: Activity) => void;
  /** Optional resolver fired when the user bails out of the dialog. */
  onCancelled?: () => void;
}

interface ActivityCompletionState {
  queue: CompletionRequest[];
  /** Push one completion request (duplicates by activity id are dropped). */
  request: (req: CompletionRequest) => void;
  /** Remove the head — called after success or cancel. */
  dequeue: () => void;
  clear: () => void;
}

export const useActivityCompletionStore = create<ActivityCompletionState>(
  (set, get) => ({
    queue: [],
    request: (req) => {
      const seen = new Set(get().queue.map((r) => r.activity.id));
      if (seen.has(req.activity.id)) return;
      set((state) => ({ queue: [...state.queue, req] }));
    },
    dequeue: () => set((state) => ({ queue: state.queue.slice(1) })),
    clear: () => set({ queue: [] }),
  }),
);
