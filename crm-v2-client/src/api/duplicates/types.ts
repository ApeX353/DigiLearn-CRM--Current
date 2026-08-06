export const DUPLICATE_RECORD_TYPES = ["lead", "school", "contact"] as const;
export type DuplicateRecordType = (typeof DUPLICATE_RECORD_TYPES)[number];

export const DUPLICATE_SUSPICION_STATUSES = [
  "pending",
  "merged",
  "kept_separate",
  "false_positive",
] as const;
export type DuplicateSuspicionStatus =
  (typeof DUPLICATE_SUSPICION_STATUSES)[number];

export interface DuplicateSignal {
  kind: string;
  weight: number;
  detail?: string | null;
}

export interface DuplicateCandidate<T = any> {
  record: T;
  score: number;
  signals: DuplicateSignal[];
}

export interface DuplicateSuspicion {
  id: string;
  record_type: DuplicateRecordType;
  new_record_id: string;
  existing_record_id: string;
  /** DUP-NAMES: human names resolved server-side (null if the record is gone). */
  new_record_name?: string | null;
  existing_record_name?: string | null;
  score: number;
  signals: DuplicateSignal[];
  status: DuplicateSuspicionStatus;
  raised_by_id: string | null;
  raised_by?: {
    id: string;
    first_name?: string;
    last_name?: string;
    email?: string;
  } | null;
  reviewed_by_id: string | null;
  reviewed_by?: {
    id: string;
    first_name?: string;
    last_name?: string;
    email?: string;
  } | null;
  reviewed_at: string | null;
  review_note: string | null;
  created_at: string;
  updated_at: string;
}

export const SIGNAL_LABELS: Record<string, string> = {
  phone_exact: "Phone matches",
  email_exact: "Email matches",
  whatsapp_exact: "WhatsApp matches",
  name_exact: "Name matches",
  name_near_exact: "Name almost identical",
  name_fuzzy: "Name similar",
  same_school: "Same school",
  same_contact: "Same primary contact",
  same_district: "Same district",
  same_city: "Same city",
  same_province: "Same province",
};

export function describeSignal(s: DuplicateSignal): string {
  const base = SIGNAL_LABELS[s.kind] ?? s.kind.replace(/_/g, " ");
  return s.detail ? `${base} (${s.detail})` : base;
}
