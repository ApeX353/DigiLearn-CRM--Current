import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { apiClientAuth } from "../axios";
import type { Paginated, PaginationParams } from "../common-api-type";
import type {
  Activity,
  ActivityComment,
  ActivityType,
  ActivityStatus,
  CreateActivityCommentDto,
  CreateActivityDto,
  UpdateActivityDto,
  LeadActivityStats,
} from "./types";
import { leadsKeys } from "../leads";
import { useActivityCompletionStore } from "~/stores/use-activity-completion-store";
import { shouldRequireFollowUp } from "~/lib/follow-up-policy";

/**
 * Extra query knobs surfaced by the activities page redesign. They map
 * 1:1 onto the additive QueryActivityDto fields on the backend, so the
 * existing /activities endpoint stays the only entry point.
 *
 * - due_from / due_to: filter on COALESCE(due_at, scheduled_at) — used
 *   by the date-context tabs (Overdue, Today, This week, …).
 * - open_only: hides completed + cancelled — used by the "To-do" tab.
 */
/**
 * Follow-up scheduled by the server in the same transaction as a
 * completion — mirrors NextStepPayloadDto. The server copies lead/deal/
 * contact/assignee from the source activity, so only the work itself is
 * described here.
 */
export type NextStepPayload = {
  type: ActivityType;
  subject: string;
  due_at: string;
  description?: string;
};

/**
 * The two "one line of communication" knobs on a completion, mirroring
 * UpdateStatusDto:
 *  - nextStepExistingId: the record's next step is ALREADY planned — point
 *    at that open dated activity instead of creating another row.
 *  - alsoComplete: sibling open activities this same conversation settled;
 *    the server closes them in the same transaction with the same outcome.
 */
export type CompletionLinks = {
  nextStepExistingId?: string;
  alsoComplete?: string[];
};

export type ActivityListQuery = PaginationParams & {
  type?: ActivityType;
  status?: ActivityStatus;
  lead_id?: string;
  deal_id?: string;
  contact_id?: string;
  /**
   * Indirect filter — backend joins on lead.school_id so every
   * activity tied to any of the school's leads surfaces in one query.
   */
  school_id?: string;
  assigned_to_id?: string;
  is_pinned?: boolean;
  /**
   * Created-date window used by our line's Activities page filters.
   * His file predates them.
   */
  created_from?: string;
  created_to?: string;
  search?: string;
  due_from?: string;
  due_to?: string;
  open_only?: boolean;
  include_details?: boolean;
  /**
   * Result ordering.
   *
   * - `recent` (the API default): newest-logged first. Correct for a record
   *   page, where the feed is read as a history of what happened.
   * - `work_queue`: what to do next, first. Open work above closed, most
   *   overdue at the top, undated last. Correct for the Activities module,
   *   which is a to-do list rather than a diary.
   *
   * Ordering is applied server-side because the list is paginated — sorting
   * in the browser would only ever reorder the 50 rows that happened to load.
   */
  sort?: "recent" | "work_queue";
};

export const activitiesKeys = {
  all: ["activities"] as const,
  lists: () => [...activitiesKeys.all, "list"] as const,
  list: (params: ActivityListQuery) =>
    [...activitiesKeys.lists(), params] as const,
  byId: (id: string) => [...activitiesKeys.all, "detail", id] as const,
  leadStatsRoot: () => [...activitiesKeys.all, "lead-stats"] as const,
  leadStats: (leadId: string) =>
    [...activitiesKeys.leadStatsRoot(), leadId] as const,
};

function unwrapData<T>(payload: unknown): T {
  if (
    payload &&
    typeof payload === "object" &&
    "data" in payload &&
    (payload as { data?: unknown }).data !== undefined
  ) {
    return (payload as { data: T }).data;
  }
  return payload as T;
}

// The API returns the WhatsApp subtype under `whatsapp_message`, but the
// Activity type and every view read `whatsapp`. Without this mapping the
// "WhatsApp Details" section (incl. the full message) never renders and only
// the 40-char subject preview shows. Map it so the full message is displayed.
function normalizeActivity<T extends Activity | null | undefined>(activity: T): T {
  const a = activity as
    | (Activity & { whatsapp_message?: Activity["whatsapp"] })
    | null
    | undefined;
  if (a && !a.whatsapp && a.whatsapp_message) {
    a.whatsapp = a.whatsapp_message;
  }
  return activity;
}

const api = {
  getAll: (
    params: ActivityListQuery,
  ): Promise<Paginated<Activity[]>> =>
    apiClientAuth.get("/activities", { params }).then((r) => {
      const page = r.data as Paginated<Activity[]>;
      page.data?.forEach(normalizeActivity);
      return page;
    }),

  getById: (id: string): Promise<Activity> =>
    apiClientAuth
      .get(`/activities/${id}`)
      .then((r) => normalizeActivity(unwrapData<Activity>(r.data))),

  create: (data: CreateActivityDto): Promise<Activity> =>
    apiClientAuth
      .post("/activities", data)
      .then((r) => unwrapData<Activity>(r.data)),

  update: async (id: string, data: UpdateActivityDto): Promise<Activity> => {
    try {
      const response = await apiClientAuth.put(`/activities/${id}`, data);
      return unwrapData<Activity>(response.data);
    } catch (error) {
      if (
        isAxiosError(error) &&
        (error.response?.status === 404 || error.response?.status === 405)
      ) {
        const fallbackResponse = await apiClientAuth.patch(
          `/activities/${id}`,
          data,
        );
        return unwrapData<Activity>(fallbackResponse.data);
      }
      throw error;
    }
  },

  remove: (id: string): Promise<void> =>
    apiClientAuth.delete(`/activities/${id}`).then((r) => r.data),

  addComment: (
    id: string,
    data: CreateActivityCommentDto,
  ): Promise<ActivityComment> =>
    apiClientAuth
      .post(`/activities/${id}/comments`, data)
      .then((r) => unwrapData<ActivityComment>(r.data)),

  updateStatus: (
    id: string,
    status: ActivityStatus,
    outcome?: import("./types").ActivityOutcome,
    completionNote?: string,
    nextStep?: NextStepPayload,
    links?: CompletionLinks,
  ): Promise<Activity> =>
    apiClientAuth
      .patch(`/activities/${id}/status`, {
        status,
        outcome,
        completion_note: completionNote,
        // Scheduled server-side in the same request as the completion, so
        // the rep can never end up completed-but-not-scheduled if the
        // browser dies between the two steps.
        next_step: nextStep,
        next_step_existing_id: links?.nextStepExistingId,
        also_complete: links?.alsoComplete?.length
          ? links.alsoComplete
          : undefined,
      })
      .then((r) => unwrapData<Activity>(r.data)),

  bulkUpdateStatus: (
    ids: string[],
    status: ActivityStatus,
    outcome?: import("./types").ActivityOutcome,
    completionNote?: string,
  ): Promise<BulkStatusResult> =>
    apiClientAuth
      .patch(`/activities/bulk-status`, {
        ids,
        status,
        outcome,
        completion_note: completionNote,
      })
      .then((r) => ({
        updated: (r.data?.data ?? []) as Activity[],
        followUpCandidates: (r.data?.followUpCandidates ?? []) as Activity[],
      })),

  getLeadStats: (leadId: string): Promise<LeadActivityStats> =>
    apiClientAuth
      .get(`/activities/leads/${leadId}/stats`)
      .then((r) => unwrapData<LeadActivityStats>(r.data)),
};

/**
 * Imperative read of one activity WITH its lead/deal relations — what the
 * close-the-loop policy needs (terminal-record checks) and what a bare
 * create response does not carry.
 */
export const fetchActivityById = (id: string): Promise<Activity> =>
  api.getById(id);

export interface BulkStatusResult {
  updated: Activity[];
  /**
   * The subset of `updated` activities that qualify for a follow-up
   * prompt — currently meetings, calls, and tasks that were just
   * marked completed. The frontend uses this to decide whether to
   * surface the follow-up prompt dialog.
   */
  followUpCandidates: Activity[];
}

export function useActivityList(
  params: ActivityListQuery & { enabled?: boolean },
) {
  const { enabled, ...queryParams } = params;
  return useQuery({
    queryKey: activitiesKeys.list(queryParams),
    queryFn: () => api.getAll(queryParams),
    staleTime: 5 * 60 * 1000,
    enabled: enabled !== undefined ? enabled : true,
  });
}

export function useActivity(id: string) {
  return useQuery({
    queryKey: activitiesKeys.byId(id),
    queryFn: () => api.getById(id),
    enabled: !!id,
  });
}

export function useCreateActivity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateActivityDto) => api.create(data),
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: activitiesKeys.all });
      qc.invalidateQueries({ queryKey: leadsKeys.all });
      qc.invalidateQueries({
        queryKey: leadsKeys.byId(variables.lead_id ?? variables.deal_id ?? ""),
      });
    },
  });
}

export function useUpdateActivity() {
  const qc = useQueryClient();
  const requestCompletion = useActivityCompletionStore((s) => s.request);
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateActivityDto }) =>
      api.update(id, data),
    onSuccess: (updatedActivity, variables) => {
      // Read the pre-update value BEFORE overwriting the cache so we can
      // tell a genuine completion TRANSITION from an unrelated edit.
      const previous = qc.getQueryData<Activity>(
        activitiesKeys.byId(variables.id),
      );
      const wasCompleted =
        previous?.status === "completed" || Boolean(previous?.completed_at);

      qc.setQueryData(activitiesKeys.byId(variables.id), updatedActivity);
      qc.invalidateQueries({
        queryKey: activitiesKeys.byId(variables.id),
        exact: true,
      });
      qc.invalidateQueries({ queryKey: activitiesKeys.lists() });
      qc.invalidateQueries({ queryKey: activitiesKeys.leadStatsRoot() });

      // A generic update can also flip an activity to completed —
      // e.g. editing a task and setting task.status = "done" in the
      // sheet. Apply the same auto-enqueue as the dedicated status
      // mutation so no completion site can skip the discipline rule.
      //
      // Only on the TRANSITION though. This used to fire whenever the
      // saved activity came back completed, which meant every autosave on
      // an already-completed record re-opened the follow-up dialog — once
      // per keystroke-blur on the document view. `previous` being absent
      // (cold cache) is treated as "not completed" so a real completion
      // still prompts.
      const isCompleted =
        updatedActivity.status === "completed" ||
        Boolean(updatedActivity.completed_at);
      if (isCompleted && !wasCompleted && shouldRequireFollowUp(updatedActivity)) {
        requestCompletion({ activity: updatedActivity, stage: "next-step" });
      }
    },
  });
}

export function useDeleteActivity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: activitiesKeys.all }),
  });
}

export function useAddActivityComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: CreateActivityCommentDto;
    }) => api.addComment(id, data),
    onSuccess: (createdComment, variables) => {
      qc.setQueryData<Activity | undefined>(
        activitiesKeys.byId(variables.id),
        (current) => {
          if (!current) return current;
          return {
            ...current,
            comments: [...(current.comments ?? []), createdComment],
          };
        },
      );

      qc.invalidateQueries({
        queryKey: activitiesKeys.byId(variables.id),
        exact: true,
      });
    },
  });
}

export function useLeadActivityStats(leadId: string) {
  return useQuery({
    queryKey: activitiesKeys.leadStats(leadId),
    queryFn: () => api.getLeadStats(leadId),
    staleTime: 5 * 60 * 1000,
    enabled: !!leadId,
  });
}

/**
 * Single-item status update. Kept next to the bulk hook so consumers
 * can import both from one place.
 *
 * Centralised CRM-discipline hook-point: when the updated activity
 * resolves to status === "completed" (or carries a `completed_at`),
 * we auto-enqueue it into the follow-up prompt store with a
 * `required` flag decided by `shouldRequireFollowUp`. Every
 * completion site (list row, inspector sheet, planned card, bulk
 * bar) therefore gets the exact same "log the next step" behaviour
 * without having to remember to wire it in locally.
 */
export function useUpdateActivityStatus() {
  const qc = useQueryClient();
  const requestCompletion = useActivityCompletionStore((s) => s.request);
  return useMutation({
    mutationFn: ({
      id,
      status,
      outcome,
      completionNote,
      nextStep,
      links,
    }: {
      id: string;
      status: ActivityStatus;
      outcome?: import("./types").ActivityOutcome;
      completionNote?: string;
      /** Follow-up scheduled atomically with the completion, server-side. */
      nextStep?: NextStepPayload;
      /** "Already planned" / "also covered" links — see CompletionLinks. */
      links?: CompletionLinks;
      /**
       * Set by the close-the-loop dialog, which has already walked the
       * user through the next-step decision — suppresses the safety-net
       * re-enqueue below so completing from the dialog can't re-open it.
       */
      loopHandled?: boolean;
    }) =>
      api.updateStatus(id, status, outcome, completionNote, nextStep, links),
    onSuccess: (updated, variables) => {
      qc.setQueryData(activitiesKeys.byId(updated.id), updated);
      qc.invalidateQueries({ queryKey: activitiesKeys.lists() });
      qc.invalidateQueries({ queryKey: activitiesKeys.leadStatsRoot() });
      // Safety net for completion paths that did NOT run through the
      // close-the-loop dialog (e.g. programmatic callers): the record
      // still needs its next-step decision, so enqueue the dialog at
      // the next-step stage.
      // Status alone, NOT completed_at: on reopen the status flips back
      // to scheduled, and keying on a (possibly stale) completed_at made
      // reopening summon the un-dismissable next-step dialog.
      if (
        !variables.loopHandled &&
        !variables.nextStep &&
        !variables.links?.nextStepExistingId &&
        updated.status === "completed" &&
        shouldRequireFollowUp(updated)
      ) {
        requestCompletion({ activity: updated, stage: "next-step" });
      }
    },
  });
}

/**
 * Bulk status update. The response's `followUpCandidates` array is what
 * drives the Section 1 "capture next step" prompt — the mutation itself
 * is status-agnostic, the UI layer decides whether to show the dialog.
 */
export function useBulkUpdateActivityStatus() {
  const qc = useQueryClient();
  const requestCompletion = useActivityCompletionStore((s) => s.request);
  return useMutation({
    mutationFn: ({
      ids,
      status,
      outcome,
      completionNote,
    }: {
      ids: string[];
      status: ActivityStatus;
      outcome?: import("./types").ActivityOutcome;
      completionNote?: string;
    }) => api.bulkUpdateStatus(ids, status, outcome, completionNote),
    onSuccess: (result) => {
      for (const activity of result.updated) {
        qc.setQueryData(activitiesKeys.byId(activity.id), activity);
      }
      qc.invalidateQueries({ queryKey: activitiesKeys.lists() });
      qc.invalidateQueries({ queryKey: activitiesKeys.leadStatsRoot() });
      // Bulk-done: enqueue every follow-up candidate with its own
      // required flag. A bulk action that spans both active and
      // terminal records therefore queues required prompts for the
      // active ones and skippable prompts for the terminal ones.
      // Each active record in the batch still needs its own next-step
      // decision — outcomes can be batched, futures can't. Queue one
      // next-step-stage dialog per candidate; the store de-dupes by id.
      for (const activity of result.followUpCandidates) {
        if (shouldRequireFollowUp(activity)) {
          requestCompletion({ activity, stage: "next-step" });
        }
      }
    },
  });
}
