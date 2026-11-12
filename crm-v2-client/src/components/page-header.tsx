import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router";
import { Button } from "./ui/button";
import { cn } from "~/lib/utils";

/**
 * PageHeader — thin, action-first page bar.
 *
 * Product rule: every screen has exactly one page header, and it's
 * the breadcrumb + global actions row rendered by the dashboard
 * layout at the very top of every page. The large in-body banner
 * header that used to duplicate the breadcrumb has been retired.
 *
 * Render contract
 * ---------------
 * List / module pages (no back button):
 *   - title / subtitle / eyebrow are IGNORED — the breadcrumb owns it
 *   - only actions + children (filter/tab slot) render
 *   - with no actions and no children, the whole thing collapses to
 *     null and content starts immediately under the breadcrumb
 *
 * Detail pages (`hasBackButton`):
 *   - render the rich title + subtitle that carry the record's
 *     identity (name, status badges, location, SLA pills, etc.)
 *     because the breadcrumb only shows the raw id there
 *   - eyebrow / back button / actions render as before
 *
 * This heuristic matches how the codebase already uses the component:
 * list pages pass plain-string titles (decorative), detail pages pass
 * rich JSX titles (structural). No caller needs to change.
 */
interface PageHeaderProps {
  hasBackButton?: boolean;
  backButtonComponent?: React.ReactNode;
  /**
   * Rendered only on detail pages (hasBackButton === true). Ignored on
   * list/module pages because the top breadcrumb already shows it.
   */
  title?: React.ReactNode;
  /** Rendered only when the title renders. */
  subtitle?: React.ReactNode;
  /** Rendered only when the title renders. */
  eyebrow?: React.ReactNode;
  actions?: React.ReactNode;
  /** Content rendered under the action row (filters, tabs, chips). */
  children?: React.ReactNode;
  onBack?: () => void;
  className?: string;
  /** When true, pins the bar under the app topbar while scrolling. */
  sticky?: boolean;
  /** Horizontal alignment: narrow "container" (default) or full-width. */
  wide?: boolean;
  /** Retained for API stability; no longer affects rendering. */
  dense?: boolean;
}

const PageHeader = ({
  title,
  subtitle,
  eyebrow,
  actions,
  children,
  hasBackButton = false,
  backButtonComponent,
  onBack,
  className,
  sticky = false,
  wide = false,
}: PageHeaderProps) => {
  const navigate = useNavigate();

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      navigate(-1);
    }
  };

  // Detail pages (back button + record-identity block) keep their
  // title block. Everything else collapses.
  const renderIdentity = hasBackButton;

  const hasContent =
    hasBackButton || !!actions || !!children || renderIdentity;
  if (!hasContent) {
    return null;
  }

  const TitleComp =
    renderIdentity && title ? (
      typeof title === "string" ? (
        <h1 className="font-semibold text-base md:text-lg tracking-tight leading-tight truncate">
          {title}
        </h1>
      ) : (
        title
      )
    ) : null;

  const SubtitleComp =
    renderIdentity && subtitle ? (
      typeof subtitle === "string" ? (
        <p className="text-xs md:text-sm text-muted-foreground text-pretty max-w-3xl">
          {subtitle}
        </p>
      ) : (
        subtitle
      )
    ) : null;

  // Tight rhythm — the bar sits flush under the app topbar. Previous
  // py-2 + gap-1.5 left a visible empty band on list pages that only
  // carried a single dropdown; py-1 + gap-1 kills that band without
  // squishing the identity block on detail pages.
  const padY = "py-1";

  return (
    <div
      className={cn(
        "w-full bg-background",
        renderIdentity && "border-b border-border",
        // NOTE: `sticky top-16` was previously applied here. It only
        // made sense when pages scrolled with the window. Detail pages
        // now own their own `overflow-hidden` viewport wrapper and the
        // page bar must sit flush at offset 0 inside it — `top-16`
        // reserved 64px against the wrong scroll ancestor and caused
        // a visible dead band between the app topbar and the record
        // identity on every detail page.
        sticky && "backdrop-blur-sm bg-background/95",
        className,
      )}
    >
      <div
        className={cn(
          wide ? "w-full px-4 md:px-6" : "container mx-auto px-4 md:px-6",
        )}
      >
        <div className={cn("flex flex-col gap-1", padY)}>
          {/* Row: back + (identity OR nothing) + actions */}
          {(hasBackButton || renderIdentity || actions) && (
            <div className="flex items-start gap-2 md:gap-3">
              {hasBackButton && (
                <div className="shrink-0">
                  {backButtonComponent || (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={handleBack}
                      className="h-7 w-7"
                      aria-label="Go back"
                    >
                      <ArrowLeft className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              )}
              {renderIdentity && (
                // Identity block — eyebrow is rendered INLINE with the
                // title as a small uppercase pill instead of on its own
                // row above. That used to add a full line of height
                // ("DEAL" on its own row, title below) which pushed the
                // split workspace down; now the two read as a single
                // "[DEAL] Gateway Academy — LMS 2026" line.
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    {eyebrow && (
                      <span className="label-overline inline-flex items-center rounded-sm bg-muted/60 px-1.5 py-0.5 text-[10px] font-semibold tracking-wider text-muted-foreground">
                        {eyebrow}
                      </span>
                    )}
                    {TitleComp}
                  </div>
                  {SubtitleComp}
                </div>
              )}
              {actions && (
                <div
                  className={cn(
                    "flex shrink-0 items-center gap-2 flex-wrap",
                    renderIdentity ? "ml-auto" : "ml-auto",
                  )}
                >
                  {actions}
                </div>
              )}
            </div>
          )}
          {children && <div>{children}</div>}
        </div>
      </div>
    </div>
  );
};

export default PageHeader;
