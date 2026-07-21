import { create } from "zustand";
import type { Activity } from "~/api/activities";

/**
 * Queue of completed-activity → next-step prompts.
 *
 * Every entry is tagged `required`:
 *
 *   required = true  → CRM discipline rule: the user MUST log a
 *                      follow-up activity before leaving the record.
 *                      Skip buttons hidden, dialog cannot be
 *                      dismissed, route changes are blocked.
 *   required = false → historical / bulk-done context where the
 *                      business rule doesn't apply (terminal record,
 *                      bulk-done convenience, follow-up already
 *                      attached elsewhere). Legacy "skip / skip all"
 *                      behaviour.
 *
 * Required-ness is decided at enqueue time by the caller — typically
 * the activity-status mutation hook, which looks at the parent
 * lead/deal state.
 */
export interface FollowUpPromptEntry {
  activity: Activity;
  required: boolean;
}

interface FollowUpPromptState {
  queue: FollowUpPromptEntry[];
  /** Any queued entry currently marked required — used by the guard. */
  hasRequired: () => boolean;
  /**
   * Push one activity. When `required` is true the user cannot skip
   * or leave the record until a follow-up is created.
   */
  enqueue: (activity: Activity, opts?: { required?: boolean }) => void;
  /** Push many at once — bulk-mark-done path. */
  enqueueMany: (
    entries: Array<{ activity: Activity; required: boolean }>,
  ) => void;
  /** Remove the head item — called after a follow-up is created or skipped. */
  dequeue: () => void;
  /** Wipe the entire queue (logout, terminal record, explicit skip-all). */
  clear: () => void;
  /** Drop only entries that are not required — used by skip-all. */
  clearOptional: () => void;
}

export const useFollowUpPromptStore = create<FollowUpPromptState>(
  (set, get) => ({
    queue: [],

    hasRequired: () => get().queue.some((entry) => entry.required),

    enqueue: (activity, opts) => {
      const required = opts?.required ?? false;
      const existing = new Set(get().queue.map((entry) => entry.activity.id));
      if (existing.has(activity.id)) return;
      set((state) => ({
        queue: [...state.queue, { activity, required }],
      }));
    },

    enqueueMany: (entries) => {
      const existing = new Set(get().queue.map((entry) => entry.activity.id));
      const fresh = entries.filter(
        (entry) => !existing.has(entry.activity.id),
      );
      if (!fresh.length) return;
      set((state) => ({ queue: [...state.queue, ...fresh] }));
    },

    dequeue: () =>
      set((state) => ({
        queue: state.queue.slice(1),
      })),

    clear: () => set({ queue: [] }),

    clearOptional: () =>
      set((state) => ({
        queue: state.queue.filter((entry) => entry.required),
      })),
  }),
);
