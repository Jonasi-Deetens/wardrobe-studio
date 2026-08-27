import {
  AlertTriangle,
  CircleAlert,
  Info,
  Layers,
  PanelsTopLeft,
  Ruler,
  Sparkles,
} from "lucide-react";
import type { ReactNode } from "react";
import type { Finding, Severity } from "@/engine/advisor";
import { formatDim } from "@/engine/core/units";
import { cn } from "@/lib/cn";
import { useDerived } from "../store/derived";
import { useNesting } from "../nesting/useNesting";
import { useStudio } from "../store/useStudio";
import { Tooltip } from "../ui";

/**
 * The right pane: what the design costs you.
 *
 * It updates on every keystroke so the trade-off is visible while you are making it —
 * push the depth out by 30mm and you can watch the sheet count tick over before you
 * commit to it.
 */
export function SummaryPanel({
  onNavigate,
}: {
  /** Called when a tap here changes what the work surface shows, so a drawer can close. */
  readonly onNavigate?: () => void;
} = {}) {
  const { model, cutList, findings } = useDerived();
  const nesting = useNesting();
  const selectPart = useStudio((state) => state.selectPart);
  const hoverParts = useStudio((state) => state.hoverParts);
  const setModeInStore = useStudio((state) => state.setMode);

  const setMode = (mode: Parameters<typeof setModeInStore>[0]): void => {
    setModeInStore(mode);
    onNavigate?.();
  };

  const sheets = nesting.result?.sheetCount ?? null;
  const waste = nesting.result?.totalWastePercent ?? null;
  const banding = cutList.bandingTotals.reduce((sum, total) => sum + total.metres, 0);

  return (
    <div className="ws-scroll flex h-full min-h-0 flex-col overflow-y-auto bg-surface">
      <Section title="Summary" icon={<Sparkles className="size-3.5" />}>
        <div className="grid grid-cols-2 gap-2 px-3 pb-3">
          <Stat label="Panels" value={String(cutList.partCount)} onClick={() => setMode("parts")} />
          <Stat
            label="Sheets"
            value={sheets === null ? (nesting.status === "working" ? "…" : "—") : String(sheets)}
            onClick={() => setMode("nesting")}
          />
          <Stat label="Holes" value={String(cutList.holeCount)} />
          <Stat
            label="Waste"
            value={waste === null ? "—" : `${waste.toFixed(1)}%`}
            tone={waste !== null && waste > 30 ? "warn" : undefined}
          />
        </div>
      </Section>

      <Section title="Dimensions" icon={<Ruler className="size-3.5" />}>
        <dl className="tabular space-y-1 px-3 pb-3 text-[11.5px]">
          <Row
            label="Internal width"
            value={formatDim(model.frame.interior.x1 - model.frame.interior.x0)}
          />
          <Row
            label="Internal height"
            value={formatDim(model.frame.interior.y1 - model.frame.interior.y0)}
          />
          <Row
            label="Internal depth"
            value={formatDim(model.frame.interior.z1 - model.frame.interior.z0)}
          />
          <Row label="Bays" value={String(model.bays.length)} />
          {model.leaves.length > 0 ? (
            <Row
              label="Leaf width"
              value={`${formatDim(Math.round(model.leaves[0]?.width ?? 0))}${model.leaves.length > 1 ? " ea" : ""}`}
            />
          ) : null}
        </dl>
        {model.frame.snapNotes.length > 0 ? (
          <ul className="mx-3 mb-3 space-y-1 rounded-md border border-info/25 bg-info/[0.07] px-2.5 py-2">
            {model.frame.snapNotes.map((note) => (
              <li key={note.parameter} className="text-[11px] leading-snug text-muted">
                <span className="text-info">{note.parameter}</span> {note.requested} → {note.built}
                <span className="text-faint"> · {note.reason}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </Section>

      <Section title="Material" icon={<Layers className="size-3.5" />}>
        <div className="space-y-2 px-3 pb-3">
          {cutList.materialTotals.map((total) => (
            <div key={total.material.id} className="space-y-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="flex min-w-0 items-center gap-1.5">
                  <span
                    className="size-2.5 shrink-0 rounded-sm ring-1 ring-line"
                    style={{ background: total.material.color }}
                    aria-hidden
                  />
                  <span className="truncate text-[11.5px] text-muted">{total.material.name}</span>
                </span>
                <span className="tabular shrink-0 text-[11.5px] text-ink">
                  {total.sheetsNeeded} sh
                </span>
              </div>
              <div className="flex justify-between text-[10.5px] text-faint">
                <span>
                  {total.partCount} panels · {total.area.toFixed(2)} m²
                </span>
                <span className="tabular">{total.cost.toFixed(2)}</span>
              </div>
            </div>
          ))}
          <div className="border-t border-line/60 pt-2">
            <Row label="Edge banding" value={`${banding.toFixed(1)} m`} />
            <Row label="Hardware" value={cutList.hardwareCost.toFixed(2)} />
            <Row label="Labour" value={cutList.labourCost.toFixed(2)} />
            <div className="mt-1 flex justify-between border-t border-line/60 pt-1.5">
              <span className="text-[12px] font-medium text-ink">Estimate</span>
              <span className="tabular text-[12px] font-medium text-accent">
                {cutList.totalCost.toFixed(2)}
              </span>
            </div>
          </div>
        </div>
      </Section>

      <Section
        title={`Advice${findings.length > 0 ? ` · ${findings.length}` : ""}`}
        icon={<PanelsTopLeft className="size-3.5" />}
      >
        {findings.length === 0 ? (
          <p className="px-3 pb-3 text-[11.5px] leading-snug text-faint">
            Nothing to flag. Every shelf span, hinge and runner is inside its limit.
          </p>
        ) : (
          <ul className="space-y-1 px-2 pb-3">
            {findings.map((finding) => (
              <FindingRow
                key={finding.id}
                finding={finding}
                onEnter={() => hoverParts(finding.partId ? [finding.partId] : [])}
                onLeave={() => hoverParts([])}
                onClick={() => {
                  if (!finding.partId) return;
                  selectPart(finding.partId);
                  onNavigate?.();
                }}
              />
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

function Section({
  title,
  icon,
  children,
}: {
  readonly title: string;
  readonly icon: ReactNode;
  readonly children: ReactNode;
}) {
  return (
    <section className="border-b border-line">
      <h2 className="flex items-center gap-1.5 px-3 py-2 text-[11.5px] font-medium tracking-wide text-muted uppercase">
        <span className="text-faint">{icon}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Stat({
  label,
  value,
  tone,
  onClick,
}: {
  readonly label: string;
  readonly value: string;
  readonly tone?: "warn";
  readonly onClick?: () => void;
}) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      {...(onClick ? { type: "button" as const, onClick } : {})}
      className={cn(
        "rounded-md border border-line bg-bg/40 px-2.5 py-2 text-left",
        onClick && "transition-colors hover:border-line-strong hover:bg-hover",
      )}
    >
      <span
        className={cn(
          "tabular block text-[17px] leading-none font-semibold",
          tone === "warn" ? "text-warn" : "text-ink",
        )}
      >
        {value}
      </span>
      <span className="mt-1 block text-[10.5px] tracking-wide text-faint uppercase">{label}</span>
    </Tag>
  );
}

function Row({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-faint">{label}</span>
      <span className="text-muted">{value}</span>
    </div>
  );
}

const SEVERITY_ICON: Record<Severity, ReactNode> = {
  error: <CircleAlert className="size-3.5" />,
  warning: <AlertTriangle className="size-3.5" />,
  advice: <Info className="size-3.5" />,
};

const SEVERITY_CLASS: Record<Severity, string> = {
  error: "text-error",
  warning: "text-warn",
  advice: "text-info",
};

function FindingRow({
  finding,
  onEnter,
  onLeave,
  onClick,
}: {
  readonly finding: Finding;
  readonly onEnter: () => void;
  readonly onLeave: () => void;
  readonly onClick: () => void;
}) {
  const setSearch = useStudio((state) => state.setSearch);

  return (
    <li>
      <div
        role={finding.partId ? "button" : undefined}
        tabIndex={finding.partId ? 0 : undefined}
        onMouseEnter={onEnter}
        onMouseLeave={onLeave}
        onClick={onClick}
        onKeyDown={(event) => {
          if (event.key === "Enter") onClick();
        }}
        className={cn(
          "rounded-md px-2 py-1.5 transition-colors",
          finding.partId && "cursor-pointer hover:bg-hover",
        )}
      >
        <div className="flex items-start gap-1.5">
          <span className={cn("mt-px shrink-0", SEVERITY_CLASS[finding.severity])}>
            {SEVERITY_ICON[finding.severity]}
          </span>
          <div className="min-w-0">
            <p className="text-[11.5px] leading-snug font-medium text-ink">{finding.title}</p>
            <p className="mt-0.5 text-[11px] leading-snug text-faint">{finding.detail}</p>
            {finding.parameter ? (
              <Tooltip content="Find this parameter">
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    setSearch(finding.parameter as string);
                  }}
                  className="mt-1 text-[10.5px] text-accent/90 hover:text-accent hover:underline"
                >
                  {finding.parameter}
                </button>
              </Tooltip>
            ) : null}
          </div>
        </div>
      </div>
    </li>
  );
}
