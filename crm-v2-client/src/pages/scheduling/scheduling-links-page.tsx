import { useMemo, useState } from "react";
import { format } from "date-fns";
import {
  CalendarClock,
  Copy,
  ExternalLink,
  Loader2,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import Container from "~/components/container";
import PageHeader from "~/components/page-header";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Skeleton } from "~/components/ui/skeleton";
import { Switch } from "~/components/ui/switch";
import { Textarea } from "~/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import {
  useCreateSchedulingLink,
  useDeleteSchedulingLink,
  useSchedulingLinks,
  useUpdateSchedulingLink,
  type AvailabilityWindow,
  type SchedulingLink,
  type SchedulingLinkLocation,
} from "~/api/scheduling";
import { handleApiError } from "~/api/axios";

interface FormState {
  slug: string;
  title: string;
  description: string;
  location_type: SchedulingLinkLocation;
  location_detail: string;
  duration_minutes: string;
  buffer_before_minutes: string;
  buffer_after_minutes: string;
  min_notice_minutes: string;
  max_days_ahead: string;
  timezone: string;
  is_active: boolean;
  // Default availability — Monday–Friday 9–17 in the owner timezone.
  // The full builder UI is a follow-up; we validate on the backend either way.
  availability: AvailabilityWindow[];
}

const DEFAULT_AVAILABILITY: AvailabilityWindow[] = [1, 2, 3, 4, 5].map((d) => ({
  day_of_week: d,
  start_minutes_from_midnight: 9 * 60,
  end_minutes_from_midnight: 17 * 60,
}));

const EMPTY_FORM: FormState = {
  slug: "",
  title: "",
  description: "",
  location_type: "zoom",
  location_detail: "",
  duration_minutes: "30",
  buffer_before_minutes: "0",
  buffer_after_minutes: "0",
  min_notice_minutes: "60",
  max_days_ahead: "30",
  timezone: "UTC",
  is_active: true,
  availability: DEFAULT_AVAILABILITY,
};

const LOCATION_OPTIONS: Array<{
  value: SchedulingLinkLocation;
  label: string;
}> = [
  { value: "zoom", label: "Zoom" },
  { value: "google_meet", label: "Google Meet" },
  { value: "teams", label: "Microsoft Teams" },
  { value: "phone", label: "Phone call" },
  { value: "in_person", label: "In person" },
  { value: "custom", label: "Custom (free text)" },
];

function copyPublicUrl(slug: string) {
  const base = window.location.origin;
  const url = `${base}/book/${slug}`;
  navigator.clipboard.writeText(url).then(
    () => toast.success("Booking link copied"),
    () => toast.error("Could not copy"),
  );
}

export default function SchedulingLinksPage() {
  const { data: links, isLoading } = useSchedulingLinks();
  const createMutation = useCreateSchedulingLink();
  const updateMutation = useUpdateSchedulingLink();
  const deleteMutation = useDeleteSchedulingLink();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  const isEdit = editingId !== null;
  const isSaving = createMutation.isPending || updateMutation.isPending;

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };

  const openEdit = (link: SchedulingLink) => {
    setEditingId(link.id);
    setForm({
      slug: link.slug,
      title: link.title,
      description: link.description ?? "",
      location_type: link.location_type,
      location_detail: link.location_detail ?? "",
      duration_minutes: String(link.duration_minutes),
      buffer_before_minutes: String(link.buffer_before_minutes),
      buffer_after_minutes: String(link.buffer_after_minutes),
      min_notice_minutes: String(link.min_notice_minutes),
      max_days_ahead: String(link.max_days_ahead),
      timezone: link.timezone,
      is_active: link.is_active,
      availability: link.availability ?? DEFAULT_AVAILABILITY,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    const payload = {
      title: form.title.trim(),
      description: form.description.trim() || undefined,
      location_type: form.location_type,
      location_detail: form.location_detail.trim() || undefined,
      duration_minutes: Number(form.duration_minutes),
      buffer_before_minutes: Number(form.buffer_before_minutes || 0),
      buffer_after_minutes: Number(form.buffer_after_minutes || 0),
      min_notice_minutes: Number(form.min_notice_minutes || 0),
      max_days_ahead: Number(form.max_days_ahead || 30),
      timezone: form.timezone.trim() || "UTC",
      is_active: form.is_active,
      availability: form.availability,
    };

    try {
      if (isEdit && editingId) {
        await updateMutation.mutateAsync({ id: editingId, dto: payload });
        toast.success("Link updated");
      } else {
        await createMutation.mutateAsync({
          slug: form.slug.trim().toLowerCase(),
          ...payload,
        });
        toast.success("Link created");
      }
      setDialogOpen(false);
    } catch (err) {
      toast.error(handleApiError(err));
    }
  };

  const handleDelete = async (id: string, title: string) => {
    if (!window.confirm(`Delete "${title}"? Existing bookings stay intact.`))
      return;
    try {
      await deleteMutation.mutateAsync(id);
      toast.success("Link deleted");
    } catch (err) {
      toast.error(handleApiError(err));
    }
  };

  const sorted = useMemo(
    () =>
      [...(links ?? [])].sort((a, b) => a.title.localeCompare(b.title)),
    [links],
  );

  return (
    <Container>
      <PageHeader
        title="Scheduling Links"
        subtitle="Share a public URL so clients book themselves into your calendar — provisional slots are grayed out for everyone else while a hold is active."
        actions={
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4 mr-2" /> New link
          </Button>
        }
      />

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : sorted.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No links yet</CardTitle>
            <CardDescription>
              Create your first booking link to share with prospects.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4 mr-2" /> New link
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {sorted.map((l) => (
            <Card key={l.id}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 justify-between">
                  <span className="flex items-center gap-2">
                    <CalendarClock className="h-4 w-4" /> {l.title}
                  </span>
                  {l.is_active ? (
                    <Badge variant="secondary">Active</Badge>
                  ) : (
                    <Badge variant="outline">Disabled</Badge>
                  )}
                </CardTitle>
                <CardDescription className="font-mono text-xs">
                  /book/{l.slug}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-muted-foreground">Duration: </span>
                    {l.duration_minutes}m
                  </div>
                  <div>
                    <span className="text-muted-foreground">Where: </span>
                    {l.location_type}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Min notice: </span>
                    {l.min_notice_minutes}m
                  </div>
                  <div>
                    <span className="text-muted-foreground">Horizon: </span>
                    {l.max_days_ahead}d
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => copyPublicUrl(l.slug)}
                  >
                    <Copy className="h-3.5 w-3.5 mr-1" /> Copy link
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      window.open(`/book/${l.slug}`, "_blank", "noopener")
                    }
                  >
                    <ExternalLink className="h-3.5 w-3.5 mr-1" /> Preview
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => openEdit(l)}
                  >
                    <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => handleDelete(l.id, l.title)}
                    disabled={deleteMutation.isPending}
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
                  </Button>
                </div>
                <div className="text-xs text-muted-foreground">
                  Updated {format(new Date(l.updated_at), "PP")}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {isEdit ? "Edit scheduling link" : "New scheduling link"}
            </DialogTitle>
            <DialogDescription>
              The slug becomes part of the public URL — keep it short and
              memorable. Availability defaults to Mon–Fri 9–17 in your
              timezone; tune it later from this dialog.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="slug">Slug</Label>
                <Input
                  id="slug"
                  placeholder="discovery-30"
                  value={form.slug}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, slug: e.target.value }))
                  }
                  disabled={isEdit}
                />
              </div>
              <div>
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  placeholder="30-minute discovery call"
                  value={form.title}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, title: e.target.value }))
                  }
                />
              </div>
            </div>

            <div>
              <Label htmlFor="description">Description (optional)</Label>
              <Textarea
                id="description"
                rows={3}
                placeholder="What should the invitee expect?"
                value={form.description}
                onChange={(e) =>
                  setForm((f) => ({ ...f, description: e.target.value }))
                }
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Location</Label>
                <Select
                  value={form.location_type}
                  onValueChange={(v) =>
                    setForm((f) => ({
                      ...f,
                      location_type: v as SchedulingLinkLocation,
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LOCATION_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="location_detail">Location detail</Label>
                <Input
                  id="location_detail"
                  placeholder="Address, dial-in, blurb…"
                  value={form.location_detail}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, location_detail: e.target.value }))
                  }
                />
              </div>
            </div>

            <div className="grid grid-cols-4 gap-3">
              <div>
                <Label htmlFor="duration_minutes">Duration (m)</Label>
                <Input
                  id="duration_minutes"
                  inputMode="numeric"
                  value={form.duration_minutes}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      duration_minutes: e.target.value.replace(/\D/g, ""),
                    }))
                  }
                />
              </div>
              <div>
                <Label htmlFor="buffer_after_minutes">Buffer after (m)</Label>
                <Input
                  id="buffer_after_minutes"
                  inputMode="numeric"
                  value={form.buffer_after_minutes}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      buffer_after_minutes: e.target.value.replace(/\D/g, ""),
                    }))
                  }
                />
              </div>
              <div>
                <Label htmlFor="min_notice_minutes">Min notice (m)</Label>
                <Input
                  id="min_notice_minutes"
                  inputMode="numeric"
                  value={form.min_notice_minutes}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      min_notice_minutes: e.target.value.replace(/\D/g, ""),
                    }))
                  }
                />
              </div>
              <div>
                <Label htmlFor="max_days_ahead">Max days ahead</Label>
                <Input
                  id="max_days_ahead"
                  inputMode="numeric"
                  value={form.max_days_ahead}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      max_days_ahead: e.target.value.replace(/\D/g, ""),
                    }))
                  }
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 items-center">
              <div>
                <Label htmlFor="timezone">Timezone</Label>
                <Input
                  id="timezone"
                  placeholder="UTC"
                  value={form.timezone}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, timezone: e.target.value }))
                  }
                />
              </div>
              <div className="flex items-center justify-end gap-2 mt-6">
                <Switch
                  id="is_active"
                  checked={form.is_active}
                  onCheckedChange={(v) =>
                    setForm((f) => ({ ...f, is_active: v }))
                  }
                />
                <Label htmlFor="is_active">Active</Label>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setDialogOpen(false)}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : null}
              {isEdit ? "Save changes" : "Create link"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Container>
  );
}
