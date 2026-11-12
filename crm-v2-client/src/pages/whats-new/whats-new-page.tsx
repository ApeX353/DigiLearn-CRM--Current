import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import Container from "~/components/container";
import {
  Sparkles,
  Megaphone,
  Wallet,
  CalendarClock,
  Video,
  Mail,
  BarChart3,
  ShieldAlert,
  Copy,
  BellRing,
  History,
  ClipboardCheck,
  AlertCircle,
  ShieldCheck,
  Zap,
  type LucideIcon,
} from "lucide-react";

/**
 * What's New — release highlights for the current build.
 *
 * Visible to every role (see NavigationConfig). Content is a plain data
 * list so it is trivial to update for the next release.
 */
interface FeatureItem {
  icon: LucideIcon;
  title: string;
  description: string;
}

const NEW_FEATURES: FeatureItem[] = [
  {
    icon: Megaphone,
    title: "Campaigns",
    description:
      "Plan and run outbound campaigns, group the leads they touch, and track engagement from one place.",
  },
  {
    icon: Wallet,
    title: "Cash Requisitions",
    description:
      "Reps raise cash requisitions and managers or finance approve them, with a full approval trail on each request.",
  },
  {
    icon: AlertCircle,
    title: "Collections",
    description:
      "A dedicated view for chasing overdue invoices so nothing outstanding slips through the cracks.",
  },
  {
    icon: CalendarClock,
    title: "Scheduling Links & Calendar Sync",
    description:
      "Share a booking link for prospects to pick a slot, with two-way sync to your connected calendar.",
  },
  {
    icon: Video,
    title: "Video Meeting Links",
    description:
      "Attach video-call links to meetings automatically through connected video providers.",
  },
  {
    icon: Mail,
    title: "Email Sequences & Templates",
    description:
      "Reusable email templates and multi-step follow-up sequences to keep leads warm without manual effort.",
  },
  {
    icon: BarChart3,
    title: "Reports with Excel Export",
    description:
      "Sales-performance, pipeline and finance reports you can export to Excel for offline analysis and sharing.",
  },
  {
    icon: ShieldAlert,
    title: "Lead Escalations",
    description:
      "Stuck leads can be escalated to managers, who work them from a dedicated escalations queue.",
  },
  {
    icon: Copy,
    title: "Duplicate Detection",
    description:
      "The system flags likely duplicate leads and schools into a review queue to keep the database clean.",
  },
  {
    icon: BellRing,
    title: "Real-time Notifications",
    description:
      "Live in-app notifications so you hear about assignments, approvals and updates the moment they happen.",
  },
  {
    icon: History,
    title: "Audit Trail",
    description:
      "Every meaningful change is recorded, giving a complete, reviewable history on records.",
  },
  {
    icon: ClipboardCheck,
    title: "Approval Queue & Compliance Report",
    description:
      "A central approval queue for pending actions plus an admin compliance report for oversight.",
  },
];

const IMPROVEMENTS: FeatureItem[] = [
  {
    icon: ShieldCheck,
    title: "No more surprise logouts",
    description:
      "Signing in on a second device no longer knocks out your other active session.",
  },
  {
    icon: Zap,
    title: "More stable & faster",
    description:
      "Database connections are kept alive reliably, removing the intermittent errors seen under load.",
  },
  {
    icon: ShieldCheck,
    title: "Correct manager visibility",
    description:
      "Admins and sales managers now correctly see all invoices and quotes across the team.",
  },
];

function FeatureCard({ icon: Icon, title, description }: FeatureItem) {
  return (
    <Card className="h-full">
      <CardHeader className="gap-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </div>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
    </Card>
  );
}

export default function WhatsNewPage() {
  return (
    <Container className="p-4 md:p-6 max-w-6xl mx-auto">
      <div className="mb-6 flex items-start gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Sparkles className="h-6 w-6" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight">What's New</h1>
            <Badge variant="secondary">Latest release</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            A summary of the newest features and improvements in the CRM.
          </p>
        </div>
      </div>

      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          New features
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {NEW_FEATURES.map((f) => (
            <FeatureCard key={f.title} {...f} />
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Reliability & improvements
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {IMPROVEMENTS.map((f) => (
            <FeatureCard key={f.title} {...f} />
          ))}
        </div>
      </section>

      <CardContent className="mt-8 rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
        Have feedback on any of these? Share it in tomorrow's review so we can
        prioritise what matters most to the team.
      </CardContent>
    </Container>
  );
}
