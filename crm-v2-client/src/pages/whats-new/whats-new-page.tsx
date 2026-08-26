import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import Container from "~/components/container";
import { usePermissions } from "~/hooks/use-permission";
import {
  Sparkles,
  Archive,
  BellRing,
  BookOpenCheck,
  CalendarCheck,
  ClipboardCheck,
  Coins,
  FileWarning,
  Link2,
  ListChecks,
  Lock,
  Receipt,
  ShieldCheck,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";

/**
 * What's New — release highlights, written for the person reading them.
 *
 * Two things this page is trying to do that the previous version did not:
 *
 * 1. SPEAK TO THE READER. A rep does not care that invoice statistics stopped
 *    double-counting split invoices; a manager does. A manager does not need
 *    telling how to log a call. Every item declares its `audience`, and the
 *    page leads with the items for whoever is looking. Nothing is hidden —
 *    the rest follows underneath — because people talk to each other and
 *    "why can't I see what she sees" is a worse problem than a long page.
 *
 * 2. SAY WHAT TO DO, NOT JUST WHAT CHANGED. Every item carries `what`
 *    (what is different) and `how` (what that means for you in practice).
 *    A release note that only announces is a release note nobody acts on.
 *
 * Updating for the next release: edit RELEASE_ITEMS. It is a plain data list
 * on purpose — no fetching, no CMS, no migration. Change RELEASE_LABEL too.
 */

const RELEASE_LABEL = "26 August 2026";

type Audience = "sales_rep" | "sales_manager" | "admin" | "finance";

interface ReleaseItem {
  icon: LucideIcon;
  title: string;
  /** What actually changed. */
  what: string;
  /** What it means for the reader, in practice. */
  how: string;
  audience: Audience[];
}

const RELEASE_ITEMS: ReleaseItem[] = [
  // ---------------------------------------------------------------- reps
  {
    icon: BookOpenCheck,
    title: "Log what happened, or plan ahead",
    what: "The activity composer now opens on two clear choices. Calls, messages and emails default to “Log what happened”.",
    how: "Logging a call you already made no longer asks you to invent a follow-up date, and no longer creates a “Follow-up:” task you never asked for. If you do want a next step, plan it deliberately.",
    audience: ["sales_rep", "sales_manager"],
  },
  {
    icon: Link2,
    title: "One conversation, one line",
    what: "When you log a call, you can tick “This also closes…” to close the meeting or task that same conversation settled.",
    how: "Stop leaving held meetings sitting “overdue” and stop running two follow-up chains for one relationship. Tick what the call covered and it closes with the same outcome.",
    audience: ["sales_rep", "sales_manager"],
  },
  {
    icon: ListChecks,
    title: "“Already planned” counts as your next step",
    what: "If the record already has an open, dated activity, you can nominate it as the next step instead of creating another row.",
    how: "When completing something, pick the step you have already booked. No duplicate tasks just to satisfy the next-step rule.",
    audience: ["sales_rep", "sales_manager"],
  },
  {
    icon: CalendarCheck,
    title: "Activities opens on Due today",
    what: "The Activities page now lands on “Due today” instead of the full open list.",
    how: "You see what you owe today the moment you arrive. Everything else is one click away on the To-do tab.",
    audience: ["sales_rep", "sales_manager"],
  },
  {
    icon: Receipt,
    title: "Payments need their bank reference",
    what: "Recording a payment now requires the real-world reference — bank ref, transfer ID or receipt number.",
    how: "Have the reference to hand before you record the payment. It is what lets finance match the money in the CRM against the bank statement, so a placeholder defeats the purpose.",
    audience: ["sales_rep", "sales_manager", "finance"],
  },
  {
    icon: Lock,
    title: "A converted lead is a record, not a workspace",
    what: "Once a lead converts, the whole lead record is read-only.",
    how: "Log calls, notes and delivery work against the DEAL it became. The lead stays as the history of how the deal started.",
    audience: ["sales_rep", "sales_manager"],
  },
  {
    icon: ClipboardCheck,
    title: "Disqualifying tells someone",
    what: "Asking to disqualify a lead raises an approval request, and the lead itself shows that it is waiting.",
    how: "Give the reason when you ask. If your manager needs more information you will be notified, and you answer in the same place — no chasing anyone.",
    audience: ["sales_rep"],
  },

  // ------------------------------------------------------------- managers
  {
    icon: BellRing,
    title: "Disqualification approvals reach you",
    what: "Requests arrive as a notification, and each lead shows whether it is waiting on you or on the rep.",
    how: "You no longer have to go looking for what needs deciding. Ask for more information and the rep is told; they answer and it comes back to you.",
    audience: ["sales_manager", "admin"],
  },
  {
    icon: Archive,
    title: "Disqualified leads move to Archive",
    what: "Dead leads leave the working list and live under an Archive tab, with the reason on the record.",
    how: "Your lead counts and SLA figures now describe live work only. Expect the totals to drop — that is the point, not a bug.",
    audience: ["sales_manager", "admin"],
  },
  {
    icon: TrendingUp,
    title: "Escalations stop skipping leads",
    what: "Leads whose history moved on were being skipped by the escalation sweep — some breached since March and never once escalated.",
    how: "Sixteen genuinely overdue leads will start escalating to you. They are not new problems; they were always there and were never surfaced.",
    audience: ["sales_manager", "admin"],
  },
  {
    icon: ShieldCheck,
    title: "An invoice status has to match the money",
    what: "An invoice can no longer be marked Paid unless the money is on it, or Partially-Paid with no payment recorded.",
    how: "If a badge looks wrong, record the payment — the status follows on its own. The refusal now tells you the invoice and the amounts instead of a generic error.",
    audience: ["sales_manager", "admin", "finance"],
  },
  {
    icon: Coins,
    title: "Won and Lost show real figures",
    what: "The Won and Lost tiles on the pipeline were showing NaN once a pipeline had more than one closed deal.",
    how: "They now total correctly. If you had stopped trusting those two numbers, they are worth looking at again.",
    audience: ["sales_manager", "admin", "finance"],
  },
  {
    icon: FileWarning,
    title: "Invoice figures stopped double-counting",
    what: "Split invoices were counted twice and drafts were counted as sales; a school's outstanding balance included instalment children and money already paid.",
    how: "Reported sales and outstanding balances are lower and truer. Compare against last week's figures before drawing conclusions from the change.",
    audience: ["sales_manager", "admin", "finance"],
  },

  // --------------------------------------------------------------- admins
  {
    icon: BellRing,
    title: "The notification flood is over",
    what: "An idle-lead alert re-fired every two hours forever — around 11,000 a day — and alerts stayed with people who no longer owned the lead.",
    how: "Bells are usable again. If someone still reports a wall of unread alerts, that is worth a ticket rather than a shrug.",
    audience: ["admin", "sales_manager"],
  },
  {
    icon: Receipt,
    title: "Duplicate March invoices cancelled",
    what: "The opening import ran twice in March, so eight sales were on the books twice. Six duplicate invoices are now Cancelled.",
    how: "Reported sales value drops by $101,400 — those sales were only ever counted twice. Two more pairs are still open pending confirmation of the customer names.",
    audience: ["admin", "finance"],
  },
];

const ROLE_TO_AUDIENCE: Record<string, Audience> = {
  sales_rep: "sales_rep",
  sales_manager: "sales_manager",
  manager: "sales_manager",
  admin: "admin",
  admin_support: "admin",
  finance: "finance",
};

const AUDIENCE_LABEL: Record<Audience, string> = {
  sales_rep: "for you as a sales rep",
  sales_manager: "for you as a sales manager",
  admin: "for you as an administrator",
  finance: "for you in finance",
};

function ItemCard({ icon: Icon, title, what, how }: ReleaseItem) {
  return (
    <Card className="h-full">
      <CardHeader className="gap-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </div>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{what}</CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        <p className="rounded-md bg-muted/50 p-3 text-sm text-foreground/80">
          <span className="font-medium">What this means: </span>
          {how}
        </p>
      </CardContent>
    </Card>
  );
}

export default function WhatsNewPage() {
  const { roles } = usePermissions();

  // A user can hold several roles (prince is sales_manager AND admin_support),
  // so collect every audience they belong to rather than picking one.
  const audiences = Array.from(
    new Set(
      (roles ?? [])
        .map((r) => ROLE_TO_AUDIENCE[r.name])
        .filter((a): a is Audience => Boolean(a)),
    ),
  );

  const forYou = audiences.length
    ? RELEASE_ITEMS.filter((i) => i.audience.some((a) => audiences.includes(a)))
    : RELEASE_ITEMS;
  const alsoInRelease = RELEASE_ITEMS.filter((i) => !forYou.includes(i));

  const audienceLine = audiences.length
    ? audiences.map((a) => AUDIENCE_LABEL[a]).join(" and ")
    : "across the whole team";

  return (
    <Container className="p-4 md:p-6 max-w-6xl mx-auto">
      <div className="mb-6 flex items-start gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Sparkles className="h-6 w-6" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight">What's New</h1>
            <Badge variant="secondary">{RELEASE_LABEL}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            What changed in the CRM, and what it means {audienceLine}.
          </p>
        </div>
      </div>

      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          {audiences.length ? "Most relevant to you" : "This release"}
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {forYou.map((item) => (
            <ItemCard key={item.title} {...item} />
          ))}
        </div>
      </section>

      {alsoInRelease.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Also in this release
          </h2>
          <p className="mb-3 text-sm text-muted-foreground">
            Aimed at other roles, but nothing here is hidden from you.
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {alsoInRelease.map((item) => (
              <ItemCard key={item.title} {...item} />
            ))}
          </div>
        </section>
      )}

      <CardContent className="mt-8 rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
        Something here not behaving as described? Raise it on the Bug Reports
        page — that is the fastest route to getting it looked at.
      </CardContent>
    </Container>
  );
}
