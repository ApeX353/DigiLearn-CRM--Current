import { create } from "zustand";
import type { Activity } from "~/api/activities";

/**
 * Close-the-loop queue.
 *
 * Every "mark done" click in the CRM routes through here: the callsite
 * pushes the activity it wants to complete, the dialog mounted at the app
 * shell picks it up and walks the rep through BOTH halves of the loop —
 * what happened (outcome + note) and what happens next (schedule a step,
 * or decide the record: nurture / disqualify / lost).
 *
 * Nothing is saved until both halves are answered: the dialog collects
 * first and commits in one atomic request. That is why the dialog can
 * always be cancelled — bailing out leaves the activity open rather than
 * half-completed.
 *
 * `stage` exists for the after-the-fact paths (bulk remainders, generic
 * PATCHes that flipped status to completed): the outcome is already
 * stored, only the next-step decision is missing, so the dialog opens at
 * step 2 and cannot be dismissed until the record has a future.
 */
export interface CompletionRequest {
  activity: Activity;
  /**
   * Where the dialog starts. "outcome" (default) = full two-step loop on
   * a still-open activity. "next-step" = the activity is ALREADY
   * completed and only the follow-up decision is outstanding.
   */
  stage?: "outcome" | "next-step";
  /**
   * Optional resolver fired after the completion mutation succeeds.
   * Useful for callsites that need to flip local UI state (spinner
   * off, clear selection, toast, etc.) once the round-trip lands.
   */
  onCompleted?: (completed: Activity) => void | Promise<unknown>;
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
      if (seen.has(req.activity.id)) {
        // Dropped as a duplicate — but the callsite still deserves its
        // resolution, otherwise its local pending state (row spinners,
        // selection) leaks forever.
        req.onCancelled?.();
        return;
      }
      set((state) => ({ queue: [...state.queue, req] }));
    },
    dequeue: () => set((state) => ({ queue: state.queue.slice(1) })),
    clear: () => set({ queue: [] }),
  }),
);
