import { AlertTriangle, Download, Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { getMaterial } from "@/engine/catalog/materials";
import { renderSheetDrawing } from "@/engine/drawing/sheet";
import { nestingToCsv } from "@/engine/export/csv";
import { cn } from "@/lib/cn";
import { DrawingCanvas } from "../drawing/DrawingCanvas";
import { saveFile } from "../lib/platform";
import { useBelow } from "../lib/useMediaQuery";
import { useStudio } from "../store/useStudio";
import { Button, Tooltip } from "../ui";
import { useNesting } from "./useNesting";

/**
 * Sheet layouts.
 *
 * The diagram is the same renderer the PDF uses, so the sheet you cut from on the saw is
 * the sheet you saw on screen. Waste is hatched rather than left blank because an empty
 * area reads as "nothing here" when it is actually the number you are trying to reduce.
 */
export function NestingView() {
  const nesting = useNesting();
  const hoverParts = useStudio((state) => state.hoverParts);
  const addNotices = useStudio((state) => state.addNotices);
  const [sheetIndex, setSheetIndex] = useState(0);
  const stacked = useBelow("lg");

  const sheets = nesting.result?.sheets ?? [];
  /* A smaller design needs fewer sheets, and the selection has to come back into
     range with it or the view sits on a sheet that no longer exists. */
  const clamped = Math.min(sheetIndex, Math.max(sheets.length - 1, 0));
  useEffect(() => {
    if (clamped !== sheetIndex) setSheetIndex(clamped);
  }, [clamped, sheetIndex]);

  const active = sheets[clamped];
  const drawing = useMemo(
    () => (active ? renderSheetDrawing(active, active.index + 1, sheets.length) : null),
    [active, sheets.length],
  );

  const cuts = useMemo(
    () => (active ? (nesting.result?.cuts ?? []).filter((cut) => cut.sheetIndex === active.index) : []),
    [active, nesting.result],
  );

  if (nesting.status === "working" && !nesting.result) {
    return (
      <div className="grid h-full place-items-center bg-bg">
        <p className="flex items-center gap-2 text-[12.5px] text-muted">
          <Loader2 className="size-4 animate-spin" />
          Nesting the panels…
        </p>
      </div>
    );
  }

  if (nesting.status === "error" || nesting.status === "unsupported") {
    return (
      <div className="grid h-full place-items-center bg-bg px-6">
        <div className="max-w-sm text-center">
          <AlertTriangle
            className={cn(
              "mx-auto size-5",
              nesting.status === "error" ? "text-error" : "text-warn",
            )}
          />
          <p
            className={cn(
              "mt-2 text-[12.5px] leading-relaxed",
              nesting.status === "error" ? "text-error" : "text-warn",
            )}
          >
            {nesting.status === "error" ? "Nesting failed. " : ""}
            {nesting.error}
          </p>
          <p className="mt-2 text-[11.5px] leading-relaxed text-faint">
            The cut list still has every panel and its as-cut size, so the sheets can be
            laid out by hand.
          </p>
        </div>
      </div>
    );
  }

  const unplaced =
    nesting.result && nesting.result.unplaced.length > 0 ? (
      <div className="m-2 rounded-md border border-error/40 bg-error/[0.08] p-2.5">
        <p className="flex items-center gap-1.5 text-[11.5px] font-medium text-error">
          <AlertTriangle className="size-3.5" />
          Too large for the sheet
        </p>
        <ul className="mt-1 space-y-0.5">
          {nesting.result.unplaced.map((part) => (
            <li key={part.id} className="text-[11px] leading-snug text-muted">
              {part.label} — {part.length} × {part.width}
            </li>
          ))}
        </ul>
      </div>
    ) : null;

  const csvButton = nesting.result ? (
    <Tooltip content="Placements and cut sequence as CSV">
      <Button
        variant="outline"
        size="sm"
        className="h-8 sm:h-7"
        onClick={() => {
          const result = nesting.result;
          if (!result) return;
          void (async () => {
            const outcome = await saveFile({
              suggestedName: "nesting.csv",
              kind: "csv",
              contents: nestingToCsv(result),
            });
            if (outcome.kind === "failed") {
              addNotices([`Could not save the nesting CSV: ${outcome.reason}`]);
            }
          })();
        }}
      >
        <Download className="size-3.5" />
        CSV
      </Button>
    </Tooltip>
  ) : null;

  const diagram = (
    <div className="flex min-h-0 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1 border-b border-line bg-surface px-3 py-2">
        <h1 className="text-[13px] font-semibold text-ink">
          {active ? `Sheet ${active.index + 1}` : "Nesting"}
        </h1>
        {active ? (
          <p className="tabular text-[11px] text-faint">
            {getMaterial(active.materialId).name} · {active.length} × {active.width} · trim{" "}
            {active.trim}
          </p>
        ) : null}
        <div className="ml-auto">{csvButton}</div>
      </div>

      {drawing ? (
        <DrawingCanvas drawing={drawing} className="min-h-0 flex-1" />
      ) : (
        <div className="grid min-h-0 flex-1 place-items-center text-[12.5px] text-faint">
          Nothing to nest.
        </div>
      )}
    </div>
  );

  const cutSequence = (
    <>
      <p className="px-3 py-2 text-[11px] leading-snug text-faint">
        Guillotine order: rip the sheet into strips, then crosscut each strip. Every cut clears the
        sheet, which is what makes the layout cuttable on a panel saw.
      </p>
      <ol className="pb-3">
        {cuts.map((cut) => (
          <li key={cut.sequence} className="flex gap-2 px-3 py-1">
            <span className="tabular w-5 shrink-0 text-right text-[11px] text-faint">
              {cut.sequence}
            </span>
            <span className="min-w-0">
              <span
                className={cn(
                  "mr-1.5 rounded px-1 py-px text-[10px] font-medium uppercase",
                  cut.kind === "rip" ? "bg-accent/20 text-accent" : "bg-info/20 text-info",
                )}
              >
                {cut.kind}
              </span>
              <span className="text-[11.5px] text-muted">{cut.description}</span>
            </span>
          </li>
        ))}
      </ol>
    </>
  );

  /* On a narrow screen a 210px sheet list would leave the diagram under 180px wide, which
     is useless for reading a layout. The list becomes a strip of chips across the top and
     the cut sequence a disclosure below, so the diagram gets the full width. */
  if (stacked) {
    return (
      <div className="flex h-full min-h-0 flex-col bg-bg">
        <div className="ws-scroll-none shrink-0 overflow-x-auto border-b border-line bg-surface">
          <div className="flex items-stretch gap-1.5 px-2 py-2">
            {sheets.map((sheet, index) => (
              <button
                key={sheet.index}
                type="button"
                onClick={() => {
                  setSheetIndex(index);
                  /* The tap stands in for the hover the desktop list uses: the panels on
                     this sheet stay lit in the 3D view when you go back to it. */
                  hoverParts(sheet.placements.map((placement) => placement.partId));
                }}
                className={cn(
                  "flex min-h-11 shrink-0 flex-col justify-center rounded-md border px-2.5 py-1 text-left transition-colors",
                  active?.index === sheet.index
                    ? "border-accent/50 bg-accent/[0.12]"
                    : "border-line bg-bg/40",
                )}
              >
                <span className="flex items-center gap-1.5">
                  <span
                    className="size-2.5 shrink-0 rounded-sm ring-1 ring-line"
                    style={{ background: getMaterial(sheet.materialId).color }}
                    aria-hidden
                  />
                  <span
                    className={cn(
                      "text-[12px] whitespace-nowrap",
                      active?.index === sheet.index ? "text-accent" : "text-ink",
                    )}
                  >
                    Sheet {sheet.index + 1}
                  </span>
                </span>
                <span className="tabular text-[10.5px] whitespace-nowrap text-faint">
                  {sheet.placements.length} parts · {sheet.wastePercent.toFixed(0)}%
                </span>
              </button>
            ))}
          </div>
        </div>

        {unplaced}
        <div className="min-h-0 flex-1">{diagram}</div>

        <details className="ws-scroll max-h-[45%] shrink-0 overflow-y-auto border-t border-line bg-surface">
          <summary className="sticky top-0 flex min-h-11 cursor-pointer list-none items-center bg-surface px-3 text-[11.5px] font-medium tracking-wide text-muted uppercase">
            Cut sequence · {cuts.length}
          </summary>
          {cutSequence}
        </details>
      </div>
    );
  }

  return (
    <div className="grid h-full min-h-0 grid-cols-[210px_minmax(0,1fr)] xl:grid-cols-[210px_minmax(0,1fr)_280px]">
      {/* Sheet list */}
      <aside className="ws-scroll min-h-0 overflow-y-auto border-r border-line bg-surface">
        <div className="sticky top-0 z-10 border-b border-line bg-surface/95 px-3 py-2 backdrop-blur">
          <h2 className="text-[11px] font-medium tracking-wide text-muted uppercase">
            Sheets · {sheets.length}
          </h2>
          {nesting.result ? (
            <p className="tabular mt-0.5 text-[11px] text-faint">
              {nesting.result.totalWastePercent.toFixed(1)}% waste
              {nesting.elapsedMs !== null ? ` · ${nesting.elapsedMs.toFixed(0)}ms` : ""}
              {nesting.stale ? " · updating" : ""}
            </p>
          ) : null}
        </div>
        <ul>
          {sheets.map((sheet, index) => (
            <li key={sheet.index}>
              <button
                type="button"
                onClick={() => setSheetIndex(index)}
                onMouseEnter={() => hoverParts(sheet.placements.map((p) => p.partId))}
                onMouseLeave={() => hoverParts([])}
                className={cn(
                  "w-full border-b border-line/40 px-3 py-2 text-left transition-colors",
                  active?.index === sheet.index ? "bg-accent/[0.12]" : "hover:bg-hover",
                )}
              >
                <span className="flex items-center gap-2">
                  <span
                    className="size-2.5 shrink-0 rounded-sm ring-1 ring-line"
                    style={{ background: getMaterial(sheet.materialId).color }}
                    aria-hidden
                  />
                  <span
                    className={cn(
                      "text-[12px]",
                      active?.index === sheet.index ? "text-accent" : "text-ink",
                    )}
                  >
                    Sheet {sheet.index + 1}
                  </span>
                </span>
                <span className="tabular mt-0.5 block text-[10.5px] text-faint">
                  {sheet.placements.length} parts · {sheet.wastePercent.toFixed(0)}% waste
                </span>
                <span className="mt-1 block h-1 overflow-hidden rounded-full bg-bg">
                  <span
                    className="block h-full rounded-full bg-accent/70"
                    style={{ width: `${Math.min(100, 100 - sheet.wastePercent)}%` }}
                  />
                </span>
              </button>
            </li>
          ))}
        </ul>

        {unplaced}
      </aside>

      {diagram}

      {/* Cut sequence */}
      <aside className="ws-scroll hidden min-h-0 overflow-y-auto border-l border-line bg-surface xl:block">
        <h2 className="sticky top-0 border-b border-line bg-surface/95 px-3 py-2 text-[11px] font-medium tracking-wide text-muted uppercase backdrop-blur">
          Cut sequence
        </h2>
        {cutSequence}
      </aside>
    </div>
  );
}
