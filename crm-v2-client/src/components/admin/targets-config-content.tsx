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

// Setting keys for targets
const SETTINGS_KEYS = [
  "defaults.daily_leads_target",
  "defaults.monthly_revenue_target",
  "defaults.expected_win_rate",
  "defaults.high_value_threshold",
];

// Default values (used when settings don't exist yet)
const DEFAULTS = {
  "defaults.daily_leads_target": 40,
  "defaults.monthly_revenue_target": 100000,
  "defaults.expected_win_rate": 0.25,
  "defaults.high_value_threshold": 20000,
};

const TargetsConfigContent = () => {
  const { data: settings, isLoading } = useSettings(SETTINGS_KEYS);
  const setSettingsMutation = useSetSettings();

  // Form state
  const [dailyLeadsTarget, setDailyLeadsTarget] = useState<number>(
    DEFAULTS["defaults.daily_leads_target"]
  );
  const [monthlyRevenueTarget, setMonthlyRevenueTarget] = useState<number>(
    DEFAULTS["defaults.monthly_revenue_target"]
  );
  const [expectedWinRate, setExpectedWinRate] = useState<number>(
    DEFAULTS["defaults.expected_win_rate"] * 100 // Store as percentage for UI
  );
  const [highValueThreshold, setHighValueThreshold] = useState<number>(
    DEFAULTS["defaults.high_value_threshold"]
  );

  // Track if form has changes
  const [hasChanges, setHasChanges] = useState(false);

  // Load settings into form when they arrive
  useEffect(() => {
    if (settings) {
      setDailyLeadsTarget(
        (settings["defaults.daily_leads_target"] as number) ??
          DEFAULTS["defaults.daily_leads_target"]
      );
      setMonthlyRevenueTarget(
        (settings["defaults.monthly_revenue_target"] as number) ??
          DEFAULTS["defaults.monthly_revenue_target"]
      );
      setExpectedWinRate(
        ((settings["defaults.expected_win_rate"] as number) ??
          DEFAULTS["defaults.expected_win_rate"]) * 100
      );
      setHighValueThreshold(
        (settings["defaults.high_value_threshold"] as number) ??
          DEFAULTS["defaults.high_value_threshold"]
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
            key: "defaults.daily_leads_target",
            value: dailyLeadsTarget,
            data_type: "number",
            description: "Daily leads target for sales team",
            category: "targets",
            is_public: true,
          },
          {
            key: "defaults.monthly_revenue_target",
            value: monthlyRevenueTarget,
            data_type: "number",
            description: "Monthly revenue target in USD",
            category: "targets",
            is_public: true,
          },
          {
            key: "defaults.expected_win_rate",
            value: expectedWinRate / 100, // Store as decimal
            data_type: "number",
            description: "Expected deal win rate (0-1)",
            category: "targets",
            is_public: true,
          },
          {
            key: "defaults.high_value_threshold",
            value: highValueThreshold,
            data_type: "number",
            description: "Threshold for high-value leads in USD",
            category: "targets",
            is_public: true,
          },
          // Keep the LIVE compliance keys (which the server dashboards/metrics
          // actually read) in sync with these public target defaults, so a
          // target set here takes effect on the reports instead of only the
          // rep-facing display. The public `defaults.*` rows above are what
          // reps see via /settings/public; these mirror them for the server.
          {
            key: "compliance.targets.monthly_revenue",
            value: monthlyRevenueTarget,
            data_type: "number",
            description: "Monthly revenue target (server metrics)",
            category: "compliance",
          },
          {
            key: "compliance.thresholds.expected_win_rate",
            value: expectedWinRate / 100,
            data_type: "number",
            description: "Expected win rate 0-1 (server metrics)",
            category: "compliance",
          },
          {
            key: "compliance.thresholds.high_value_deal",
            value: highValueThreshold,
            data_type: "number",
            description: "High-value deal threshold (server metrics)",
            category: "compliance",
          },
        ],
      },
      {
        onSuccess: () => {
          toast.success("Target settings saved successfully");
          setHasChanges(false);
        },
        onError: () => {
          toast.error("Failed to save target settings");
        },
      }
    );
  };

  const handleReset = () => {
    if (settings) {
      setDailyLeadsTarget(
        (settings["defaults.daily_leads_target"] as number) ??
          DEFAULTS["defaults.daily_leads_target"]
      );
      setMonthlyRevenueTarget(
        (settings["defaults.monthly_revenue_target"] as number) ??
          DEFAULTS["defaults.monthly_revenue_target"]
      );
      setExpectedWinRate(
        ((settings["defaults.expected_win_rate"] as number) ??
          DEFAULTS["defaults.expected_win_rate"]) * 100
      );
      setHighValueThreshold(
        (settings["defaults.high_value_threshold"] as number) ??
          DEFAULTS["defaults.high_value_threshold"]
      );
    } else {
      setDailyLeadsTarget(DEFAULTS["defaults.daily_leads_target"]);
      setMonthlyRevenueTarget(DEFAULTS["defaults.monthly_revenue_target"]);
      setExpectedWinRate(DEFAULTS["defaults.expected_win_rate"] * 100);
      setHighValueThreshold(DEFAULTS["defaults.high_value_threshold"]);
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
        {/* WIP notice — these controls are being migrated to the
            Compliance & Controls tab, which is the live source. */}
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
          <strong>🚧 Work in progress.</strong> Monthly Revenue Target,
          Expected Win Rate and High-Value Threshold below are being migrated —
          changing them here does <strong>not</strong> yet affect dashboards.
          Set those on the <strong>Compliance &amp; Controls</strong> tab, which
          is the live source. (Daily Leads Target here overlaps with that tab's
          "daily contacts per rep" — avoid setting both.)
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
