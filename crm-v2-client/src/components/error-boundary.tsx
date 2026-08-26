import { Component, type ErrorInfo, type ReactNode } from "react";

/**
 * APP-404-EB: the app previously had no error boundary, so any render-time
 * exception blanked the whole page (white screen) with nothing in the UI to
 * recover from. This top-level boundary catches those errors and shows a
 * recoverable fallback instead. Error boundaries must be class components —
 * there is no hook equivalent for componentDidCatch.
 */
interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Keep a console breadcrumb; a real reporter can hook in here later.
    console.error("Unhandled UI error:", error, info.componentStack);
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
