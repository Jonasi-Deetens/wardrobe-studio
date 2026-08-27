import { Info, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { serialiseSpec } from "@/engine/spec/migrate";
import { ExportView } from "./export/ExportView";
import { copyToClipboard, downloadText } from "./lib/download";
import { encodeSpecToHash } from "./lib/persistence";
import { useBelow } from "./lib/useMediaQuery";
import { useAutosave, usePersistedGroups, useSession } from "./lib/useSession";
import { NestingView } from "./nesting/NestingView";
import { PanelView } from "./panel/PanelView";
import { ParameterPanel } from "./params/ParameterPanel";
import { PartsView } from "./parts/PartsView";
import { Drawer } from "./shell/Drawer";
import { ErrorBoundary } from "./shell/ErrorBoundary";
import { ResizeHandle, usePaneWidth } from "./shell/ResizablePane";
import { SummaryPanel } from "./shell/SummaryPanel";
import { ModeBar, TopBar } from "./shell/TopBar";
import { useKeyboard } from "./shell/useKeyboard";
import { useStudio } from "./store/useStudio";
import { Button } from "./ui";
import { TooltipProvider } from "./ui/Tooltip";
import { Viewport } from "./viewport/Viewport";

/**
 * Three panes: parameters, the work surface, and the consequences.
 *
 * The viewport stays mounted across every mode. Remounting a WebGL canvas costs a visible
 * hitch and loses the camera, and the 3D view is also what the export panel captures for
 * the booklet cover — so it is hidden rather than unmounted.
 *
 * Below `md` there is not room for three panes, so the outer two become drawers opened
 * from the top bar. They are the same components either way: a phone gets every parameter
 * and every number the desktop does, because a design you cannot edit is not much use on
 * the one device you have in your pocket at the merchant's.
 */
export function App() {
  const mode = useStudio((state) => state.mode);
  const spec = useStudio((state) => state.spec);
  const notices = useStudio((state) => state.notices);
  const dismissNotices = useStudio((state) => state.dismissNotices);

  const { restored } = useSession();
  useAutosave(restored);
  usePersistedGroups(restored);
  useKeyboard();

  const [leftWidth, resizeLeft, resetLeft] = usePaneWidth("ws:left", 316, 240, 520);
  const [rightWidth, resizeRight, resetRight] = usePaneWidth("ws:right", 300, 240, 460);

  const paramsAreDrawer = useBelow("md");
  const summaryIsDrawer = useBelow("lg");
  const [paramsOpen, setParamsOpen] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);

  /* Rotating a phone to landscape can put a panel back on screen inline; leaving the
     drawer open over the top of it would then show the same panel twice. */
  useEffect(() => {
    if (!paramsAreDrawer) setParamsOpen(false);
  }, [paramsAreDrawer]);
  useEffect(() => {
    if (!summaryIsDrawer) setSummaryOpen(false);
  }, [summaryIsDrawer]);

  const save = useCallback(() => {
    const name = spec.meta.name.trim() || "wardrobe";
    downloadText(
      `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.json`,
      serialiseSpec(spec),
      "application/json",
    );
  }, [spec]);

  const copyLink = useCallback(() => {
    void (async () => {
      try {
        const hash = await encodeSpecToHash(spec);
        const url = `${window.location.origin}${window.location.pathname}${hash}`;
        window.history.replaceState(null, "", hash);
        const ok = await copyToClipboard(url);
        useStudio.setState({
          notices: [
            ok
              ? "Share link copied. The whole design travels in the link — nothing is uploaded."
              : "Could not reach the clipboard. The link is in the address bar.",
          ],
        });
      } catch (error) {
        useStudio.setState({
          notices: [
            `Could not build a share link: ${error instanceof Error ? error.message : "unknown error"}. Use Save to download the project file instead.`,
          ],
        });
      }
    })();
  }, [spec]);

  const showViewport = mode === "design";

  return (
    <TooltipProvider>
      <div className="flex h-full flex-col overflow-hidden">
        <TopBar
          onSave={save}
          onCopyLink={copyLink}
          onOpenParameters={() => setParamsOpen(true)}
          onOpenSummary={() => setSummaryOpen(true)}
        />

        {notices.length > 0 ? (
          <div className="flex max-h-32 shrink-0 items-start gap-2 overflow-y-auto border-b border-info/30 bg-info/[0.08] px-3 py-2">
            <Info className="mt-px size-3.5 shrink-0 text-info" />
            <ul className="min-w-0 flex-1 space-y-0.5">
              {notices.map((notice) => (
                <li key={notice} className="text-[11.5px] leading-snug text-muted">
                  {notice}
                </li>
              ))}
            </ul>
            <Button
              variant="ghost"
              size="icon"
              onClick={dismissNotices}
              aria-label="Dismiss messages"
              className="sm:size-7"
            >
              <X className="size-4 sm:size-3.5" />
            </Button>
          </div>
        ) : null}

        <div className="flex min-h-0 flex-1">
          <aside
            className="hidden min-h-0 shrink-0 md:block"
            style={{ width: leftWidth }}
            aria-label="Parameters"
          >
            <ErrorBoundary label="The parameter panel could not be drawn">
              <ParameterPanel />
            </ErrorBoundary>
          </aside>
          <div className="hidden md:block">
            <ResizeHandle
              ariaLabel="Resize the parameter panel"
              onResize={resizeLeft}
              onDoubleClick={resetLeft}
            />
          </div>

          <main className="relative min-h-0 min-w-0 flex-1">
            {/* Kept mounted; see the note above. */}
            <div className={showViewport ? "h-full" : "pointer-events-none absolute inset-0 -z-10 opacity-0"}>
              <ErrorBoundary label="The 3D view could not be drawn">
                <Viewport />
              </ErrorBoundary>
            </div>
            <ErrorBoundary>
              {mode === "parts" ? <PartsView /> : null}
              {mode === "nesting" ? <NestingView /> : null}
              {mode === "panel" ? <PanelView /> : null}
              {mode === "export" ? <ExportView /> : null}
            </ErrorBoundary>
          </main>

          <div className="hidden lg:block">
            <ResizeHandle
              ariaLabel="Resize the summary panel"
              onResize={(delta) => resizeRight(-delta)}
              onDoubleClick={resetRight}
            />
          </div>
          <aside
            className="hidden min-h-0 shrink-0 lg:block"
            style={{ width: rightWidth }}
            aria-label="Summary"
          >
            <ErrorBoundary label="The summary could not be drawn">
              <SummaryPanel />
            </ErrorBoundary>
          </aside>
        </div>

        <ModeBar />
      </div>

      {/* Only mounted while the panel has nowhere else to be, so the heavy parameter
          tree is not built twice on a desktop. */}
      {paramsAreDrawer ? (
        <Drawer
          open={paramsOpen}
          onOpenChange={setParamsOpen}
          side="left"
          title="Parameters"
          description="Every dimension, material and fitting in the design."
        >
          <ErrorBoundary label="The parameter panel could not be drawn">
            <ParameterPanel />
          </ErrorBoundary>
        </Drawer>
      ) : null}

      {summaryIsDrawer ? (
        <Drawer
          open={summaryOpen}
          onOpenChange={setSummaryOpen}
          side="right"
          title="Summary"
          description="Materials, cost and what the advisor has flagged."
        >
          <ErrorBoundary label="The summary could not be drawn">
            <SummaryPanel onNavigate={() => setSummaryOpen(false)} />
          </ErrorBoundary>
        </Drawer>
      ) : null}
    </TooltipProvider>
  );
}
