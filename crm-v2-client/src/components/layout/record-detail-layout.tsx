/**
 * Reusable split-detail layout — Pipedrive-style two-column CRM record
 * page.
 *
 *   ┌──────────────────── dashboard topbar (h-16 sticky) ────────────────────┐
 *   │  breadcrumb, search, +Create, notifications                             │
 *   ├─────────────────────────────────────────────────────────────────────────┤
 *   │  (optional) identity bar — back button, record name, status pills…      │
 *   ├────────────────────────────────┬────────────────────────────────────────┤
 *   │                                │                                        │
 *   │  LEFT pane — overview          │  RIGHT pane — engagement workspace     │
 *   │  (scrolls independently)       │  (scrolls independently)               │
 *   │                                │                                        │
 *   │                                │                                        │
 *   └────────────────────────────────┴────────────────────────────────────────┘
 *
 * Height math:
 *   - The outer wrapper sizes itself to `100dvh - 64px` (topbar height)
 *     so the split fills the rest of the viewport.
 *   - Identity content lands at its natural height.
 *   - The split container uses `flex-1 min-h-0 overflow-hidden` so each
 *     pane can legitimately own its own `overflow-y-auto`.
 *
 * Responsive:
 *   - On lg+ (≥1024px) the two-column split is active and each pane
 *     scrolls independently.
 *   - Below lg the layout collapses to a single column, the outer
 *     wrapper drops its fixed height, and normal document scroll takes
 *     over — this is the better mobile UX than nested scroll areas.
 *
 * Column ratio:
 *   - Default 34 / 66 split (left gets `lg:w-[34%] xl:w-[30%]` so the
 *     right pane stays the dominant working area on wider desktops).
 *   - Overridable via the `leftWidthClassName` prop when a specific
 *     page needs a different balance.
 *
 * Usage example (lead detail):
 *
 *   <RecordDetailLayout
 *     identity={<LeadIdentityBar lead={lead} />}
 *     left={<LeadOverviewStack lead={lead} />}
 *     right={<LeadWorkspace leadId={lead.id} />}
 *   />
 */
import type { ReactNode } from "react";
import { cn } from "~/lib/utils";

interface RecordDetailLayoutProps {
  /**
   * Optional node rendered above the split — typically the page's
   * record-identity bar (back button, title, status pills, actions).
   */
  identity?: ReactNode;
  /** Summary / overview column (scrolls independently on desktop). */
  left: ReactNode;
  /** Engagement / activity column (scrolls independently on desktop). */
  right: ReactNode;
  /**
   * Tailwind width class for the left pane at `lg:` and above. Default
   * is an aggressive 34% / 66% split which works well for most CRMs.
   */
  leftWidthClassName?: string;
  className?: string;
  /**
   * If the parent page already supplies a fixed viewport height (e.g.
   * nested inside another layout), pass `false` to skip the internal
   * `100dvh - 64px` sizing.
   */
  fillViewport?: boolean;
}

export function RecordDetailLayout({
  identity,
  left,
  right,
  leftWidthClassName = "lg:w-[36%] xl:w-[32%] lg:max-w-[460px]",
  className,
  fillViewport = true,
}: RecordDetailLayoutProps) {
  return (
    <div
      className={cn(
        "flex flex-col",
        // On lg+ we want the whole workspace sized to the viewport
        // below the topbar so the two panes can scroll on their own.
        // The `minmax(0, …)` keeps flex children honest about their
        // intrinsic width so long content can't push the layout out.
        // Below lg we let the document scroll naturally — nested
        // scroll areas on a phone are bad news.
        fillViewport &&
          "lg:h-[calc(100dvh-64px)] lg:min-h-[calc(100dvh-64px)] lg:overflow-hidden",
        className,
      )}
    >
      {identity && <div className="shrink-0">{identity}</div>}

      <div
        className={cn(
          // Stack on mobile, split on desktop.
          "flex flex-col lg:flex-row",
          // Give the split room to expand to fill remaining height.
          "flex-1 min-h-0 lg:min-w-0",
        )}
      >
        {/* LEFT pane */}
        <aside
          className={cn(
            "border-b lg:border-b-0 lg:border-r border-border bg-background",
            "w-full shrink-0",
            leftWidthClassName,
            // Independent scroll on desktop; natural flow below lg.
            "lg:h-full lg:overflow-y-auto",
          )}
        >
          <div className="p-3 md:p-4 space-y-3 md:space-y-4">{left}</div>
        </aside>

        {/* RIGHT pane — dominant working area */}
        <section
          className={cn(
            "bg-muted/20",
            "w-full flex-1 min-w-0",
            // Independent scroll on desktop; natural flow below lg.
            "lg:h-full lg:overflow-y-auto",
          )}
        >
          <div className="p-3 md:p-4">{right}</div>
        </section>
      </div>
    </div>
  );
}
