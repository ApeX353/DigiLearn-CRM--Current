type AuditValues = Record<string, unknown> | null | undefined;

export interface ReadableAuditChange {
  field: string;
  from: string;
  to: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const ENTITY_NAMES: Record<string, string> = {
  activity: "Activity", campaign: "Campaign", contact: "Contact", deal: "Deal",
  invoice: "Invoice", lead: "Lead", product: "Product", quote: "Quote",
  school: "School", task: "Task", user: "User",
};

const FIELD_NAMES: Record<string, string> = {
  actioned_by: "Performed by", assigned_to: "Owner", assigned_to_id: "Owner",
  closed_at: "Closed on", completed_at: "Completed on", current_stage: "Stage",
  current_stage_id: "Stage", due_at: "Due date", due_date: "Due date",
  first_name: "First name", last_name: "Last name", lead_name: "Lead name",
  next_action_at: "Next action due", primary_contact_id: "Primary contact",
  quote_number: "Quote number", invoice_number: "Invoice number",
  scheduled_at: "Scheduled for", school_id: "School", source_campaign_id: "Campaign",
  status: "Status", type: "Type",
};

const SNAPSHOT_FIELDS = new Set([
  "lead_name", "title", "name", "invoice_number", "quote_number", "subject",
  "status", "source", "type", "email", "phone", "assigned_to", "assigned_to_id",
  "due_at", "due_date", "scheduled_at",
]);

const HIDDEN_FIELDS = new Set(["id", "created_at", "updated_at", "deleted_at", "version"]);
const RECORD_KEYS = ["lead", "deal", "school", "invoice", "quote", "activity", "task", "contact", "user"];

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normaliseEntity(entity: string) {
  return entity.trim().toLowerCase().replace(/[_\s-]+/g, "_");
}

function trim(value: string, limit = 160) {
  return value.length > limit ? `${value.slice(0, limit - 1)}...` : value;
}

function nameFromObject(value: Record<string, unknown>): string | null {
  const direct = [value.lead_name, value.title, value.name, value.invoice_number, value.quote_number, value.subject, value.email]
    .find((candidate) => typeof candidate === "string" && candidate.trim());
  if (typeof direct === "string") return trim(direct.trim());

  const firstName = typeof value.first_name === "string" ? value.first_name.trim() : "";
  const lastName = typeof value.last_name === "string" ? value.last_name.trim() : "";
  if (firstName || lastName) return trim([firstName, lastName].filter(Boolean).join(" "));

  for (const key of RECORD_KEYS) {
    const nested = value[key];
    if (isObject(nested)) {
      const label = nameFromObject(nested);
      if (label) return label;
    }
  }
  return null;
}

function snapshotFor(entity: string, values: AuditValues): AuditValues {
  if (!values) return values;
  const entityKey = normaliseEntity(entity);
  const singular = entityKey.endsWith("s") ? entityKey.slice(0, -1) : entityKey;
  const nested = values[singular] ?? values[entityKey];
  return isObject(nested) ? nested : values;
}

function comparable(value: unknown) {
  return JSON.stringify(value);
}

export function entityName(entity: string) {
  const normalised = normaliseEntity(entity);
  return ENTITY_NAMES[normalised] ?? normalised.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function fieldName(field: string) {
  const normalised = normaliseEntity(field);
  return FIELD_NAMES[normalised] ?? normalised.replace(/_id$/, "").replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function formatAuditValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "Not set";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return new Intl.NumberFormat().format(value);
  if (typeof value === "string") {
    if (UUID.test(value)) return "Changed";
    const date = new Date(value);
    if (/^\d{4}-\d{2}-\d{2}(T|\s)/.test(value) && !Number.isNaN(date.getTime())) return date.toLocaleString();
    return trim(value);
  }
  if (Array.isArray(value)) {
    const labels = value.map((item) => isObject(item) ? nameFromObject(item) : formatAuditValue(item))
      .filter((item): item is string => Boolean(item) && item !== "Changed");
    return labels.length ? trim(labels.join(", ")) : `${value.length} item${value.length === 1 ? "" : "s"}`;
  }
  if (isObject(value)) return nameFromObject(value) ?? "Details updated";
  return trim(String(value));
}

export function recordLabel(entity: string, oldValues: AuditValues, newValues: AuditValues) {
  const after = snapshotFor(entity, newValues);
  const before = snapshotFor(entity, oldValues);
  return (isObject(after) && nameFromObject(after)) || (isObject(before) && nameFromObject(before)) || null;
}

export function readableAuditChanges(entity: string, oldValues: AuditValues, newValues: AuditValues, action?: string): ReadableAuditChange[] {
  const before = snapshotFor(entity, oldValues) ?? {};
  const after = snapshotFor(entity, newValues) ?? {};
  const keys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)]));
  const isSnapshot = action === "create" || action === "delete";

  return keys
    .filter((key) => !HIDDEN_FIELDS.has(key) && !/(password|token|secret|hash)/i.test(key))
    .filter((key) => !isSnapshot || SNAPSHOT_FIELDS.has(key))
    .map((key) => ({ field: fieldName(key), from: formatAuditValue(before[key]), to: formatAuditValue(after[key]), changed: comparable(before[key]) !== comparable(after[key]) }))
    .filter((change) => change.changed)
    .slice(0, 8)
    .map(({ field, from, to }) => ({ field, from, to }));
}

const HARARE_TIME = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Africa/Harare",
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

/** Every audit time reads in Harare, wherever the browser is. */
export function harareTime(value: string | Date) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : `${HARARE_TIME.format(date)} Harare`;
}

/** A Harare calendar day as a moment, for the date filters. */
export function harareDayBound(day: string, edge: "start" | "end") {
  return `${day}T${edge === "start" ? "00:00:00.000" : "23:59:59.999"}+02:00`;
}

/** Where the action came from, as far as the row can say. */
/** Said on the trail anywhere but production, so copied history is never taken for the real thing. */
export const auditEnvironmentNote = (environment?: string) =>
  !environment || environment === "production"
    ? null
    : `This is the ${environment} system, not production. Its records began as a copy of production, and anything after that copy happened here only.`;

export function auditSourceLabel(source?: string) {
  if (source === "script") return "System script";
  if (source === "user") return "Signed-in user";
  return source ?? "";
}
