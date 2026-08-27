import { AlertTriangle } from "lucide-react";
import { Component, Fragment, type ErrorInfo, type ReactNode } from "react";
import { clearAutosave } from "../lib/persistence";
import { undo, useStudio } from "../store/useStudio";
import { Button } from "../ui";

/**
 * The last line of defence.
 *
 * Everything on screen is derived from one spec, so a spec the engine cannot solve
 * takes the whole app down at once — and because the autosave restores that same spec
 * on the next load, the blank screen would come back for ever. So the recovery actions
 * are the important part of this component: reset the spec, or clear the autosave and
 * reload. Without a way to reach `clearAutosave()` the app can be bricked by one bad
 * value.
 *
 * This has to be a class: `componentDidCatch` has no hook equivalent.
 */

type Props = {
  readonly children: ReactNode;
  /** Shown above the error, to say which part of the app failed. */
  readonly label?: string;
};

type State = {
  readonly error: Error | null;
  /** Bumped to force the subtree to remount after a reset. */
  readonly attempt: number;
};

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null, attempt: 0 };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // No telemetry to send it to, but the stack is what a bug report needs.
    console.error("Wardrobe Studio failed to render", error, info.componentStack);
  }

  private readonly retry = (): void => {
    this.setState((state) => ({ error: null, attempt: state.attempt + 1 }));
  };

  private readonly undoAndRetry = (): void => {
    undo();
    this.retry();
  };

  private readonly reset = (): void => {
    useStudio.getState().resetToDefault();
    this.retry();
  };

  private readonly clearAndReload = (): void => {
    void clearAutosave().finally(() => {
      window.location.replace(
        `${window.location.origin}${window.location.pathname}`,
      );
    });
  };

  override render(): ReactNode {
    const { error, attempt } = this.state;
    if (!error) return <Fragment key={attempt}>{this.props.children}</Fragment>;

    return (
      <div className="flex h-full min-h-0 items-center justify-center overflow-auto p-6">
        <div className="w-full max-w-lg rounded-lg border border-danger/40 bg-danger/[0.06] p-5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-danger" />
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-fg">
                {this.props.label ?? "Something in this design could not be built"}
              </h2>
              <p className="mt-1.5 text-xs leading-relaxed text-muted">
                The last change produced a wardrobe the engine could not resolve. Your
                work is still saved, so undoing the change is usually enough. If the
                screen comes back empty on reload, clear the saved session.
              </p>
              <pre className="mt-3 max-h-32 overflow-auto rounded border border-line bg-surface px-2 py-1.5 text-[10.5px] leading-snug text-muted">
                {error.message || String(error)}
              </pre>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button variant="primary" size="sm" onClick={this.undoAndRetry}>
                  Undo the last change
                </Button>
                <Button size="sm" onClick={this.retry}>
                  Try again
                </Button>
                <Button size="sm" onClick={this.reset}>
                  Start from the default
                </Button>
                <Button variant="ghost" size="sm" onClick={this.clearAndReload}>
                  Clear the saved session and reload
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
}
