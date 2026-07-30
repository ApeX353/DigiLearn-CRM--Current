import { useState } from "react";
import { toast } from "sonner";
import { MessageCircleQuestion, Send, Loader2 } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Badge } from "~/components/ui/badge";
import { useRaiseEnquiry } from "~/api/lead-reversal-requests";
import type { LeadReversalRequest } from "~/api/lead-reversal-requests";

/**
 * Manager-side Enquiry control on a review request (TEST-BACKLOG #12): shows
 * the question/answer thread and lets the manager ask the rep for more info
 * before deciding. The manager can ask again after the rep replies.
 */
export function RequestEnquiry({ request }: { request: LeadReversalRequest }) {
  const raise = useRaiseEnquiry();
  const [asking, setAsking] = useState(false);
  const [q, setQ] = useState("");
  const thread = request.enquiry_thread ?? [];

  const submit = () => {
    if (!q.trim()) return;
    raise.mutate(
      { requestId: request.id, message: q.trim() },
      {
        onSuccess: () => {
          toast.success("Enquiry sent to the rep");
          setQ("");
          setAsking(false);
        },
        onError: (e: any) =>
          toast.error(e?.response?.data?.message ?? "Could not send enquiry"),
      },
    );
  };

  return (
    <div className="mt-1 space-y-1">
      {request.awaiting_rep_response && (
        <Badge className="bg-amber-100 text-amber-800 text-[10px]">
          Awaiting rep reply
        </Badge>
      )}
      {thread.length > 0 && (
        <div className="max-w-[26ch] space-y-0.5 rounded border bg-muted/30 p-1.5 text-[10px]">
          {thread.slice(-3).map((m, i) => (
            <div key={i}>
              <span className="font-semibold">
                {m.by === "manager" ? "You" : "Rep"}:
              </span>{" "}
              {m.message}
            </div>
          ))}
        </div>
      )}
      {!asking ? (
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-[11px]"
          onClick={() => setAsking(true)}
          data-testid={`enquiry-ask-${request.id}`}
        >
          <MessageCircleQuestion className="mr-1 h-3 w-3" /> Ask for info
        </Button>
      ) : (
        <div className="flex items-center gap-1">
          <input
            className="h-7 w-40 rounded border px-2 text-[11px]"
            placeholder="Ask the rep…"
            value={q}
            autoFocus
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
          />
          <Button
            size="sm"
            className="h-7 px-2"
            disabled={raise.isPending}
            onClick={submit}
          >
            {raise.isPending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Send className="h-3 w-3" />
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
