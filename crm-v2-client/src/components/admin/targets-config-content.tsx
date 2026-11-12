import { useState, useEffect } from "react";
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
import { Skeleton } from "~/components/ui/skeleton";
import { toast } from "sonner";
import { Target, DollarSign, TrendingUp, Gem, Loader2, Save } from "lucide-react";
import { useSettings, useSetSettings } from "~/api/settings";
import { apiErrorMessage } from "~/api/axios";

// Setting keys for targets
const SETTINGS_KEYS = [
  "compliance.targets.daily_contacts_per_rep",
  "compliance.targets.monthly_revenue",
  "compliance.thresholds.expected_win_rate",
  "compliance.thresholds.high_value_deal",
];

// Default values (used when settings don't exist yet)
const DEFAULTS = {
  "compliance.targets.daily_contacts_per_rep": 40,
  "compliance.targets.monthly_revenue": 100000,
  "compliance.thresholds.expected_win_rate": 0.25,
  "compliance.thresholds.high_value_deal": 20000,
};

const TargetsConfigContent = () => {
  const { data: settings, isLoading } = useSettings(SETTINGS_KEYS);
  const setSettingsMutation = useSetSettings();

  // Form state
  const [dailyLeadsTarget, setDailyLeadsTarget] = useState<number>(
    DEFAULTS["compliance.targets.daily_contacts_per_rep"]
  );
  const [monthlyRevenueTarget, setMonthlyRevenueTarget] = useState<number>(
    DEFAULTS["compliance.targets.monthly_revenue"]
  );
  const [expectedWinRate, setExpectedWinRate] = useState<number>(
    DEFAULTS["compliance.thresholds.expected_win_rate"] * 100 // Store as percentage for UI
  );
  const [highValueThreshold, setHighValueThreshold] = useState<number>(
    DEFAULTS["compliance.thresholds.high_value_deal"]
  );

  // Track if form has changes
  const [hasChanges, setHasChanges] = useState(false);

  // Load settings into form when they arrive
  useEffect(() => {
    if (settings) {
      setDailyLeadsTarget(
        (settings["compliance.targets.daily_contacts_per_rep"] as number) ??
          DEFAULTS["compliance.targets.daily_contacts_per_rep"]
      );
      setMonthlyRevenueTarget(
        (settings["compliance.targets.monthly_revenue"] as number) ??
          DEFAULTS["compliance.targets.monthly_revenue"]
      );
      setExpectedWinRate(
        ((settings["compliance.thresholds.expected_win_rate"] as number) ??
          DEFAULTS["compliance.thresholds.expected_win_rate"]) * 100
      );
      setHighValueThreshold(
        (settings["compliance.thresholds.high_value_deal"] as number) ??
          DEFAULTS["compliance.thresholds.high_value_deal"]
      );
      setHasChanges(false);
    }
  }, [settings]);

  const handleFieldChange = (
    setter: (value: number) => void,
    value: string
  ) => {
    const numValue = parseFloat(value);
    if (!isNaN(numValue)) {
      setter(numValue);
      setHasChanges(true);
    }
  };

  const handleSave = () => {
    setSettingsMutation.mutate(
      {
        settings: [
          {
            key: "compliance.targets.daily_contacts_per_rep",
            value: dailyLeadsTarget,
            data_type: "number",
            description: "Daily leads target for sales team",
            category: "compliance",
          },
          {
            key: "compliance.targets.monthly_revenue",
            value: monthlyRevenueTarget,
            data_type: "number",
            description: "Monthly revenue target in USD",
            category: "compliance",
          },
          {
            key: "compliance.thresholds.expected_win_rate",
            value: expectedWinRate / 100, // Store as decimal
            data_type: "number",
            description: "Expected deal win rate (0-1)",
            category: "compliance",
          },
          {
            key: "compliance.thresholds.high_value_deal",
            value: highValueThreshold,
            data_type: "number",
            description: "Threshold for high-value leads in USD",
            category: "compliance",
          },
        ],
      },
      {
        onSuccess: () => {
          toast.success("Target settings saved successfully");
          setHasChanges(false);
        },
        onError: (err) => {
          toast.error(apiErrorMessage(err, "Failed to save target settings"));
        },
      }
    );
  };

  const handleReset = () => {
    if (settings) {
      setDailyLeadsTarget(
        (settings["compliance.targets.daily_contacts_per_rep"] as number) ??
          DEFAULTS["compliance.targets.daily_contacts_per_rep"]
      );
      setMonthlyRevenueTarget(
        (settings["compliance.targets.monthly_revenue"] as number) ??
          DEFAULTS["compliance.targets.monthly_revenue"]
      );
      setExpectedWinRate(
        ((settings["compliance.thresholds.expected_win_rate"] as number) ??
          DEFAULTS["compliance.thresholds.expected_win_rate"]) * 100
      );
      setHighValueThreshold(
        (settings["compliance.thresholds.high_value_deal"] as number) ??
          DEFAULTS["compliance.thresholds.high_value_deal"]
      );
    } else {
      setDailyLeadsTarget(DEFAULTS["compliance.targets.daily_contacts_per_rep"]);
      setMonthlyRevenueTarget(DEFAULTS["compliance.targets.monthly_revenue"]);
      setExpectedWinRate(DEFAULTS["compliance.thresholds.expected_win_rate"] * 100);
      setHighValueThreshold(DEFAULTS["compliance.thresholds.high_value_deal"]);
    }
    setHasChanges(false);
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64 mt-2" />
        </CardHeader>
        <CardContent className="space-y-6">
          {[1, 2, 3, 4].map((i) => (
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
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Target className="h-5 w-5" />
          Default Targets Configuration
        </CardTitle>
        <CardDescription>
          Configure system-wide default targets for sales performance tracking.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* These four fields read and write the same keys as the matching
            fields on the Compliance & Controls tab — one value, two places
            to edit it. Until 11 Sep 2026 this tab wrote separate `defaults.*`
            rows that the dashboards never read (the daily target here was
            silently shadowed by the compliance one), while a banner said
            the other three did nothing. */}
        <div className="rounded-md border border-muted bg-muted/40 p-3 text-sm text-muted-foreground">
          These are the same values as on the <strong>Compliance &amp; Controls</strong>{" "}
          tab (daily contacts per rep, monthly revenue target, expected win rate,
          high-value deal cut-off). Change them here or there; the dashboards read
          one value.
        </div>
        {/* Daily Leads Target */}
        <div className="space-y-2">
          <Label
            htmlFor="daily-leads-target"
            className="flex items-center gap-2"
          >
            <Target className="h-4 w-4 text-muted-foreground" />
            Daily Leads Target
          </Label>
          <Input
            id="daily-leads-target"
            type="number"
            min={1}
            value={dailyLeadsTarget}
            onChange={(e) => handleFieldChange(setDailyLeadsTarget, e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Number of new leads each sales rep should generate per day
          </p>
        </div>

        {/* Monthly Revenue Target */}
        <div className="space-y-2">
          <Label
            htmlFor="monthly-revenue-target"
            className="flex items-center gap-2"
          >
            <DollarSign className="h-4 w-4 text-muted-foreground" />
            Monthly Revenue Target (USD)
          </Label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
              $
            </span>
            <Input
              id="monthly-revenue-target"
              type="number"
              min={0}
              step={1000}
              className="pl-7"
              value={monthlyRevenueTarget}
              onChange={(e) =>
                handleFieldChange(setMonthlyRevenueTarget, e.target.value)
              }
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Team revenue target per month (currently: $
            {monthlyRevenueTarget.toLocaleString()})
          </p>
        </div>

        {/* Expected Win Rate */}
        <div className="space-y-2">
          <Label
            htmlFor="expected-win-rate"
            className="flex items-center gap-2"
          >
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
            Expected Win Rate (%)
          </Label>
          <div className="relative">
            <Input
              id="expected-win-rate"
              type="number"
              min={1}
              max={100}
              step={1}
              className="pr-8"
              value={expectedWinRate}
              onChange={(e) =>
                handleFieldChange(setExpectedWinRate, e.target.value)
              }
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
              %
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            Average percentage of deals expected to close (used for forecasting)
          </p>
        </div>

        {/* High Value Threshold */}
        <div className="space-y-2">
          <Label
            htmlFor="high-value-threshold"
            className="flex items-center gap-2"
          >
            <Gem className="h-4 w-4 text-muted-foreground" />
            High-Value Lead Threshold (USD)
          </Label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
              $
            </span>
            <Input
              id="high-value-threshold"
              type="number"
              min={0}
              step={1000}
              className="pl-7"
              value={highValueThreshold}
              onChange={(e) =>
                handleFieldChange(setHighValueThreshold, e.target.value)
              }
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Leads with estimated value above this are marked as high-value
            (currently: ${highValueThreshold.toLocaleString()})
          </p>
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-4 border-t">
          <Button
            onClick={handleSave}
            disabled={!hasChanges || setSettingsMutation.isPending}
          >
            {setSettingsMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Save Changes
          </Button>
          <Button
            variant="outline"
            onClick={handleReset}
            disabled={!hasChanges || setSettingsMutation.isPending}
          >
            Reset
          </Button>
        </div>

        {/* Info Box */}
        <div className="rounded-lg bg-muted/50 p-4 mt-4">
          <p className="text-sm text-muted-foreground">
            <strong>Note:</strong> Changes to these settings will affect all
            users immediately. Historical data and reports will continue to use
            the values that were in effect at the time of recording.
          </p>
        </div>
      </CardContent>
    </Card>
  );
};

export default TargetsConfigContent;
