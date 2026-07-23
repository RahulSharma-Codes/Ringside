import React from "react";
import { Button } from "@/components/ui/button";

interface Props {
  children: React.ReactNode;
}

interface State {
  error: Error | null;
  detailsOpen: boolean;
}

/**
 * App-wide error boundary. Catches render-time crashes and shows a Ringside-
 * styled fallback instead of a blank white screen.
 *
 * Only wraps the authenticated shell — the login screen and accept-invite page
 * are outside this boundary intentionally.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { error: null, detailsOpen: false };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Always log so the error appears in the browser console / dev tools.
    console.error("[ErrorBoundary] Caught render error:", error);
    console.error("[ErrorBoundary] Component stack:", info.componentStack);
  }

  private handleReload = () => {
    // Clear the boundary state, which will attempt a re-render. If the error
    // persists the boundary will catch it again. A full reload is offered too.
    this.setState({ error: null, detailsOpen: false });
  };

  private handleHardReload = () => {
    window.location.reload();
  };

  private toggleDetails = () => {
    this.setState((s) => ({ detailsOpen: !s.detailsOpen }));
  };

  render() {
    const { error, detailsOpen } = this.state;

    if (!error) {
      return this.props.children;
    }

    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 relative overflow-hidden">
        {/* Background grid — same as login */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,hsl(var(--border)/0.3)_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--border)/0.3)_1px,transparent_1px)] bg-[size:64px_64px] pointer-events-none" />

        <div className="relative z-10 w-full max-w-md space-y-6">

          {/* Brand wordmark */}
          <div className="text-center space-y-2">
            <p className="text-[9px] font-mono uppercase tracking-[0.25em] text-muted-foreground/40">
              The Manipal Group · Corporate Development &amp; Strategy
            </p>
            <h1 className="font-sans font-bold text-4xl uppercase tracking-[0.15em] text-foreground">
              Ringside
            </h1>
          </div>

          {/* Error card */}
          <div className="border border-border/50 bg-card/70 backdrop-blur-sm rounded-2xl shadow-xl overflow-hidden">

            {/* Header strip */}
            <div className="px-7 pt-7 pb-5 border-b border-border/40 space-y-1">
              <div className="flex items-center gap-2">
                {/* Small red indicator dot */}
                <span className="inline-block w-2 h-2 rounded-full bg-destructive/70 flex-shrink-0" />
                <h2 className="font-sans font-semibold text-[15px] text-foreground tracking-tight">
                  Something went wrong
                </h2>
              </div>
              <p className="text-[11px] font-mono text-muted-foreground/60 leading-relaxed pl-4">
                An unexpected error occurred while rendering this page.
                Your data is safe — this is a display error only.
              </p>
            </div>

            {/* Actions */}
            <div className="px-7 py-6 space-y-3">
              <Button
                onClick={this.handleReload}
                className="w-full h-10 rounded-xl font-sans text-[13px] font-semibold tracking-normal"
              >
                Try again
              </Button>
              <Button
                variant="outline"
                onClick={this.handleHardReload}
                className="w-full h-10 rounded-xl font-sans text-[13px] font-semibold tracking-normal border-border/60"
              >
                Reload page
              </Button>

              {/* Collapsible error details */}
              <div className="pt-1">
                <button
                  type="button"
                  onClick={this.toggleDetails}
                  className="w-full text-left text-[10px] font-mono text-muted-foreground/40 hover:text-muted-foreground/70 transition-colors flex items-center gap-1.5"
                >
                  <span className="text-[8px]">{detailsOpen ? "▾" : "▸"}</span>
                  {detailsOpen ? "Hide" : "Show"} error details
                </button>

                {detailsOpen && (
                  <div className="mt-2 rounded-sm bg-muted/40 border border-border/30 p-3 max-h-40 overflow-y-auto">
                    <p className="text-[10px] font-mono text-destructive/80 break-all leading-relaxed whitespace-pre-wrap">
                      {error.name}: {error.message}
                    </p>
                    {error.stack && (
                      <p className="mt-2 text-[9px] font-mono text-muted-foreground/40 break-all leading-relaxed whitespace-pre-wrap">
                        {error.stack}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="text-center">
            <p className="text-[9px] font-mono text-muted-foreground/20 uppercase tracking-wider">
              Confidential · Authorised users only · All activity is logged
            </p>
          </div>

        </div>
      </div>
    );
  }
}
