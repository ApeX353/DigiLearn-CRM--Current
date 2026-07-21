import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Label } from "~/components/ui/label";
import { Input } from "~/components/ui/input";
import { Button } from "~/components/ui/button";
import { Switch } from "~/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { Badge } from "~/components/ui/badge";
import { Skeleton } from "~/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";
import { toast } from "sonner";
import { Bell, AlertTriangle, AlertCircle, Info } from "lucide-react";
import PageHeader from "~/components/page-header";
import Container from "~/components/container";
import { PipelineTabContent } from "~/components/pipelines/pipeline-tab-content";
import { AddStageDialog } from "~/components/pipelines/add-stage-dialog";
import { PipelineDialog } from "~/components/pipelines/pipeline-dialog";
import LeadSLAConfigContent from "~/components/leads/lead-sla-config-content";
import TargetsConfigContent from "~/components/admin/targets-config-content";
import { useSettings, useSetSettings } from "~/api/settings/use-settings";
import {
  useNotificationPreferences,
  useUpdateNotificationPreference,
} from "~/api/notifications/use-notifications";

// Canonical event types grouped by category
const EVENT_TYPE_GROUPS = [
  {
    label: "SLA Alerts",
    description: "Get notified when leads or deals approach or breach SLA deadlines",
    events: [
      { type: "lead.sla_at_risk", label: "Lead SLA At Risk", description: "Lead is approaching SLA deadline" },
      { type: "lead.sla_breached", label: "Lead SLA Breached", description: "Lead has exceeded SLA deadline" },
      { type: "deal.sla_at_risk", label: "Deal SLA At Risk", description: "Deal is approaching SLA deadline" },
      { type: "deal.sla_breached", label: "Deal SLA Breached", description: "Deal has exceeded SLA deadline" },
    ],
  },
  {
    label: "Follow-ups",
    description: "Reminders for scheduled follow-up activities",
    events: [
      { type: "lead.followup_due", label: "Lead Follow-up Due", description: "Scheduled lead follow-up is approaching" },
      { type: "lead.followup_missed", label: "Lead Follow-up Missed", description: "Lead follow-up was not completed on time" },
      { type: "deal.followup_due", label: "Deal Follow-up Due", description: "Scheduled deal follow-up is approaching" },
      { type: "deal.followup_missed", label: "Deal Follow-up Missed", description: "Deal follow-up was not completed on time" },
    ],
  },
  {
    label: "Tasks",
    description: "Task assignment and deadline notifications",
    events: [
      { type: "task.assigned", label: "Task Assigned", description: "A new task has been assigned to you" },
      { type: "task.overdue", label: "Task Overdue", description: "A task has passed its due date" },
      { type: "task.reminder", label: "Task Due Soon (24h)", description: "Reminder for tasks due tomorrow" },
    ],
  },
  {
    label: "Conversions",
    description: "Lead conversion milestones",
    events: [
      { type: "lead.converted_to_deal", label: "Lead Converted", description: "A lead has been converted to a deal" },
      { type: "lead.reversal_requested", label: "Lead Reversal Requested", description: "A converted lead reversal request needs review" },
      { type: "lead.reversal_approved", label: "Lead Reversal Approved", description: "A lead reversal request was approved" },
      { type: "lead.reversal_rejected", label: "Lead Reversal Rejected", description: "A lead reversal request was rejected" },
    ],
  },
];

const CHANNELS = [
  { key: "in-app" as const, label: "In-App", enabled: true },
  { key: "email" as const, label: "Email", enabled: false },
  { key: "whatsapp" as const, label: "WhatsApp", enabled: false },
];

const SEVERITY_OPTIONS = [
  { value: "info", label: "All", icon: Info },
  { value: "warning", label: "Warning+", icon: AlertTriangle },
  { value: "critical", label: "Critical Only", icon: AlertCircle },
];

const GENERAL_SETTINGS_KEYS = [
  "company_name",
  "company_website",
  "company_email",
  "company_phone",
  "currency",
  "timezone",
];

export default function SettingsPage() {
  // Load general settings
  const { data: generalSettings, isLoading: generalSettingsLoading } = useSettings(GENERAL_SETTINGS_KEYS);
  const { mutateAsync: saveSettings, isPending: isSavingSettings } = useSetSettings();

  // Company info state
  const [companyName, setCompanyName] = useState("");
  const [website, setWebsite] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  // Currency & Locale state
  const [currency, setCurrency] = useState("");
  const [timezone, setTimezone] = useState("");

  // Initialize form values when settings load
  useEffect(() => {
    if (generalSettings) {
      setCompanyName(String(generalSettings.company_name || "DigiLearn"));
      setWebsite(String(generalSettings.company_website || "https://digilearn.com"));
      setEmail(String(generalSettings.company_email || "contact@digilearn.com"));
      setPhone(String(generalSettings.company_phone || "+263 242 000 000"));
      setCurrency(String(generalSettings.currency || "USD"));
      setTimezone(String(generalSettings.timezone || "Africa/Harare"));
    }
  }, [generalSettings]);

  // Load notification preferences
  const { data: preferences = [], isLoading: prefsLoading } = useNotificationPreferences();
  const { mutateAsync: updatePreference, isPending: isUpdatingPref } = useUpdateNotificationPreference();

  // Get current preference value
  const getPreference = (eventType: string, channel: string) => {
    return preferences.find(p => p.event_type === eventType && p.channel === channel);
  };

  const isEnabled = (eventType: string, channel: string) => {
    const pref = getPreference(eventType, channel);
    return pref?.is_enabled ?? true; // Default to enabled
  };

  const getSeverityMin = (eventType: string, channel: string): string => {
    const pref = getPreference(eventType, channel);
    return (pref?.severity_min as string) ?? "info";
  };

  const handleToggle = async (eventType: string, channel: 'in-app' | 'email' | 'whatsapp', currentValue: boolean) => {
    try {
      await updatePreference({
        eventType,
        channel,
        data: { is_enabled: !currentValue },
      });
      toast.success("Preference updated");
    } catch (error) {
      toast.error("Failed to update preference");
    }
  };

  const handleSeverityChange = async (eventType: string, channel: 'in-app' | 'email' | 'whatsapp', severity: string) => {
    try {
      await updatePreference({
        eventType,
        channel,
        data: { severity_min: severity as "info" | "warning" | "critical" },
      });
      toast.success("Severity threshold updated");
    } catch (error) {
      toast.error("Failed to update preference");
    }
  };

  const handleSaveCompanyInfo = async () => {
    try {
      await saveSettings({
        settings: [
          { key: "company_name", value: companyName, data_type: "string" },
          { key: "company_website", value: website, data_type: "string" },
          { key: "company_email", value: email, data_type: "string" },
          { key: "company_phone", value: phone, data_type: "string" },
        ],
      });
      toast.success("Company information saved");
    } catch (error) {
      toast.error("Failed to save company information");
    }
  };

  const handleSaveCurrencyLocale = async () => {
    try {
      await saveSettings({
        settings: [
          { key: "currency", value: currency, data_type: "string" },
          { key: "timezone", value: timezone, data_type: "string" },
        ],
      });
      toast.success("Currency & locale settings saved");
    } catch (error) {
      toast.error("Failed to save currency & locale settings");
    }
  };

  return (
    <Container>
      <PageHeader
        title="Settings"
        subtitle="Configure your CRM preferences"
      />

    <section  className="p-4">
      <Tabs defaultValue="general" className="space-y-4">
        <TabsList>
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="pipeline">Pipeline Stages</TabsTrigger>
          <TabsTrigger value="notifications" data-testid="settings-notifications-tab">Notifications</TabsTrigger>
          <TabsTrigger value="lead-sla-config" data-testid="lead-sla-config-tab">Lead SLA Config</TabsTrigger>
          <TabsTrigger value="targets-config" data-testid="targets-config-tab">Targets Config</TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Company Information</CardTitle>
              <CardDescription>
                Update your company details
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {generalSettingsLoading ? (
                <div className="space-y-4">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : (
                <>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="company-name">Company Name</Label>
                      <Input
                        id="company-name"
                        value={companyName}
                        onChange={(e) => setCompanyName(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="website">Website</Label>
                      <Input
                        id="website"
                        value={website}
                        onChange={(e) => setWebsite(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email">Email</Label>
                      <Input
                        id="email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="phone">Phone</Label>
                      <Input
                        id="phone"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                      />
                    </div>
                  </div>
                  <Button
                    onClick={handleSaveCompanyInfo}
                    disabled={isSavingSettings}
                  >
                    {isSavingSettings ? "Saving..." : "Save Changes"}
                  </Button>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Currency & Locale</CardTitle>
              <CardDescription>
                Set your regional preferences
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {generalSettingsLoading ? (
                <div className="space-y-4">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : (
                <>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="currency">Currency</Label>
                      <Input
                        id="currency"
                        value={currency}
                        onChange={(e) => setCurrency(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="timezone">Timezone</Label>
                      <Input
                        id="timezone"
                        value={timezone}
                        onChange={(e) => setTimezone(e.target.value)}
                      />
                    </div>
                  </div>
                  <Button
                    onClick={handleSaveCurrencyLocale}
                    disabled={isSavingSettings}
                  >
                    {isSavingSettings ? "Saving..." : "Save Changes"}
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pipeline" className="space-y-4">
          <PipelineTabContent />
        </TabsContent>

        <TabsContent value="notifications" className="space-y-4" data-testid="notifications-settings">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5" />
                Notification Preferences
              </CardTitle>
              <CardDescription>
                Configure which notifications you receive and set minimum severity thresholds
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {prefsLoading ? (
                <div className="space-y-4">
                  {[1, 2, 3, 4].map((i) => (
                    <Skeleton key={i} className="h-32 w-full" />
                  ))}
                </div>
              ) : (
                <>
                  {EVENT_TYPE_GROUPS.map((group) => (
                    <div key={group.label} className="space-y-4">
                      <div>
                        <h3 className="text-lg font-semibold">{group.label}</h3>
                        <p className="text-sm text-muted-foreground">{group.description}</p>
                      </div>

                      <div className="rounded-lg border overflow-hidden">
                        <table className="w-full" data-testid={`preference-group-${group.label.toLowerCase().replace(/\s+/g, '-')}`}>
                          <thead className="bg-muted/50">
                            <tr>
                              <th className="text-left p-3 text-sm font-medium">Event Type</th>
                              {CHANNELS.map((channel) => (
                                <th key={channel.key} className="text-center p-3 text-sm font-medium w-24">
                                  {channel.label}
                                  {!channel.enabled && (
                                    <Badge variant="outline" className="ml-1 text-[10px]">Soon</Badge>
                                  )}
                                </th>
                              ))}
                              <th className="text-center p-3 text-sm font-medium w-36">Min Severity</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {group.events.map((event) => (
                              <tr key={event.type} className="hover:bg-muted/30" data-testid={`preference-row-${event.type}`}>
                                <td className="p-3">
                                  <div className="font-medium text-sm">{event.label}</div>
                                  <div className="text-xs text-muted-foreground">{event.description}</div>
                                </td>
                                {CHANNELS.map((channel) => (
                                  <td key={channel.key} className="text-center p-3">
                                    <Switch
                                      data-testid={`toggle-${event.type}-${channel.key}`}
                                      checked={isEnabled(event.type, channel.key)}
                                      disabled={!channel.enabled || isUpdatingPref}
                                      onCheckedChange={() => handleToggle(event.type, channel.key, isEnabled(event.type, channel.key))}
                                    />
                                  </td>
                                ))}
                                <td className="text-center p-3">
                                  <Select
                                    value={getSeverityMin(event.type, "in-app")}
                                    onValueChange={(value) => handleSeverityChange(event.type, "in-app", value)}
                                    disabled={isUpdatingPref}
                                  >
                                    <SelectTrigger className="w-32 mx-auto" data-testid={`severity-${event.type}`}>
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {SEVERITY_OPTIONS.map((option) => (
                                        <SelectItem key={option.value} value={option.value}>
                                          <div className="flex items-center gap-2">
                                            <option.icon className="h-3 w-3" />
                                            {option.label}
                                          </div>
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}

                  <div className="rounded-lg bg-muted/50 p-4 mt-6">
                    <p className="text-sm text-muted-foreground">
                      <strong>Note:</strong> Email and WhatsApp notification channels are coming soon.
                      Currently, only in-app notifications are active.
                    </p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="lead-sla-config" data-testid="lead-sla-config">
          <LeadSLAConfigContent/>
        </TabsContent>
        <TabsContent value="targets-config" data-testid="targets-config">
          <TargetsConfigContent/>
        </TabsContent>
      </Tabs>
</section>

      {/* Global Dialogs */}
      <AddStageDialog />
      <PipelineDialog />
    </Container>
  );
}
