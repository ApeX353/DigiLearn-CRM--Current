import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Copy, Eye, X } from "lucide-react";
import { Card, CardContent } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { Badge } from "~/components/ui/badge";
import {
  describeSignal,
  usePeekLeadDuplicates,
  usePeekSchoolDuplicates,
  usePeekContactDuplicates,
  type DuplicateCandidate,
  type DuplicateSignal,
} from "~/api/duplicates";

type Kind = "lead" | "school" | "contact";

interface BaseProps {
  /** Live form values used to peek — component debounces internally. */
  enabled?: boolean;
  className?: string;
  /**
   * DUP3: notify the parent whenever the peek result changes, so a
   * create form can gate its submit on a likely duplicate (require an
   * explicit confirm-to-proceed) without re-running the peek itself.
   * Fires with the current flagged candidates (empty array when none).
   * Pass a stable callback (useCallback) to avoid extra renders.
   */
  onCandidatesChange?: (candidates: DuplicateCandidate[]) => void;
}

interface LeadProps extends BaseProps {
  kind: "lead";
  value: {
    lead_name?: string;
    school_id?: string | null;
    primary_contact_id?: string | null;
    phone?: string | null;
    email?: string | null;
  };
}

interface SchoolProps extends BaseProps {
  kind: "school";
  value: {
    name?: string;
    city?: string | null;
    district?: string | null;
    province?: string | null;
  };
}

interface ContactProps extends BaseProps {
  kind: "contact";
  value: {
    first_name?: string;
    last_name?: string;
    phone?: string | null;
    email?: string | null;
    school_id?: string | null;
  };
}

type Props = LeadProps | SchoolProps | ContactProps;

/**
 * DuplicateWarningBanner (Phase 8).
 *
 * Renders nothing until the debounced peek returns ≥1 candidate, then
 * surfaces a yellow warning card with the top matches. The goal is to
 * stop a rep from creating a dup; the secondary goal is to log the
 * suspicion for a manager if they decide to save anyway.
 */
export function DuplicateWarningBanner(props: Props) {
  const { kind, enabled = true, className, onCandidatesChange } = props;
  const [candidates, setCandidates] = useState<DuplicateCandidate[]>([]);
  const [dismissed, setDismissed] = useState(false);

  // DUP3: keep the parent in step with the peek result. Independent of the
  // banner's dismissed state — dismissing hides the notice but the duplicate
  // still exists, so the submit gate must still fire.
  useEffect(() => {
    onCandidatesChange?.(candidates);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidates]);

  const peekLead = usePeekLeadDuplicates();
  const peekSchool = usePeekSchoolDuplicates();
  const peekContact = usePeekContactDuplicates();

  // Serialise the input so useEffect can fire on real changes only.
  const signature = useMemo(() => JSON.stringify(props.value ?? {}), [
    props.value,
  ]);

  useEffect(() => {
    setDismissed(false); // re-arm on every input change
    if (!enabled) {
      setCandidates([]);
      return;
    }
    // Bail early when nothing distinctive to query.
    const v: any = (props as any).value ?? {};
    const hasEnough =
      kind === "lead"
        ? Boolean(
            v.lead_name ||
              v.phone ||
              v.email ||
              v.school_id ||
              v.primary_contact_id,
          )
        : kind === "school"
          ? Boolean(v.name && v.name.trim().length > 2)
          : Boolean(v.phone || v.email || (v.first_name && v.last_name));
    if (!hasEnough) {
      setCandidates([]);
      return;
    }

    const handle = setTimeout(() => {
      const runner =
        kind === "lead"
          ? peekLead.mutateAsync(v as any)
          : kind === "school"
            ? peekSchool.mutateAsync(v as any)
            : peekContact.mutateAsync(v as any);
      runner
        .then((rows) => setCandidates(rows ?? []))
        .catch(() => setCandidates([]));
    }, 400);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, signature, enabled]);

  if (dismissed || candidates.length === 0) return null;

  return (
    <Card
      className={
        "border-amber-300 bg-amber-50/60 dark:border-amber-900 dark:bg-amber-950/20 " +
        (className ?? "")
      }
    >
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 mt-0.5 text-amber-600 dark:text-amber-400 shrink-0" />
            <div>
              <p className="font-medium text-amber-900 dark:text-amber-200">
                Possible duplicate{candidates.length > 1 ? "s" : ""} found
              </p>
              <p className="text-xs text-amber-800/80 dark:text-amber-300/80">
                {describeKind(kind)} that look like this already exist. Check
                before saving to avoid a duplicate record.
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setDismissed(true)}
            className="h-7 px-2 text-amber-800 dark:text-amber-300"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>

        <ul className="space-y-1.5">
          {candidates.slice(0, 3).map((c) => (
            <li
              key={displayId(c.record)}
              className="flex items-start justify-between gap-2 rounded-md border border-amber-200/60 dark:border-amber-900/60 bg-background/60 px-2.5 py-2 text-sm"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 font-medium">
                  <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="truncate">{displayName(kind, c.record)}</span>
                  {/* DUP5: `score` is an uncapped weighted sum (phone 60 +
                      email 55 + name 30 + … can exceed 100), so "{score}%
                      match" printed nonsense like "165% match". Show a
                      qualitative strength instead; the SignalsRow below
                      already explains WHICH fields matched. */}
                  <Badge variant="outline" className="text-[10px]">
                    {c.score >= 100
                      ? "Strong match"
                      : c.score >= 70
                        ? "Likely match"
                        : "Possible match"}
                  </Badge>
                </div>
                <SignalsRow signals={c.signals} />
              </div>
              {viewHref(kind, c.record) && (
                <Button variant="outline" size="sm" asChild>
                  <a
                    href={viewHref(kind, c.record)!}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Eye className="mr-1.5 h-3.5 w-3.5" />
                    View
                  </a>
                </Button>
              )}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function SignalsRow({ signals }: { signals: DuplicateSignal[] }) {
  if (!signals?.length) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {signals.slice(0, 4).map((s, i) => (
        <span
          key={`${s.kind}-${i}`}
          className="text-[11px] text-muted-foreground"
        >
          {describeSignal(s)}
          {i < signals.length - 1 ? " · " : ""}
        </span>
      ))}
    </div>
  );
}

function describeKind(kind: Kind) {
  switch (kind) {
    case "lead":
      return "Leads";
    case "school":
      return "Schools";
    case "contact":
      return "Contacts";
  }
}

function displayName(kind: Kind, r: any): string {
  if (kind === "lead") return r?.lead_name ?? "(unnamed lead)";
  if (kind === "school") return r?.name ?? "(unnamed school)";
  const full = [r?.first_name, r?.last_name].filter(Boolean).join(" ");
  return full || r?.email || r?.phone || "(unnamed contact)";
}

function displayId(r: any): string {
  return r?.id ?? Math.random().toString(36).slice(2);
}

function viewHref(kind: Kind, r: any): string | null {
  if (!r?.id) return null;
  if (kind === "lead") return `/leads/${r.id}`;
  if (kind === "school") return `/schools/${r.id}`;
  return null;
}
