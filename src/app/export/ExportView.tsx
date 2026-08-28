import {
  Boxes,
  FileArchive,
  FileCode2,
  FileSpreadsheet,
  FileText,
  FolderOpen,
  Loader2,
  Ruler,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import {
  bomToCsv,
  cutListToCsv,
  drillingToCsv,
  nestingToCsv,
  tubeScheduleToCsv,
  weldScheduleToCsv,
} from "@/engine/export/csv";
import { serialiseSpec } from "@/engine/spec/migrate";
import { cn } from "@/lib/cn";
import { canReveal, isDesktop, revealFile, saveFile, type SaveOutcome } from "../lib/platform";
import { useNesting } from "../nesting/useNesting";
import { UnitFilter } from "../shell/UnitFilter";
import { useAssembly, useUnitScope } from "../store/derived";
import { useStudio } from "../store/useStudio";
import { captureViews } from "../viewport/capture";
import { Button, Switch } from "../ui";
import { useExportWorker } from "./useExportWorker";

/**
 * Export.
 *
 * The booklet is the deliverable — cover, cut list, cutting diagrams, a page per panel and
 * a derived assembly sequence — and everything else here is a single artefact for when you
 * only need one. DXF carries the holes on layers named by diameter, which is what CAM
 * software wants: one tool per layer.
 */
type Outcome = {
  readonly done?: string;
  readonly caveat?: string;
  readonly path?: string | null;
  readonly cancelled?: boolean;
};

export function ExportView() {
  const scope = useUnitScope();
  const cutList = scope.cutList;
  const assembly = useAssembly();
  const nesting = useNesting();
  const spec = useStudio((state) => state.project);
  const runExport = useExportWorker();

  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  /* Where the last export landed, so the desktop build can offer to show it. */
  const [savedPath, setSavedPath] = useState<string | null>(null);
  const [options, setOptions] = useState({
    cuttingDiagrams: true,
    panelPages: true,
    drillingTable: false,
    assembly: true,
    coverViews: true,
  });

  const name = slug(spec.meta.name || "wardrobe");
  /* A desktop app asks where to put the file; a browser drops it in Downloads. The button
     should say which of those is about to happen. */
  const verb = isDesktop() ? "Save" : "Download";

  /**
   * Runs an export and reports what happened.
   *
   * A task can return a caveat: something that went wrong but not badly enough to abandon
   * the export. A booklet with a blank cover is still a usable booklet, but saying
   * "Booklet downloaded." and nothing else would hide the missing cover. It can also
   * replace the success line, for counts that are only known once the work is done.
   */
  const run = async (id: string, task: () => Promise<Outcome | void>, done: string) => {
    setBusy(id);
    setMessage(null);
    setSavedPath(null);
    try {
      /* Let the button paint its spinner before the build starts. */
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const outcome = (await task()) ?? {};
      if (outcome.cancelled) {
        setMessage(null);
        return;
      }
      const headline = outcome.done ?? done;
      setMessage(outcome.caveat ? `${headline} But ${outcome.caveat}` : headline);
      setSavedPath(outcome.path ?? null);
    } catch (error) {
      setMessage(error instanceof Error ? `Failed: ${error.message}` : "Export failed");
    } finally {
      setBusy(null);
    }
  };

  /**
   * Turns a save outcome into something `run` can report.
   *
   * A cancelled dialog is not a failure and must not be announced as one — the user pressed
   * Escape and knows perfectly well what happened.
   */
  const report = (outcome: SaveOutcome): Outcome => {
    if (outcome.kind === "cancelled") return { cancelled: true };
    if (outcome.kind === "failed") throw new Error(outcome.reason);
    return { path: outcome.path };
  };

  const booklet = () =>
    run(
      "pdf",
      async () => {
        /* The capture has to happen here: it reads the live WebGL canvas, which the worker
           cannot see. Only the finished PNG bytes travel. */
        const capture = options.coverViews
          ? captureViews(["iso", "front", "left"])
          : { views: [], problem: null };
        const result = await runExport({
          kind: "pdf",
          spec,
          unitId: scope.unitId,
          nest: nesting.result,
          views: capture.views,
          sections: {
            cuttingDiagrams: options.cuttingDiagrams,
            panelPages: options.panelPages,
            drillingTable: options.drillingTable,
            assembly: options.assembly,
          },
        });
        const saved = report(
          await saveFile({
            suggestedName: `${name}-booklet.pdf`,
            kind: "pdf",
            contents: result.bytes,
          }),
        );
        return { ...saved, caveat: capture.problem ?? undefined };
      },
      "Booklet saved.",
    );

  const dxfArchive = () =>
    run(
      "dxf",
      async () => {
        const result = await runExport({ kind: "dxf", spec, unitId: scope.unitId });
        const saved = report(
          await saveFile({
            suggestedName: `${name}-dxf.zip`,
            kind: "zip",
            contents: result.bytes,
          }),
        );
        return { ...saved, done: `${result.fileCount} DXF files archived.` };
      },
      "DXF files archived.",
    );

  /** The CSVs are cheap to build, so the only slow part is the user choosing a folder. */
  const saveCsv = (id: string, filename: string, csv: string, done: string) =>
    run(
      id,
      async () => report(await saveFile({ suggestedName: filename, kind: "csv", contents: csv })),
      done,
    );

  const sheetCount = cutList.materialTotals.reduce((sum, total) => sum + total.sheetsNeeded, 0);

  return (
    <div className="ws-scroll h-full overflow-y-auto bg-bg">
      <div className="mx-auto max-w-4xl px-6 py-8">
        <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-[19px] font-semibold tracking-tight text-ink">Export</h1>
            <p className="mt-1 text-[12.5px] leading-relaxed text-muted">
              Everything here is generated from the same model you see in the viewport. The drawings
              in the PDF and the DXF come from one renderer, so a hole cannot appear on paper and be
              missing from the machine file.
            </p>
          </div>
          <div className="shrink-0">
            <UnitFilter className="h-9" />
          </div>
        </header>

        {/* The booklet */}
        <section className="mb-6 rounded-xl border border-line bg-surface p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 className="flex items-center gap-2 text-[14px] font-semibold text-ink">
                <FileText className="size-4 text-accent" />
                Shop booklet
              </h2>
              <p className="mt-1 max-w-xl text-[12px] leading-relaxed text-muted">
                A printable A4 document: cover with the 3D views and the spec, the full cut list,
                cutting diagrams for every sheet, one page per panel with its drilling drawing, the
                hardware list, and a {assembly.steps.length}-step assembly sequence derived from the
                part graph.
              </p>
            </div>
            <Button variant="primary" size="md" disabled={busy !== null} onClick={booklet}>
              {busy === "pdf" ? <Loader2 className="size-4 animate-spin" /> : <FileText className="size-4" />}
              Build PDF
            </Button>
          </div>

          <div className="mt-4 grid gap-x-6 gap-y-1 border-t border-line/70 pt-3 sm:grid-cols-2">
            <Toggle
              label="Cutting diagrams"
              hint={nesting.result ? `${sheetCount} sheets` : "Nesting still running"}
              checked={options.cuttingDiagrams}
              disabled={!nesting.result}
              onChange={(cuttingDiagrams) => setOptions((o) => ({ ...o, cuttingDiagrams }))}
            />
            <Toggle
              label="One page per panel"
              hint={`${new Set(scope.parts.map((part) => part.label)).size} drawings`}
              checked={options.panelPages}
              onChange={(panelPages) => setOptions((o) => ({ ...o, panelPages }))}
            />
            <Toggle
              label="Assembly sequence"
              hint={`${assembly.steps.length} steps`}
              checked={options.assembly}
              onChange={(assemblyOn) => setOptions((o) => ({ ...o, assembly: assemblyOn }))}
            />
            <Toggle
              label="Drilling coordinate table"
              hint={`${cutList.holeCount} holes, for hand drilling`}
              checked={options.drillingTable}
              onChange={(drillingTable) => setOptions((o) => ({ ...o, drillingTable }))}
            />
            <Toggle
              label="3D views on the cover"
              hint="Captured from the viewport"
              checked={options.coverViews}
              onChange={(coverViews) => setOptions((o) => ({ ...o, coverViews }))}
            />
          </div>
        </section>

        {/* Individual artefacts */}
        <div className="grid gap-3 sm:grid-cols-2">
          <Card
            icon={<FileCode2 className="size-4 text-info" />}
            title="DXF per panel"
            body="Outline plus every hole, on layers named by diameter so CAM can assign one tool per layer. Face B is exported mirrored, as the panel lies when turned over."
            action={
              <Button variant="default" size="sm" disabled={busy !== null} onClick={dxfArchive}>
                {busy === "dxf" ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <FileArchive className="size-3.5" />
                )}
                {verb} ZIP
              </Button>
            }
          />

          <Card
            icon={<FileSpreadsheet className="size-4 text-ok" />}
            title="Cut list CSV"
            body="Every panel with its as-cut size, banding per edge, grain direction and hole count, plus material and cost totals."
            action={
              <Button
                variant="default"
                size="sm"
                disabled={busy !== null}
                onClick={() =>
                  saveCsv("cutlist", `${name}-cutlist.csv`, cutListToCsv(cutList), "Cut list saved.")
                }
              >
                <FileSpreadsheet className="size-3.5" />
                {verb}
              </Button>
            }
          />

          <Card
            icon={<Boxes className="size-4 text-warn" />}
            title="Hardware BOM CSV"
            body={`${cutList.bom.length} lines with quantities and what each is used for. Paste it straight into an order.`}
            action={
              <Button
                variant="default"
                size="sm"
                disabled={busy !== null}
                onClick={() =>
                  saveCsv("bom", `${name}-hardware.csv`, bomToCsv(cutList), "Hardware list saved.")
                }
              >
                <FileSpreadsheet className="size-3.5" />
                {verb}
              </Button>
            }
          />

          <Card
            icon={<Ruler className="size-4 text-accent" />}
            title="Drilling coordinates CSV"
            body="One row per hole: panel, face or edge, position from the datum corner, diameter and depth. For a digital rule or a simple coordinate drill."
            action={
              <Button
                variant="default"
                size="sm"
                disabled={busy !== null}
                onClick={() =>
                  saveCsv(
                    "drilling",
                    `${name}-drilling.csv`,
                    drillingToCsv(scope.parts),
                    "Drilling coordinates saved.",
                  )
                }
              >
                <FileSpreadsheet className="size-3.5" />
                {verb}
              </Button>
            }
          />

          <Card
            icon={<FileSpreadsheet className="size-4 text-info" />}
            title="Nesting CSV"
            body="Part placements per sheet with the guillotine cut sequence, for driving a beam saw or checking a layout by hand."
            action={
              <Button
                variant="default"
                size="sm"
                disabled={!nesting.result || busy !== null}
                onClick={() =>
                  nesting.result &&
                  saveCsv(
                    "nesting",
                    `${name}-nesting.csv`,
                    nestingToCsv(nesting.result),
                    "Nesting saved.",
                  )
                }
              >
                <FileSpreadsheet className="size-3.5" />
                {verb}
              </Button>
            }
          />

          {cutList.metal.memberCount > 0 ? (
            <Card
              icon={<FileSpreadsheet className="size-4 text-warn" />}
              title="Tube schedule CSV"
              body={`${cutList.metal.memberCount} pieces of section with both end cuts, weight and cost, plus the cutting list for each ${cutList.metal.nest.stockLength}mm bar.`}
              action={
                <Button
                  variant="default"
                  size="sm"
                  disabled={busy !== null}
                  onClick={() =>
                    saveCsv(
                      "tube",
                      `${name}-tube-schedule.csv`,
                      tubeScheduleToCsv(cutList),
                      "Tube schedule saved.",
                    )
                  }
                >
                  <FileSpreadsheet className="size-3.5" />
                  {verb}
                </Button>
              }
            />
          ) : null}

          {cutList.metal.weldCount > 0 ? (
            <Card
              icon={<FileSpreadsheet className="size-4 text-accent" />}
              title="Weld schedule CSV"
              body={`${cutList.metal.weldCount} joints and ${cutList.metal.weldMetres.toFixed(1)} m of weld, grouped by size and finish, with which are ground flush.`}
              action={
                <Button
                  variant="default"
                  size="sm"
                  disabled={busy !== null}
                  onClick={() =>
                    saveCsv(
                      "welds",
                      `${name}-weld-schedule.csv`,
                      weldScheduleToCsv(cutList),
                      "Weld schedule saved.",
                    )
                  }
                >
                  <FileSpreadsheet className="size-3.5" />
                  {verb}
                </Button>
              }
            />
          ) : null}

          <Card
            icon={<FileCode2 className="size-4 text-muted" />}
            title="Project JSON"
            body="The spec itself. Version-stamped and migrated on load, so a file saved today still opens after the app changes."
            action={
              <Button
                variant="default"
                size="sm"
                disabled={busy !== null}
                onClick={() =>
                  run(
                    "json",
                    async () =>
                      report(
                        await saveFile({
                          suggestedName: `${name}.wardrobe`,
                          kind: "project",
                          contents: serialiseSpec(spec),
                        }),
                      ),
                    "Project saved.",
                  )
                }
              >
                <FileCode2 className="size-3.5" />
                {verb}
              </Button>
            }
          />
        </div>

        {message ? (
          <div
            className={cn(
              "mt-5 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border px-3 py-2 text-[12px]",
              message.startsWith("Failed")
                ? "border-error/40 bg-error/[0.08] text-error"
                : message.includes(" But ")
                  ? "border-warn/40 bg-warn/[0.08] text-warn"
                  : "border-ok/30 bg-ok/[0.08] text-ok",
            )}
            role="status"
          >
            <span className="min-w-0 flex-1">{message}</span>
            {savedPath && canReveal() ? (
              <Button
                variant="outline"
                size="sm"
                className="shrink-0"
                onClick={() => void revealFile(savedPath)}
              >
                <FolderOpen className="size-3.5" />
                Show in folder
              </Button>
            ) : null}
          </div>
        ) : null}

        <section className="mt-8 border-t border-line pt-5">
          <h2 className="text-[13px] font-semibold text-ink">Assembly sequence</h2>
          <p className="mt-1 text-[12px] text-muted">
            Derived from the part graph rather than written by hand, so it cannot drift from the
            panels in this project.
          </p>
          <ol className="mt-4 space-y-3">
            {assembly.steps.map((step) => (
              <li key={step.index} className="flex gap-3">
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-raised text-[11px] font-semibold text-muted">
                  {step.index}
                </span>
                <div className="min-w-0">
                  <p className="text-[12.5px] font-medium text-ink">{step.title}</p>
                  <p className="mt-0.5 text-[12px] leading-relaxed text-muted">{step.detail}</p>
                  {step.rationale ? (
                    <p className="mt-1 text-[11.5px] leading-relaxed text-accent/90">
                      Why: {step.rationale}
                    </p>
                  ) : null}
                  {step.hardware.length > 0 ? (
                    <p className="mt-1 text-[11px] text-faint">
                      Hardware: {step.hardware.join(", ")}
                    </p>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
        </section>

        <p className="mt-8 border-t border-line pt-4 text-[11.5px] leading-relaxed text-faint">
          G-code is deliberately out of scope: post-processors are specific to the machine and its
          tool table, and a wrong one breaks cutters. DXF covers CAM import on every machine worth
          using.
        </p>
      </div>
    </div>
  );
}

function Card({
  icon,
  title,
  body,
  action,
}: {
  readonly icon: ReactNode;
  readonly title: string;
  readonly body: string;
  readonly action: ReactNode;
}) {
  return (
    <section className="flex flex-col rounded-xl border border-line bg-surface p-4">
      <h2 className="flex items-center gap-2 text-[13px] font-semibold text-ink">
        {icon}
        {title}
      </h2>
      <p className="mt-1.5 flex-1 text-[12px] leading-relaxed text-muted">{body}</p>
      <div className="mt-3">{action}</div>
    </section>
  );
}

function Toggle({
  label,
  hint,
  checked,
  disabled = false,
  onChange,
}: {
  readonly label: string;
  readonly hint?: string;
  readonly checked: boolean;
  readonly disabled?: boolean;
  readonly onChange: (checked: boolean) => void;
}) {
  return (
    <label
      className={cn(
        "flex items-center justify-between gap-3 py-1.5",
        disabled && "pointer-events-none opacity-45",
      )}
    >
      <span className="min-w-0">
        <span className="block text-[12px] text-ink">{label}</span>
        {hint ? <span className="block text-[11px] text-faint">{hint}</span> : null}
      </span>
      <Switch checked={checked && !disabled} onChange={onChange} label={label} />
    </label>
  );
}

function slug(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "wardrobe";
}
