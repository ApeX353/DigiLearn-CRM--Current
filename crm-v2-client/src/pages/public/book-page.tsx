import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { useParams } from "react-router";
import { CalendarClock, CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Skeleton } from "~/components/ui/skeleton";
import { Textarea } from "~/components/ui/textarea";
import {
  useConfirmBooking,
  useCreateHold,
  usePublicBookingView,
  type Hold,
  type Slot,
} from "~/api/scheduling";
import { handleApiError } from "~/api/axios";

/**
 * Public booking page — no auth.
 *
 * The flow mirrors Calendly:
 *
 *   1. Fetch the link metadata + slot grid via `/book/:slug`.
 *   2. Invitee picks a slot. We immediately call `/book/:slug/hold` to
 *      reserve the time; on the next refetch the slot shows as `held`
 *      for everyone else (grayed out).
 *   3. Invitee fills name + email + optional notes and confirms. The
 *      backend promotes the hold to a real Activity/Meeting and pushes
 *      to the rep's calendar.
 *
 * Hold has a short TTL (~5 minutes). We show a countdown so a
 * distracted invitee knows their reservation will lapse.
 */
export default function PublicBookingPage() {
  const { slug } = useParams<{ slug: string }>();
  const { data, isLoading, refetch } = usePublicBookingView(slug);
  const holdMutation = useCreateHold(slug);
  const confirmMutation = useConfirmBooking(slug);

  const [hold, setHold] = useState<Hold | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [now, setNow] = useState(() => new Date());

  // 1-second tick for the hold countdown. Cheap; only one timer at a time.
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  // If the hold expires while the form is open, drop it so the user
  // sees the slot freed up and can pick again.
  useEffect(() => {
    if (!hold) return;
    if (new Date(hold.expires_at) <= now) {
      setHold(null);
      toast.error("Your reservation timed out — please pick a slot again.");
      refetch();
    }
  }, [hold, now, refetch]);

  const slotsByDay = useMemo(() => {
    const map = new Map<string, Slot[]>();
    for (const s of data?.slots ?? []) {
      const day = format(new Date(s.start_at), "yyyy-MM-dd");
      const arr = map.get(day) ?? [];
      arr.push(s);
      map.set(day, arr);
    }
    return Array.from(map.entries()).slice(0, 14);
  }, [data?.slots]);

  const handlePickSlot = async (slot: Slot) => {
    if (slot.held) return;
    try {
      const created = await holdMutation.mutateAsync({
        start_at: slot.start_at,
        invitee_email: email || undefined,
      });
      setHold(created);
      // Refetch so the slot we just held appears grayed-out for anyone
      // else viewing this page concurrently.
      refetch();
    } catch (err) {
      toast.error(handleApiError(err));
      // Slot may have been picked by someone else in the same instant —
      // refresh the grid so the user sees the truth.
      refetch();
    }
  };

  const handleConfirm = async () => {
    if (!hold) return;
    if (!name.trim() || !email.trim()) {
      toast.error("Name and email are required");
      return;
    }
    try {
      await confirmMutation.mutateAsync({
        hold_id: hold.id,
        invitee_email: email.trim(),
        invitee_name: name.trim(),
        notes: notes.trim() || undefined,
      });
      setConfirmed(true);
    } catch (err) {
      toast.error(handleApiError(err));
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-3xl mx-auto p-8 space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="max-w-3xl mx-auto p-8">
        <Card>
          <CardHeader>
            <CardTitle>Link unavailable</CardTitle>
            <CardDescription>
              This booking link may have been removed or disabled.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (confirmed) {
    return (
      <div className="max-w-2xl mx-auto p-8">
        <Card>
          <CardHeader className="text-center">
            <CheckCircle2 className="h-12 w-12 mx-auto text-green-600" />
            <CardTitle>Booking confirmed</CardTitle>
            <CardDescription>
              {hold ? format(new Date(hold.start_at), "PPpp") : ""} —{" "}
              {data.link.duration_minutes} minutes with {data.link.owner.name}
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center text-sm text-muted-foreground">
            A calendar invite is on its way to {email}.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-8 grid md:grid-cols-[1fr_2fr] gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarClock className="h-4 w-4" /> {data.link.title}
          </CardTitle>
          <CardDescription>
            with {data.link.owner.name} · {data.link.duration_minutes} min
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {data.link.description ? (
            <p className="whitespace-pre-line">{data.link.description}</p>
          ) : null}
          <p className="text-muted-foreground">Times shown in your local timezone.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{hold ? "Confirm your details" : "Pick a time"}</CardTitle>
          {hold ? (
            <CardDescription>
              Slot held for{" "}
              {Math.max(
                0,
                Math.floor(
                  (new Date(hold.expires_at).getTime() - now.getTime()) / 1000,
                ),
              )}
              s — finish below to confirm.
            </CardDescription>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-4">
          {!hold ? (
            <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
              {slotsByDay.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No availability in the next few weeks. Try again later.
                </p>
              ) : (
                slotsByDay.map(([day, slots]) => (
                  <div key={day}>
                    <div className="text-sm font-medium mb-2">
                      {format(new Date(day), "EEEE, MMM d")}
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {slots.map((s) => (
                        <Button
                          key={s.start_at}
                          variant={s.held ? "secondary" : "outline"}
                          size="sm"
                          disabled={s.held || holdMutation.isPending}
                          // The grayed-out look on `held` is intentional —
                          // it tells the user "someone else is booking this
                          // exact slot right now" without exposing who.
                          className={
                            s.held
                              ? "opacity-50 cursor-not-allowed line-through"
                              : ""
                          }
                          onClick={() => handlePickSlot(s)}
                        >
                          {format(new Date(s.start_at), "HH:mm")}
                        </Button>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          ) : (
            <>
              <div className="text-sm">
                <span className="font-medium">Selected:</span>{" "}
                {format(new Date(hold.start_at), "PPpp")}
              </div>
              <div>
                <Label htmlFor="name">Your name</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Jane Doe"
                />
              </div>
              <div>
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="jane@example.com"
                />
              </div>
              <div>
                <Label htmlFor="notes">Anything we should know? (optional)</Label>
                <Textarea
                  id="notes"
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
              <div className="flex justify-between">
                <Button
                  variant="ghost"
                  onClick={() => {
                    setHold(null);
                    refetch();
                  }}
                  disabled={confirmMutation.isPending}
                >
                  Pick another time
                </Button>
                <Button
                  onClick={handleConfirm}
                  disabled={confirmMutation.isPending}
                >
                  {confirmMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : null}
                  Confirm booking
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
