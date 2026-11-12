import type { ActivityLog } from "~/api/activity-logs";

/**
 * Stage and value changes, pulled out of the changelog so they can sit on
 * the same timeline as activities.
 *
 * This is harder than it looks because the server writes these rows from
 * five different code paths with five different key vocabularies:
 *
 *   deals.updateStage / drag-drop  { stage: "<stage name>" }
 *   deals PATCH /:id               { stage, value, currency, … } merged into ONE row
 *   deals.bulkUpdate               { stage_id, status: "<stage name>", snapshot: {…} }  — no `stage`
 *   deals.closeDeal                { closeStatus: "won" | "lost", lostReason }
 *   leads status transition        { status: "New" → "Contacted" }
 *
 * And lead `update` rows are not diffs at all — both sides carry the WHOLE
 * lead entity (~25 keys plus nested `school` / `primary_contact` objects).
 * Reading those naively would flood the feed with "updated_at changed".
 *
 * So rather than diffing everything, we whitelist the handful of fields a
 * rep actually cares about seeing in a timeline, and only emit a row when
 * the value genuinely changed between the two sides. That one rule makes
 * the full-entity lead blobs harmless: 24 of their 25 keys are identical,
 * so they produce nothing.
 */

export type TimelineChangeField = "stage" | "value" | "close";

export interface TimelineChange {
  /** Stable per (log, field) so React keys don't collide on merged rows. */
  id: string;
  at: string;
  field: TimelineChangeField;
  label: string;
  from: string | null;
  to: string;
  actor?: string;
}

/** Fields worth showing, and which kind of change each represents. */
const WATCHED: { keys: string[]; field: TimelineChangeField; label: string }[] = [
  // `status` covers BOTH a lead's status and a deal's stage name (bulkUpdate
  // writes the stage name under `status`). `stage` is the deal path.
  { keys: ["stage", "status"], field: "stage", label: "Stage" },
  { keys: ["value", "estimated_value"], field: "value", label: "Value" },
  { keys: ["closeStatus", "close_status"], field: "close", label: "Deal" },
];

function readable(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  // Nested objects (`school`, `primary_contact`, bulkUpdate's `snapshot`)
  // are never meaningful as a timeline label.
  if (typeof value === "object") return null;
  return String(value);
}

/**
 * Turn one changelog row into zero or more timeline entries. A single deal
 * PATCH can legitimately produce two — a stage move AND a value change —
 * because the server folds them into the same row.
 */
function changesFromLog(log: ActivityLog): TimelineChange[] {
  // `create` rows describe the record coming into existence, which the
  // record page already says. `delete` rows have nothing to show.
  if (log.action !== "update") return [];

  const oldValues = (log.old_values ?? {}) as Record<string, unknown>;
  const newValues = (log.new_values ?? {}) as Record<string, unknown>;
  if (!Object.keys(newValues).length) return [];

  const actor = [log.user?.first_name, log.user?.last_name]
    .filter(Boolean)
    .join(" ")
    .trim();

  const out: TimelineChange[] = [];

  for (const watch of WATCHED) {
    // Take the first key from this group that the row actually carries, so
    // `stage` and `status` never both fire for the same underlying move.
    const key = watch.keys.find((k) => k in newValues);
    if (!key) continue;

    const to = readable(newValues[key]);
    const from = readable(oldValues[key]);
    if (to === null) continue;
    if (from === to) continue; // the full-entity lead blobs die here

    out.push({
      id: `${log.id}:${watch.field}`,
      at: log.created_at,
      field: watch.field,
      label: watch.label,
      from,
      to,
      actor: actor || undefined,
    });
  }

  return out;
}

export function extractTimelineChanges(
  logs: ActivityLog[] | undefined,
): TimelineChange[] {
  if (!logs?.length) return [];
  return logs.flatMap(changesFromLog);
}

/** "10,000" / "30,000" — values arrive as raw numbers or numeric strings. */
export function formatChangeValue(
  change: TimelineChange,
  formatCurrency: (n: number) => string,
): { from: string | null; to: string } {
  if (change.field !== "value") {
    return { from: change.from, to: change.to };
  }
  const asMoney = (v: string | null) => {
    if (v === null) return null;
    const n = Number(v);
    return Number.isFinite(n) ? formatCurrency(n) : v;
  };
  return { from: asMoney(change.from), to: asMoney(change.to) as string };
}
