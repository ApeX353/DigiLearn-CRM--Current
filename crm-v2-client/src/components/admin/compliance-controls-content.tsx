import { useState, useEffect, useMemo } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { Label } from "~/components/ui/label";
import { Input } from "~/components/ui/input";
import { Button } from "~/components/ui/button";
import { Switch } from "~/components/ui/switch";
import { Skeleton } from "~/components/ui/skeleton";
import { toast } from "sonner";
import {
  ShieldCheck,
  Loader2,
  Save,
  RotateCcw,
  Target,
  CalendarClock,
  DollarSign,
  Gem,
  CheckCircle2,
  ListChecks,
  UsersRound,
  ShieldAlert,
} from "lucide-react";
import { useSettings, useSetSettings } from "~/api/settings";
import { FeatureGuard } from "~/guards/feature-guard";

/**
 * Compliance & Controls tab (Phase A.3 of the compliance hardening
 * plan). Renders every knob the backend's `ComplianceSettingsService`
 * understands, in three groups:
 *
 *   - Targets & Thresholds — numeric KPIs the dashboards use
 *   - Compliance Targets   — per-cent targets for activity discipline
 *   - Policy Switches      — booleans that gate destructive workflows
 *
 * The keys MUST match those declared in
 * `src/settings/compliance-settings.service.ts` on the backend
 * (`COMPLIANCE_SETTINGS`). If you add or rename a key there, mirror
 * it here.
 *
 * The legacy "Targets Config" tab continues to write to its own
 * `defaults.*` keys; the dashboard service prefers those when set,
 * then falls back to the canonical `compliance.*` keys defined here.
 */

// Canonical key list — order is the visual order on the page.
const COMPLIANCE_KEYS = [
  "compliance.targets.daily_contacts_per_rep",
  "compliance.targets.daily_contacts_per_manager",
  "compliance.thresholds.stale_lead_days",
  "compliance.thresholds.stale_deal_days",
  "compliance.targets.monthly_revenue",
  "compliance.thresholds.expected_win_rate",
  "compliance.thresholds.high_value_deal",
  "compliance.thresholds.qualification_score",
  "compliance.targets.outcome_compliance_pct",
  "compliance.targets.next_step_compliance_pct",
  "compliance.policy.allow_self_reassign",
  "compliance.policy.auto_assign_enabled",
  "compliance.policy.auto_assign_include_managers",
  "compliance.policy.manager_lead_cap",
  "compliance.policy.tactical_disqualify_requires_approval",
  "compliance.policy.enforce_outcome_on_completion",
  "compliance.policy.enforce_next_step_on_completion",
  "compliance.policy.require_activity_due_date",
  "compliance.policy.sla_prebreach_nudge_hours",
  "compliance.policy.enforce_commercial_intent_for_deal",
  "compliance.policy.demo_followup_sla_hours",
] as const;

type ComplianceKey = (typeof COMPLIANCE_KEYS)[number];

const DEFAULTS: Record<ComplianceKey, number | boolean> = {
  "compliance.targets.daily_contacts_per_rep": 40,
  "compliance.targets.daily_contacts_per_manager": 10,
  "compliance.thresholds.stale_lead_days": 14,
  "compliance.thresholds.stale_deal_days": 21,
  "compliance.targets.monthly_revenue": 100000,
  "compliance.thresholds.expected_win_rate": 0.25,
  "compliance.thresholds.high_value_deal": 20000,
  "compliance.thresholds.qualification_score": 80,
  "compliance.targets.outcome_compliance_pct": 95,
  "compliance.targets.next_step_compliance_pct": 80,
  "compliance.policy.allow_self_reassign": false,
  "compliance.policy.auto_assign_enabled": false,
  "compliance.policy.auto_assign_include_managers": false,
  "compliance.policy.manager_lead_cap": 50,
  "compliance.policy.tactical_disqualify_requires_approval": true,
  "compliance.policy.enforce_outcome_on_completion": false,
  "compliance.policy.enforce_next_step_on_completion": false,
  "compliance.policy.require_activity_due_date": true,
  "compliance.policy.sla_prebreach_nudge_hours": 4,
  "compliance.policy.enforce_commercial_intent_for_deal": false,
  "compliance.policy.demo_followup_sla_hours": 48,
};

/** Coerce whatever the API returns into a number with a fallback. */
function toNumber(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

/** Coerce whatever the API returns into a boolean with a fallback. */
function toBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  if (value === "true" || value === 1 || value === "1") return true;
  if (value === "false" || value === 0 || value === "0") return false;
  return fallback;
}

const ComplianceControlsContent = () => {
  const { data: settings, isLoading } = useSettings(
    COMPLIANCE_KEYS as unknown as string[],
  );
  const setSettingsMutation = useSetSettings();

  // -------- Targets & thresholds (numeric) ----------------------
  const [dailyContacts, setDailyContacts] = useState<number>(
    DEFAULTS["compliance.targets.daily_contacts_per_rep"] as number,
  );
  const [dailyContactsManager, setDailyContactsManager] = useState<number>(
    DEFAULTS["compliance.targets.daily_contacts_per_manager"] as number,
  );
  const [staleLeadDays, setStaleLeadDays] = useState<number>(
    DEFAULTS["compliance.thresholds.stale_lead_days"] as number,
  );
  const [staleDealDays, setStaleDealDays] = useState<number>(
    DEFAULTS["compliance.thresholds.stale_deal_days"] as number,
  );
  const [monthlyRevenue, setMonthlyRevenue] = useState<number>(
    DEFAULTS["compliance.targets.monthly_revenue"] as number,
  );
  // Expected win rate is stored as 0–1 in the DB but rendered as % in the UI.
  const [expectedWinRatePct, setExpectedWinRatePct] = useState<number>(
    (DEFAULTS["compliance.thresholds.expected_win_rate"] as number) * 100,
  );
  const [highValueDeal, setHighValueDeal] = useState<number>(
    DEFAULTS["compliance.thresholds.high_value_deal"] as number,
  );
  const [qualificationScore, setQualificationScore] = useState<number>(
    DEFAULTS["compliance.thresholds.qualification_score"] as number,
  );
  const [outcomePct, setOutcomePct] = useState<number>(
    DEFAULTS["compliance.targets.outcome_compliance_pct"] as number,
  );
  const [nextStepPct, setNextStepPct] = useState<number>(
    DEFAULTS["compliance.targets.next_step_compliance_pct"] as number,
  );

  // -------- Policy switches (boolean) ---------------------------
  const [allowSelfReassign, setAllowSelfReassign] = useState<boolean>(
    DEFAULTS["compliance.policy.allow_self_reassign"] as boolean,
  );
  const [autoAssignEnabled, setAutoAssignEnabled] = useState<boolean>(
    DEFAULTS["compliance.policy.auto_assign_enabled"] as boolean,
  );
  const [includeManagers, setIncludeManagers] = useState<boolean>(
    DEFAULTS["compliance.policy.auto_assign_include_managers"] as boolean,
  );
  const [managerCap, setManagerCap] = useState<number>(
    DEFAULTS["compliance.policy.manager_lead_cap"] as number,
  );
  const [tacticalDisqualifyApproval, setTacticalDisqualifyApproval] =
    useState<boolean>(
      DEFAULTS[
        "compliance.policy.tactical_disqualify_requires_approval"
      ] as boolean,
    );
  // Phase B switches.
  const [enforceOutcome, setEnforceOutcome] = useState<boolean>(
    DEFAULTS["compliance.policy.enforce_outcome_on_completion"] as boolean,
  );
  const [enforceNextStep, setEnforceNextStep] = useState<boolean>(
    DEFAULTS["compliance.policy.enforce_next_step_on_completion"] as boolean,
  );
  const [requireActivityDueDate, setRequireActivityDueDate] = useState<boolean>(
    DEFAULTS["compliance.policy.require_activity_due_date"] as boolean,
  );
  // Phase D — pre-breach nudge window.
  const [prebreachHours, setPrebreachHours] = useState<number>(
    DEFAULTS["compliance.policy.sla_prebreach_nudge_hours"] as number,
  );
  // Demo + Commercial-Intent feature.
  const [enforceCommercialIntent, setEnforceCommercialIntent] =
    useState<boolean>(
      DEFAULTS[
        "compliance.policy.enforce_commercial_intent_for_deal"
      ] as boolean,
    );
  const [demoFollowupSlaHours, setDemoFollowupSlaHours] = useState<number>(
    DEFAULTS["compliance.policy.demo_followup_sla_hours"] as number,
  );

  const [hasChanges, setHasChanges] = useState(false);

  // Load server values into form state once they arrive.
  useEffect(() => {
    if (!settings) return;
    setDailyContacts(
      toNumber(
        settings["compliance.targets.daily_contacts_per_rep"],
        DEFAULTS["compliance.targets.daily_contacts_per_rep"] as number,
      ),
    );
    setDailyContactsManager(
      toNumber(
        settings["compliance.targets.daily_contacts_per_manager"],
        DEFAULTS["compliance.targets.daily_contacts_per_manager"] as number,
      ),
    );
    setStaleLeadDays(
      toNumber(
        settings["compliance.thresholds.stale_lead_days"],
        DEFAULTS["compliance.thresholds.stale_lead_days"] as number,
      ),
    );
    setStaleDealDays(
      toNumber(
        settings["compliance.thresholds.stale_deal_days"],
        DEFAULTS["compliance.thresholds.stale_deal_days"] as number,
      ),
    );
    setMonthlyRevenue(
      toNumber(
        settings["compliance.targets.monthly_revenue"],
        DEFAULTS["compliance.targets.monthly_revenue"] as number,
      ),
    );
    setExpectedWinRatePct(
      toNumber(
        settings["compliance.thresholds.expected_win_rate"],
        DEFAULTS["compliance.thresholds.expected_win_rate"] as number,
      ) * 100,
    );
    setHighValueDeal(
      toNumber(
        settings["compliance.thresholds.high_value_deal"],
        DEFAULTS["compliance.thresholds.high_value_deal"] as number,
      ),
    );
    setQualificationScore(
      toNumber(
        settings["compliance.thresholds.qualification_score"],
        DEFAULTS["compliance.thresholds.qualification_score"] as number,
      ),
    );
    setOutcomePct(
      toNumber(
        settings["compliance.targets.outcome_compliance_pct"],
        DEFAULTS["compliance.targets.outcome_compliance_pct"] as number,
      ),
    );
    setNextStepPct(
      toNumber(
        settings["compliance.targets.next_step_compliance_pct"],
        DEFAULTS["compliance.targets.next_step_compliance_pct"] as number,
      ),
    );
    setAllowSelfReassign(
      toBoolean(
        settings["compliance.policy.allow_self_reassign"],
        DEFAULTS["compliance.policy.allow_self_reassign"] as boolean,
      ),
    );
    setAutoAssignEnabled(
      toBoolean(
        settings["compliance.policy.auto_assign_enabled"],
        DEFAULTS["compliance.policy.auto_assign_enabled"] as boolean,
      ),
    );
    setIncludeManagers(
      toBoolean(
        settings["compliance.policy.auto_assign_include_managers"],
        DEFAULTS["compliance.policy.auto_assign_include_managers"] as boolean,
      ),
    );
    setManagerCap(
      toNumber(
        settings["compliance.policy.manager_lead_cap"],
        DEFAULTS["compliance.policy.manager_lead_cap"] as number,
      ),
    );
    setTacticalDisqualifyApproval(
      toBoolean(
        settings["compliance.policy.tactical_disqualify_requires_approval"],
        DEFAULTS[
          "compliance.policy.tactical_disqualify_requires_approval"
        ] as boolean,
      ),
    );
    setEnforceOutcome(
      toBoolean(
        settings["compliance.policy.enforce_outcome_on_completion"],
        DEFAULTS["compliance.policy.enforce_outcome_on_completion"] as boolean,
      ),
    );
    setEnforceNextStep(
      toBoolean(
        settings["compliance.policy.enforce_next_step_on_completion"],
        DEFAULTS[
          "compliance.policy.enforce_next_step_on_completion"
        ] as boolean,
      ),
    );
    setRequireActivityDueDate(
      toBoolean(
        settings["compliance.policy.require_activity_due_date"],
        DEFAULTS["compliance.policy.require_activity_due_date"] as boolean,
      ),
    );
    setPrebreachHours(
      toNumber(
        settings["compliance.policy.sla_prebreach_nudge_hours"],
        DEFAULTS["compliance.policy.sla_prebreach_nudge_hours"] as number,
      ),
    );
    setEnforceCommercialIntent(
      toBoolean(
        settings["compliance.policy.enforce_commercial_intent_for_deal"],
        DEFAULTS[
          "compliance.policy.enforce_commercial_intent_for_deal"
        ] as boolean,
      ),
    );
    setDemoFollowupSlaHours(
      toNumber(
        settings["compliance.policy.demo_followup_sla_hours"],
        DEFAULTS["compliance.policy.demo_followup_sla_hours"] as number,
      ),
    );
    setHasChanges(false);
  }, [settings]);

  // Helper to wrap setters so we can flag the form dirty.
  const handleNumberChange = (
    setter: (n: number) => void,
    raw: string,
    opts?: { min?: number; max?: number },
  ) => {
    const n = parseFloat(raw);
    if (Number.isNaN(n)) return;
    let bounded = n;
    if (opts?.min !== undefined) bounded = Math.max(opts.min, bounded);
    if (opts?.max !== undefined) bounded = Math.min(opts.max, bounded);
    setter(bounded);
    setHasChanges(true);
  };

  const handleBoolChange = (
    setter: (b: boolean) => void,
    next: boolean,
  ) => {
    setter(next);
    setHasChanges(true);
  };

  const requiredPipeline = useMemo(() => {
    const winFraction = Math.max(0.0001, expectedWinRatePct / 100);
    return Math.round(monthlyRevenue / winFraction);
  }, [monthlyRevenue, expectedWinRatePct]);

  const handleSave = () => {
    setSettingsMutation.mutate(
      {
        settings: [
          {
            key: "compliance.targets.daily_contacts_per_rep",
            value: dailyContacts,
            data_type: "number",
            description: "Daily contacts target per rep",
            category: "compliance",
            is_public: false,
          },
          {
            key: "compliance.targets.daily_contacts_per_manager",
            value: dailyContactsManager,
            data_type: "number",
            description: "Daily contacts target per sales manager",
            category: "compliance",
            is_public: false,
          },
          {
            key: "compliance.thresholds.stale_lead_days",
            value: staleLeadDays,
            data_type: "number",
            description: "Lead is flagged stale after this many idle days",
            category: "compliance",
            is_public: false,
          },
          {
            key: "compliance.thresholds.stale_deal_days",
            value: staleDealDays,
            data_type: "number",
            description: "Deal is flagged stale after this many idle days",
            category: "compliance",
            is_public: false,
          },
          {
            key: "compliance.targets.monthly_revenue",
            value: monthlyRevenue,
            data_type: "number",
            description: "Monthly revenue target ($)",
            category: "compliance",
            is_public: false,
          },
          {
            key: "compliance.thresholds.expected_win_rate",
            value: expectedWinRatePct / 100,
            data_type: "number",
            description: "Expected deal win rate (0-1)",
            category: "compliance",
            is_public: false,
          },
          {
            key: "compliance.thresholds.high_value_deal",
            value: highValueDeal,
            data_type: "number",
            description: "High-value deal threshold ($)",
            category: "compliance",
            is_public: false,
          },
          {
            key: "compliance.thresholds.qualification_score",
            value: qualificationScore,
            data_type: "number",
            description:
              "BANT-derived qualification score (0-100) above which a lead is Qualified",
            category: "compliance",
            is_public: false,
          },
          {
            key: "compliance.targets.outcome_compliance_pct",
            value: outcomePct,
            data_type: "number",
            description:
              "% of completed actionable activities expected to record an outcome",
            category: "compliance",
            is_public: false,
          },
          {
            key: "compliance.targets.next_step_compliance_pct",
            value: nextStepPct,
            data_type: "number",
            description:
              "% of completed actionable activities expected to be followed by a next step",
            category: "compliance",
            is_public: false,
          },
          {
            key: "compliance.policy.allow_self_reassign",
            value: allowSelfReassign,
            data_type: "boolean",
            description:
              "When false, sales reps must request reassignment via manager approval",
            category: "compliance",
            is_public: false,
          },
          {
            key: "compliance.policy.auto_assign_enabled",
            value: autoAssignEnabled,
            data_type: "boolean",
            description:
              "When on, the auto-assignment engine distributes unassigned leads to the least-loaded active rep",
            category: "compliance",
            is_public: false,
          },
          {
            key: "compliance.policy.auto_assign_include_managers",
            value: includeManagers,
            data_type: "boolean",
            description:
              "When on, managers with a territory also receive auto-assigned leads (capped by the manager lead cap)",
            category: "compliance",
            is_public: false,
          },
          {
            key: "compliance.policy.manager_lead_cap",
            value: managerCap,
            data_type: "number",
            description:
              "Most open leads a manager may hold from auto-assign before leads go to the rep instead",
            category: "compliance",
            is_public: false,
          },
          {
            key: "compliance.policy.tactical_disqualify_requires_approval",
            value: tacticalDisqualifyApproval,
            data_type: "boolean",
            description:
              "When true, only admin-category disqualify reasons can be applied directly",
            category: "compliance",
            is_public: false,
          },
          {
            key: "compliance.policy.enforce_outcome_on_completion",
            value: enforceOutcome,
            data_type: "boolean",
            description:
              "Block activity completion without an outcome (Phase B)",
            category: "compliance",
            is_public: false,
          },
          {
            key: "compliance.policy.enforce_next_step_on_completion",
            value: enforceNextStep,
            data_type: "boolean",
            description:
              "Require a scheduled next step when completing actionable activities (Phase B)",
            category: "compliance",
            is_public: false,
          },
          {
            key: "compliance.policy.require_activity_due_date",
            value: requireActivityDueDate,
            data_type: "boolean",
            description:
              "Require a due date on every OPEN actionable activity",
            category: "compliance",
            is_public: false,
          },
          {
            key: "compliance.policy.sla_prebreach_nudge_hours",
            value: prebreachHours,
            data_type: "number",
            description:
              "How many hours before SLA breach the rep is nudged (Phase D)",
            category: "compliance",
            is_public: false,
          },
          {
            key: "compliance.policy.enforce_commercial_intent_for_deal",
            value: enforceCommercialIntent,
            data_type: "boolean",
            description:
              "Block deal creation unless lead.commercial_intent + estimated value + decision-maker (Demo feature)",
            category: "compliance",
            is_public: false,
          },
          {
            key: "compliance.policy.demo_followup_sla_hours",
            value: demoFollowupSlaHours,
            data_type: "number",
            description:
              "Hours after a Demo Delivery within which a follow-up activity must be created (Demo feature)",
            category: "compliance",
            is_public: false,
          },
        ],
      },
      {
        onSuccess: () => {
          toast.success("Compliance & control settings saved");
          setHasChanges(false);
        },
        onError: () => {
          toast.error("Failed to save compliance settings");
        },
      },
    );
  };

  const handleReset = () => {
    if (settings) {
      // Re-run the load effect logic
      setDailyContacts(
        toNumber(
          settings["compliance.targets.daily_contacts_per_rep"],
          DEFAULTS["compliance.targets.daily_contacts_per_rep"] as number,
        ),
      );
      setDailyContactsManager(
        toNumber(
          settings["compliance.targets.daily_contacts_per_manager"],
          DEFAULTS["compliance.targets.daily_contacts_per_manager"] as number,
        ),
      );
      setStaleLeadDays(
        toNumber(
          settings["compliance.thresholds.stale_lead_days"],
          DEFAULTS["compliance.thresholds.stale_lead_days"] as number,
        ),
      );
      setStaleDealDays(
        toNumber(
          settings["compliance.thresholds.stale_deal_days"],
          DEFAULTS["compliance.thresholds.stale_deal_days"] as number,
        ),
      );
      setMonthlyRevenue(
        toNumber(
          settings["compliance.targets.monthly_revenue"],
          DEFAULTS["compliance.targets.monthly_revenue"] as number,
        ),
      );
      setExpectedWinRatePct(
        toNumber(
          settings["compliance.thresholds.expected_win_rate"],
          DEFAULTS["compliance.thresholds.expected_win_rate"] as number,
        ) * 100,
      );
      setHighValueDeal(
        toNumber(
          settings["compliance.thresholds.high_value_deal"],
          DEFAULTS["compliance.thresholds.high_value_deal"] as number,
        ),
      );
      setQualificationScore(
        toNumber(
          settings["compliance.thresholds.qualification_score"],
          DEFAULTS["compliance.thresholds.qualification_score"] as number,
        ),
      );
      setOutcomePct(
        toNumber(
          settings["compliance.targets.outcome_compliance_pct"],
          DEFAULTS["compliance.targets.outcome_compliance_pct"] as number,
        ),
      );
      setNextStepPct(
        toNumber(
          settings["compliance.targets.next_step_compliance_pct"],
          DEFAULTS["compliance.targets.next_step_compliance_pct"] as number,
        ),
      );
      setAllowSelfReassign(
        toBoolean(
          settings["compliance.policy.allow_self_reassign"],
          DEFAULTS["compliance.policy.allow_self_reassign"] as boolean,
        ),
      );
      setAutoAssignEnabled(
        toBoolean(
          settings["compliance.policy.auto_assign_enabled"],
          DEFAULTS["compliance.policy.auto_assign_enabled"] as boolean,
        ),
      );
      setIncludeManagers(
        toBoolean(
          settings["compliance.policy.auto_assign_include_managers"],
          DEFAULTS["compliance.policy.auto_assign_include_managers"] as boolean,
        ),
      );
      setManagerCap(
        toNumber(
          settings["compliance.policy.manager_lead_cap"],
          DEFAULTS["compliance.policy.manager_lead_cap"] as number,
        ),
      );
      setTacticalDisqualifyApproval(
        toBoolean(
          settings["compliance.policy.tactical_disqualify_requires_approval"],
          DEFAULTS[
            "compliance.policy.tactical_disqualify_requires_approval"
          ] as boolean,
        ),
      );
      setEnforceOutcome(
        toBoolean(
          settings["compliance.policy.enforce_outcome_on_completion"],
          DEFAULTS[
            "compliance.policy.enforce_outcome_on_completion"
          ] as boolean,
        ),
      );
      setEnforceNextStep(
        toBoolean(
          settings["compliance.policy.enforce_next_step_on_completion"],
          DEFAULTS[
            "compliance.policy.enforce_next_step_on_completion"
          ] as boolean,
        ),
      );
      setRequireActivityDueDate(
        toBoolean(
          settings["compliance.policy.require_activity_due_date"],
          DEFAULTS["compliance.policy.require_activity_due_date"] as boolean,
        ),
      );
      setPrebreachHours(
        toNumber(
          settings["compliance.policy.sla_prebreach_nudge_hours"],
          DEFAULTS["compliance.policy.sla_prebreach_nudge_hours"] as number,
        ),
      );
      setEnforceCommercialIntent(
        toBoolean(
          settings["compliance.policy.enforce_commercial_intent_for_deal"],
          DEFAULTS[
            "compliance.policy.enforce_commercial_intent_for_deal"
          ] as boolean,
        ),
      );
      setDemoFollowupSlaHours(
        toNumber(
          settings["compliance.policy.demo_followup_sla_hours"],
          DEFAULTS["compliance.policy.demo_followup_sla_hours"] as number,
        ),
      );
    }
    setHasChanges(false);
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-72" />
          <Skeleton className="h-4 w-96 mt-2" />
        </CardHeader>
        <CardContent className="space-y-6">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-10 w-full" />
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4" data-testid="compliance-controls-content">
      {/* Plain-English intro so a manager landing on this tab knows
          what they're looking at without reading three card titles. */}
      <div className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">
        These settings control how strict the CRM is about activity quality and lead handling.
        Tighter numbers push reps to log more; rule switches block actions until the rule is met.
        <strong className="text-foreground"> Changes apply going forward — historical reports
        keep the values in effect when they were recorded.</strong>
      </div>

      {/* ===== Group 1 — Numbers your dashboards use ===== */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" />
            Numbers your dashboards use
          </CardTitle>
          <CardDescription>
            These numbers shape what shows up on dashboards, alerts, and
            at-risk lists. Changes apply org-wide and take about 30 seconds
            to propagate.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 md:grid-cols-2">
          {/* Daily contacts per rep */}
          <div className="space-y-2">
            <Label
              htmlFor="cc-daily-contacts"
              className="flex items-center gap-2"
            >
              <Target className="h-4 w-4 text-muted-foreground" />
              Daily contacts goal per rep
            </Label>
            <Input
              id="cc-daily-contacts"
              data-testid="cc-daily-contacts"
              type="number"
              min={1}
              value={dailyContacts}
              onChange={(e) =>
                handleNumberChange(setDailyContacts, e.target.value, {
                  min: 1,
                })
              }
            />
            <p className="text-xs text-muted-foreground">
              How many first-time lead contacts each rep should make per day.
              The dashboard's "Leads Contacted vs Target" card uses this,
              multiplying by your active headcount for the team view.
            </p>
          </div>

          {/* Daily contacts per manager (DISC2 — managers carry a lower target) */}
          <div className="space-y-2">
            <Label
              htmlFor="cc-daily-contacts-manager"
              className="flex items-center gap-2"
            >
              <Target className="h-4 w-4 text-muted-foreground" />
              Daily contacts goal per manager
            </Label>
            <Input
              id="cc-daily-contacts-manager"
              data-testid="cc-daily-contacts-manager"
              type="number"
              min={0}
              value={dailyContactsManager}
              onChange={(e) =>
                handleNumberChange(setDailyContactsManager, e.target.value, {
                  min: 0,
                })
              }
            />
            <p className="text-xs text-muted-foreground">
              Sales managers sell part-time, so they carry a lower daily
              target than reps (default 10 vs 40). The discipline board and
              the team "Contacted vs Target" view use this figure for anyone
              on a manager role.
            </p>
          </div>

          {/* Stale lead days */}
          <div className="space-y-2">
            <Label
              htmlFor="cc-stale-lead-days"
              className="flex items-center gap-2"
            >
              <CalendarClock className="h-4 w-4 text-muted-foreground" />
              Mark a lead "stale" after this many days
            </Label>
            <Input
              id="cc-stale-lead-days"
              data-testid="cc-stale-lead-days"
              type="number"
              min={1}
              value={staleLeadDays}
              onChange={(e) =>
                handleNumberChange(setStaleLeadDays, e.target.value, {
                  min: 1,
                })
              }
            />
            <p className="text-xs text-muted-foreground">
              When a lead has had no contact for this many days, it shows up
              on the dashboard "stale leads" list.
            </p>
          </div>

          {/* Stale deal days */}
          <div className="space-y-2">
            <Label
              htmlFor="cc-stale-deal-days"
              className="flex items-center gap-2"
            >
              <CalendarClock className="h-4 w-4 text-muted-foreground" />
              Mark a deal "stale" after this many days
            </Label>
            <Input
              id="cc-stale-deal-days"
              data-testid="cc-stale-deal-days"
              type="number"
              min={1}
              value={staleDealDays}
              onChange={(e) =>
                handleNumberChange(setStaleDealDays, e.target.value, {
                  min: 1,
                })
              }
            />
            <p className="text-xs text-muted-foreground">
              When an open deal has had no call / email / meeting / task for
              this many days, it shows up as stale.
            </p>
          </div>

          {/* Monthly revenue */}
          <div className="space-y-2">
            <Label
              htmlFor="cc-monthly-revenue"
              className="flex items-center gap-2"
            >
              <DollarSign className="h-4 w-4 text-muted-foreground" />
              Monthly revenue target ($)
            </Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                $
              </span>
              <Input
                id="cc-monthly-revenue"
                data-testid="cc-monthly-revenue"
                type="number"
                min={0}
                step={1000}
                className="pl-7"
                value={monthlyRevenue}
                onChange={(e) =>
                  handleNumberChange(setMonthlyRevenue, e.target.value, {
                    min: 0,
                  })
                }
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Used to calculate whether your team has enough open pipeline to
              hit revenue targets. Currently:{" "}
              ${monthlyRevenue.toLocaleString()}
            </p>
          </div>

          {/* Expected win rate */}
          <div className="space-y-2">
            <Label
              htmlFor="cc-expected-win-rate"
              className="flex items-center gap-2"
            >
              <Target className="h-4 w-4 text-muted-foreground" />
              Expected win rate (%)
            </Label>
            <div className="relative">
              <Input
                id="cc-expected-win-rate"
                data-testid="cc-expected-win-rate"
                type="number"
                min={1}
                max={100}
                step={1}
                className="pr-8"
                value={expectedWinRatePct}
                onChange={(e) =>
                  handleNumberChange(setExpectedWinRatePct, e.target.value, {
                    min: 1,
                    max: 100,
                  })
                }
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                %
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              At this win rate you need{" "}
              <strong>${requiredPipeline.toLocaleString()}</strong> in open
              pipeline each month to hit the revenue target above.
            </p>
          </div>

          {/* High-value deal */}
          <div className="space-y-2">
            <Label
              htmlFor="cc-high-value-deal"
              className="flex items-center gap-2"
            >
              <Gem className="h-4 w-4 text-muted-foreground" />
              "High-value" deal cut-off ($)
            </Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                $
              </span>
              <Input
                id="cc-high-value-deal"
                data-testid="cc-high-value-deal"
                type="number"
                min={0}
                step={1000}
                className="pl-7"
                value={highValueDeal}
                onChange={(e) =>
                  handleNumberChange(setHighValueDeal, e.target.value, {
                    min: 0,
                  })
                }
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Deals at or above this value show up on the dashboard's
              High-Value Deals card.
            </p>
          </div>

          {/* Qualification score */}
          <div className="space-y-2">
            <Label
              htmlFor="cc-qualification-score"
              className="flex items-center gap-2"
            >
              <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
              Score a lead needs to count as "Qualified" (0–100)
            </Label>
            <Input
              id="cc-qualification-score"
              data-testid="cc-qualification-score"
              type="number"
              min={0}
              max={100}
              step={1}
              value={qualificationScore}
              onChange={(e) =>
                handleNumberChange(
                  setQualificationScore,
                  e.target.value,
                  { min: 0, max: 100 },
                )
              }
            />
            <p className="text-xs text-muted-foreground">
              The qualification score combines budget, authority, need, and
              timing (BANT). Leads at or above this number show as Qualified.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* ===== Group 2 — Activity quality goals ===== */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ListChecks className="h-5 w-5" />
            Activity quality goals (%)
          </CardTitle>
          <CardDescription>
            Per-cent goals the dashboard checks reps against. Lowering them
            quietens the red bars; raising them tightens the bar reps must
            clear.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 md:grid-cols-2">
          {/* Outcome compliance */}
          <div className="space-y-2">
            <Label
              htmlFor="cc-outcome-pct"
              className="flex items-center gap-2"
            >
              <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
              Goal: % of activities that record an outcome
            </Label>
            <div className="relative">
              <Input
                id="cc-outcome-pct"
                data-testid="cc-outcome-pct"
                type="number"
                min={0}
                max={100}
                step={1}
                className="pr-8"
                value={outcomePct}
                onChange={(e) =>
                  handleNumberChange(setOutcomePct, e.target.value, {
                    min: 0,
                    max: 100,
                  })
                }
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                %
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              When a rep marks a call / meeting / email / WhatsApp / task as
              "done", what % of the time should they record what happened?
            </p>
          </div>

          {/* Next-step compliance */}
          <div className="space-y-2">
            <Label
              htmlFor="cc-next-step-pct"
              className="flex items-center gap-2"
            >
              <ListChecks className="h-4 w-4 text-muted-foreground" />
              Goal: % of activities that have a next step booked
            </Label>
            <div className="relative">
              <Input
                id="cc-next-step-pct"
                data-testid="cc-next-step-pct"
                type="number"
                min={0}
                max={100}
                step={1}
                className="pr-8"
                value={nextStepPct}
                onChange={(e) =>
                  handleNumberChange(setNextStepPct, e.target.value, {
                    min: 0,
                    max: 100,
                  })
                }
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                %
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              After a rep finishes an activity, what % of the time should
              they have already booked the next call / meeting / task on the
              same lead or deal?
            </p>
          </div>
        </CardContent>
      </Card>

      {/* ===== Group 3 — Workflow rules ===== */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5" />
            Workflow rules
          </CardTitle>
          <CardDescription>
            Workflow gates that limit what sales reps can do without manager
            sign-off. Sales managers and admins are unaffected — these only
            constrain reps.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Allow self reassign (rep-scope only) */}
          <div className="flex flex-col gap-4 rounded-md border p-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
            <div className="space-y-1">
              <Label
                htmlFor="cc-allow-self-reassign"
                className="flex items-center gap-2 text-base font-medium"
              >
                <UsersRound className="h-4 w-4 text-muted-foreground" />
                Reps can reassign their own leads (no approval)
              </Label>
              <p className="text-xs text-muted-foreground max-w-xl">
                When <strong>off</strong> (default), reps must submit a
                reassignment request that a manager reviews — this stops
                them from quietly dumping leads. Managers and admins can
                always reassign directly.
              </p>
            </div>
            <Switch
              id="cc-allow-self-reassign"
              data-testid="cc-allow-self-reassign"
              checked={allowSelfReassign}
              onCheckedChange={(v) => handleBoolChange(setAllowSelfReassign, v)}
            />
          </div>

          {/* Auto-assign engine — admin only (nkululeko's permission level) */}
          <FeatureGuard allowedRoles={["admin"]}>
            <div className="flex flex-col gap-4 rounded-md border p-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
              <div className="space-y-1">
                <Label
                  htmlFor="cc-auto-assign-enabled"
                  className="flex items-center gap-2 text-base font-medium"
                >
                  <UsersRound className="h-4 w-4 text-muted-foreground" />
                  Auto-assign new leads to reps
                </Label>
                <p className="text-xs text-muted-foreground max-w-xl">
                  When <strong>on</strong>, the auto-assignment engine
                  automatically distributes unassigned leads to the
                  least-loaded active sales rep (checked every 15 minutes).
                  When <strong>off</strong> (default), leads stay unassigned
                  until a manager assigns them manually. Admin-only.
                </p>
              </div>
              <Switch
                id="cc-auto-assign-enabled"
                data-testid="cc-auto-assign-enabled"
                checked={autoAssignEnabled}
                onCheckedChange={(v) =>
                  handleBoolChange(setAutoAssignEnabled, v)
                }
              />
            </div>
          </FeatureGuard>

          {/* #19 — managers receive auto-assigned leads (opt-in + cap) */}
          <FeatureGuard allowedRoles={["admin", "sales_manager"]}>
            <div className="flex flex-col gap-4 rounded-md border p-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
              <div className="space-y-1">
                <Label
                  htmlFor="cc-include-managers"
                  className="flex items-center gap-2 text-base font-medium"
                >
                  <UsersRound className="h-4 w-4 text-muted-foreground" />
                  Include managers in auto-assign
                </Label>
                <p className="text-xs text-muted-foreground max-w-xl">
                  When <strong>on</strong>, sales managers who have a territory
                  (e.g. Kim, Busi) also receive auto-assigned leads — sharing
                  their office rep's territory — up to the manager cap below.
                  When <strong>off</strong>, managers only approve and reassign.
                </p>
              </div>
              <Switch
                id="cc-include-managers"
                data-testid="cc-include-managers"
                checked={includeManagers}
                onCheckedChange={(v) => handleBoolChange(setIncludeManagers, v)}
              />
            </div>
            <div className="space-y-2 rounded-md border p-4">
              <Label
                htmlFor="cc-manager-cap"
                className="flex items-center gap-2 text-base font-medium"
              >
                <UsersRound className="h-4 w-4 text-muted-foreground" />
                Manager lead cap (max a manager receives)
              </Label>
              <Input
                id="cc-manager-cap"
                data-testid="cc-manager-cap"
                type="number"
                min={0}
                max={1000}
                value={managerCap}
                onChange={(e) =>
                  handleNumberChange(setManagerCap, e.target.value, {
                    min: 0,
                    max: 1000,
                  })
                }
              />
              <p className="text-xs text-muted-foreground max-w-xl">
                Once a manager holds this many open leads from auto-assign,
                further leads in their territory go to the rep instead. Only
                applies when the switch above is on.
              </p>
            </div>
          </FeatureGuard>

          {/* Tactical disqualify requires approval */}
          <div className="flex flex-col gap-4 rounded-md border p-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
            <div className="space-y-1">
              <Label
                htmlFor="cc-tactical-disqualify-approval"
                className="flex items-center gap-2 text-base font-medium"
              >
                <ShieldAlert className="h-4 w-4 text-muted-foreground" />
                Rep disqualifications need manager approval
              </Label>
              <p className="text-xs text-muted-foreground max-w-xl">
                This policy is enforced for every reason. Reps submit a reason
                and explanation; a manager decision automatically applies the
                status. Managers and admins can make a documented direct
                decision.
              </p>
            </div>
            <Switch
              id="cc-tactical-disqualify-approval"
              data-testid="cc-tactical-disqualify-approval"
              checked
              disabled
            />
          </div>

          {/* Phase B — outcome enforcement */}
          <div className="flex flex-col gap-4 rounded-md border p-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
            <div className="space-y-1">
              <Label
                htmlFor="cc-enforce-outcome"
                className="flex items-center gap-2 text-base font-medium"
              >
                <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
                Reps must record an outcome when marking activities done
              </Label>
              <p className="text-xs text-muted-foreground max-w-xl">
                When <strong>on</strong>, reps cannot mark a call, meeting,
                email, WhatsApp, or task as done until they record what
                happened. Off by default. Managers and admins always bypass.
              </p>
            </div>
            <Switch
              id="cc-enforce-outcome"
              data-testid="cc-enforce-outcome"
              checked={enforceOutcome}
              onCheckedChange={(v) => handleBoolChange(setEnforceOutcome, v)}
            />
          </div>

          {/* Phase B — next-step enforcement */}
          <div className="flex flex-col gap-4 rounded-md border p-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
            <div className="space-y-1">
              <Label
                htmlFor="cc-enforce-next-step"
                className="flex items-center gap-2 text-base font-medium"
              >
                <ListChecks className="h-4 w-4 text-muted-foreground" />
                Reps must book a next step before marking activities done
              </Label>
              <p className="text-xs text-muted-foreground max-w-xl">
                When <strong>on</strong>, reps must either already have a
                future call / meeting / task scheduled on the same lead or
                deal, or attach one in the same action, before they can mark
                an activity done. Off by default. Managers and admins always
                bypass.
              </p>
            </div>
            <Switch
              id="cc-enforce-next-step"
              data-testid="cc-enforce-next-step"
              checked={enforceNextStep}
              onCheckedChange={(v) => handleBoolChange(setEnforceNextStep, v)}
            />
          </div>

          {/* Require a due date on every open activity */}
          <div className="flex flex-col gap-4 rounded-md border p-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
            <div className="space-y-1">
              <Label
                htmlFor="cc-require-due-date"
                className="flex items-center gap-2 text-base font-medium"
              >
                <CalendarClock className="h-4 w-4 text-muted-foreground" />
                Require a date on every open activity
              </Label>
              <p className="text-xs text-muted-foreground max-w-xl">
                When <strong>on</strong> (default), an actionable activity
                (call / meeting / email / WhatsApp / task) left <strong>open</strong>
                {" "}must carry a due date — the "when" of the commitment.
                Completed activities are exempt. Turn this <strong>off</strong>
                {" "}to let reps save an open activity with no date at all.
              </p>
            </div>
            <Switch
              id="cc-require-due-date"
              data-testid="cc-require-due-date"
              checked={requireActivityDueDate}
              onCheckedChange={(v) =>
                handleBoolChange(setRequireActivityDueDate, v)
              }
            />
          </div>

          {/* Phase D — pre-breach nudge */}
          <div className="space-y-2 rounded-md border p-4">
            <Label
              htmlFor="cc-prebreach-hours"
              className="flex items-center gap-2 text-base font-medium"
            >
              <CalendarClock className="h-4 w-4 text-muted-foreground" />
              Warn reps this many hours before a lead's response deadline
            </Label>
            <Input
              id="cc-prebreach-hours"
              data-testid="cc-prebreach-hours"
              type="number"
              min={0}
              max={72}
              value={prebreachHours}
              onChange={(e) =>
                handleNumberChange(setPrebreachHours, e.target.value, {
                  min: 0,
                  max: 72,
                })
              }
            />
            <p className="text-xs text-muted-foreground max-w-xl">
              The system sends the assigned rep an early-warning
              notification this many hours before a lead's SLA is due to
              breach. Set to <strong>0</strong> to turn off the early
              warning. The deadline alert itself still goes out.
            </p>
          </div>

          {/* Demo + Commercial-Intent — deal creation gate */}
          <div className="flex flex-col gap-4 rounded-md border p-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
            <div className="space-y-1">
              <Label
                htmlFor="cc-enforce-commercial-intent"
                className="flex items-center gap-2 text-base font-medium"
              >
                <ShieldCheck className="h-4 w-4 text-muted-foreground" />
                Require commercial intent before creating a deal
              </Label>
              <p className="text-xs text-muted-foreground max-w-xl">
                When <strong>on</strong>, reps cannot create a deal from a
                lead until the lead has shown a clear commercial signal
                (Quote Requested, Payment Plan Discussion Requested, SDC
                Meeting Requested, or quantity / payment-plan / SDC
                discussion captured on a Demo Delivery) AND has an
                estimated value, deal title, and a recorded decision-maker.
                Off by default to preserve historical behaviour. Managers
                and admins always bypass.
              </p>
            </div>
            <Switch
              id="cc-enforce-commercial-intent"
              data-testid="cc-enforce-commercial-intent"
              checked={enforceCommercialIntent}
              onCheckedChange={(v) =>
                handleBoolChange(setEnforceCommercialIntent, v)
              }
            />
          </div>

          {/* Demo Follow-up SLA */}
          <div className="space-y-2 rounded-md border p-4">
            <Label
              htmlFor="cc-demo-followup-sla"
              className="flex items-center gap-2 text-base font-medium"
            >
              <CalendarClock className="h-4 w-4 text-muted-foreground" />
              Demo follow-up SLA (hours)
            </Label>
            <Input
              id="cc-demo-followup-sla"
              data-testid="cc-demo-followup-sla"
              type="number"
              min={0}
              max={336}
              value={demoFollowupSlaHours}
              onChange={(e) =>
                handleNumberChange(setDemoFollowupSlaHours, e.target.value, {
                  min: 0,
                  max: 336,
                })
              }
            />
            <p className="text-xs text-muted-foreground max-w-xl">
              After a Demo Delivery with outcome Completed / Strong Interest
              / Follow-up Needed / Quote Requested, a real follow-up
              activity must be logged within this many hours. Notes don't
              count. The lead is flagged "Demo Follow-up Overdue" otherwise.
              Default 48 hours; set to 0 to disable.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* ===== Save / Reset bar ===== */}
      <div className="sticky bottom-0 flex flex-col gap-2 border-t bg-background pt-2 pb-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            onClick={handleSave}
            disabled={!hasChanges || setSettingsMutation.isPending}
            data-testid="cc-save"
          >
            {setSettingsMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Save changes
          </Button>
          <Button
            variant="outline"
            onClick={handleReset}
            disabled={!hasChanges || setSettingsMutation.isPending}
            data-testid="cc-reset"
            title="Revert all fields to your last saved values"
          >
            <RotateCcw className="h-4 w-4 mr-2" />
            Discard changes
          </Button>
        </div>
        {hasChanges && (
          <span className="inline-flex items-center gap-1.5 rounded-md bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 border border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-900">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
            You have unsaved changes — click "Save changes" to apply them across the org.
          </span>
        )}
      </div>
    </div>
  );
};

export default ComplianceControlsContent;
