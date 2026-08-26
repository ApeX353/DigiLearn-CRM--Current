import { Link } from "react-router";

/**
 * APP-404-EB: the router had no catch-all, so an unknown URL rendered nothing
 * (blank content area). This gives unmatched routes an actual 404 with a way
 * back.
 */
export default function NotFoundPage() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
      <p className="text-4xl font-semibold text-muted-foreground">404</p>
      <p className="text-sm text-muted-foreground">
        We couldn&apos;t find that page.
      </p>
      <Link
        to="/"
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
      >
        Go to dashboard
      </Link>
    </div>
  );
}
