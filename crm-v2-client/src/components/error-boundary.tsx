import { Component, type ErrorInfo, type ReactNode } from "react";
import { newClientReference, recordRecentError } from "~/lib/diagnostics/recent-errors";

/**
 * APP-404-EB: the app previously had no error boundary, so any render-time
 * exception blanked the whole page (white screen) with nothing in the UI to
 * recover from. This top-level boundary catches those errors and shows a
 * recoverable fallback instead. Error boundaries must be class components —
 * there is no hook equivalent for componentDidCatch.
 *
 * Since 14 Oct 2026 the error is also recorded (and shipped to the API by the
 * client-event reporter) under a short code the user can quote, so a white
 * screen is no longer a dead end for support.
 */
interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  reference: string | null;
}

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false, reference: null };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true, reference: newClientReference() };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    const reference = this.state.reference ?? newClientReference();
    recordRecentError({
      kind: "render_error",
      message: `${reference}: ${error.message}`,
      stack: [error.stack, info.componentStack].filter(Boolean).join("\n--- component stack ---\n"),
    });
    console.error("Unhandled UI error:", reference, error, info.componentStack);
  }

  handleReload = (): void => {
    // Full reload is the safest reset for an unknown render failure.
    window.location.assign("/");
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
          <h1 className="text-lg font-semibold">Something went wrong</h1>
          <p className="max-w-md text-sm text-muted-foreground">
            The page hit an unexpected error. You can reload and try again — your
            data is safe.
          </p>
          {this.state.reference && (
            <p className="text-sm">
              If it keeps happening, quote this code to support:{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono">{this.state.reference}</code>
            </p>
          )}
          <button
            type="button"
            onClick={this.handleReload}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
