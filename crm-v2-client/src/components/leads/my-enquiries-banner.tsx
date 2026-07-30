import { useState } from "react";
import { toast } from "sonner";
import { MessageCircleQuestion, Send, Loader2 } from "lucide-react";
import { Button } from "~/components/ui/button";
import {
  useMyReversalRequests,
  useRespondToEnquiry,
} from "~/api/lead-reversal-requests";

/**
 * Rep-facing side of Enquiry (TEST-BACKLOG #12): when a manager asks for more
 * info on one of the rep's requests, this banner surfaces the question and
 * lets the rep answer. The manager can ask again afterwards.
 */
export function MyEnquiriesBanner() {
  const { data: requests = [] } = useMyReversalRequests();
  const respond = useRespondToEnquiry();
  const [answers, setAnswers] = useState<Record<string, string>>({});

  const awaiting = requests.filter((r) => r.awaiting_rep_response);
  if (awaiting.length === 0) return null;

  const send = (id: string) => {
    const msg = (answers[id] ?? "").trim();
    if (!msg) return;
    respond.mutate(
      { requestId: id, message: msg },
      {
        onSuccess: () => {
          toast.success("Response sent to your manager");
          setAnswers((a) => ({ ...a, [id]: "" }));
        },
        onError: (e: any) =>
          toast.error(e?.response?.data?.message ?? "Could not send response"),
      },
    );
  };

  return (
    <div className="mb-4 space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/30">
      <div className="flex items-center gap-2 text-sm font-medium text-amber-900 dark:text-amber-300">
        <MessageCircleQuestion className="h-4 w-4" /> Your manager asked for more
        info on {awaiting.length} request{awaiting.length === 1 ? "" : "s"}
      </div>
      {awaiting.map((r) => {
        const thread = r.enquiry_thread ?? [];
        const lastQ = [...thread].reverse().find((m) => m.by === "manager");
        return (
          <div
            key={r.id}
            className="rounded border bg-background p-2 text-sm"
            data-testid={`my-enquiry-${r.id}`}
          >
            <div className="text-xs text-muted-foreground">
              {r.lead_summary?.lead_name ?? "Lead"} ·{" "}
              {r.kind.replace(/_/g, " ")}
            </div>
            {lastQ && (
              <div className="mt-1">
                <span className="font-semibold">Q:</span> {lastQ.message}
              </div>
            )}
            <div className="mt-2 flex items-center gap-1">
              <input
                className="h-8 flex-1 rounded border px-2 text-sm"
                placeholder="Your answer…"
                value={answers[r.id] ?? ""}
                onChange={(e) =>
                  setAnswers((a) => ({ ...a, [r.id]: e.target.value }))
                }
                onKeyDown={(e) => e.key === "Enter" && send(r.id)}
              />
              <Button
                size="sm"
                disabled={respond.isPending}
                onClick={() => send(r.id)}
              >
                {respond.isPending ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Send className="h-3 w-3" />
                )}
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
