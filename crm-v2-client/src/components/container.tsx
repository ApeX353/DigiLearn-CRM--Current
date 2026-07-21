import { cn } from "~/lib/utils";

/**
 * Page content wrapper.
 *
 * Previously applied `container mx-auto`, which caps content at
 * Tailwind's breakpoint-based max-widths (≤1536px on 2xl) and adds
 * auto horizontal margins. On a 4K display that left ~400px of dead
 * gutter on either side of every list page — lead list, school
 * list, invoices, quotes, activities, admin tables, etc. — which
 * was the whole reason those screens felt narrow and "floating".
 *
 * New contract: full-width by default. Callers that want a narrow,
 * centered column for form pages (create-quote, create-invoice,
 * profile settings, etc.) should pass `max-w-5xl mx-auto` (or
 * similar) via `className`. List pages don't have to change —
 * they just get the full viewport they always wanted.
 */
const Container = ({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) => {
  return (
    <section className={cn("w-full", className)}>{children}</section>
  );
};

export default Container;
