import { ArrowDown, ArrowUp, Circle, Search } from "lucide-react";
import { useMemo, useState } from "react";
import type { CutListRow } from "@/engine/cutlist";
import { PANEL_EDGES, type PanelEdge } from "@/engine/core/part";
import { cn } from "@/lib/cn";
import { useBelow } from "../lib/useMediaQuery";
import { UnitFilter } from "../shell/UnitFilter";
import { useProjectModel, useUnitScope } from "../store/derived";
import { useStudio } from "../store/useStudio";
import { Button, SegmentedControl, Select, Tooltip } from "../ui";

/**
 * The cut list.
 *
 * Rows are grouped by material because that is how the sheets get ordered and how the
 * saw operator works: everything in 18mm white first, then the 8mm backs. Hovering a row
 * highlights the panels in 3D, which is what makes the list and the model feel like one
 * object rather than two views that happen to agree.
 *
 * It covers the whole room, which is the point of ordering material for a room rather than
 * for a cupboard: two identical panels in two units collapse into one row of quantity 2 and
 * come off one board. The unit each row is used in is named on the row, and the filter
 * narrows the whole list to a single unit when one unit is being built.
 */

type SortKey = "label" | "quantity" | "length" | "width" | "thickness" | "holes";
type SortDirection = "asc" | "desc";

export function CutListView() {
  const { cutList } = useUnitScope();
  const project = useProjectModel();
  const hoverParts = useStudio((state) => state.hoverParts);
  const openPanelFor = useStudio((state) => state.openPanelFor);
  const selectPart = useStudio((state) => state.selectPart);
  const selectedPartId = useStudio((state) => state.selectedPartId);
  const narrow = useBelow("md");

  const [sort, setSort] = useState<{ key: SortKey; direction: SortDirection }>({
    key: "length",
    direction: "desc",
  });
  const [grouped, setGrouped] = useState<"material" | "flat">("material");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return cutList.rows;
    return cutList.rows.filter((row) =>
      `${row.label} ${row.material.name} ${row.length} ${row.width}`.toLowerCase().includes(needle),
    );
  }, [cutList.rows, query]);

  const sorted = useMemo(() => {
    const rows = [...filtered];
    const factor = sort.direction === "asc" ? 1 : -1;
    rows.sort((a, b) => {
      switch (sort.key) {
        case "label":
          return a.label.localeCompare(b.label) * factor;
        case "quantity":
          return (a.quantity - b.quantity) * factor;
        case "width":
          return (a.width - b.width) * factor;
        case "thickness":
          return (a.thickness - b.thickness) * factor;
        case "holes":
          return (a.holeCount * a.quantity - b.holeCount * b.quantity) * factor;
        case "length":
        default:
          return (a.length - b.length) * factor;
      }
    });
    return rows;
  }, [filtered, sort]);

  const groups = useMemo(() => {
    if (grouped === "flat") return [{ key: "all", label: "All panels", rows: sorted }];
    const map = new Map<string, { key: string; label: string; rows: CutListRow[] }>();
    for (const row of sorted) {
      const existing = map.get(row.material.id);
      if (existing) existing.rows.push(row);
      else map.set(row.material.id, { key: row.material.id, label: row.material.name, rows: [row] });
    }
    return [...map.values()];
  }, [sorted, grouped]);

  /* Which units a row is used in, spelled out rather than as ids — but only when there is
     more than one unit, because "Wardrobe" on every row of a one-unit project is noise. */
  const unitsOf = useMemo(() => {
    if (project.units.length < 2) return () => null;
    return (row: CutListRow): string | null =>
      row.unitIds.length === 0
        ? null
        : row.unitIds.map((id) => project.unitsById.get(id)?.name ?? id).join(" · ");
  }, [project]);

  const toggleSort = (key: SortKey) =>
    setSort((previous) =>
      previous.key === key
        ? { key, direction: previous.direction === "asc" ? "desc" : "asc" }
        : { key, direction: key === "label" ? "asc" : "desc" },
    );

  return (
    <div className="flex h-full min-h-0 flex-col bg-bg">
      <div className="shrink-0 border-b border-line bg-surface px-3 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-[13px] font-semibold text-ink">Cut list</h1>
          <span className="tabular text-[11.5px] text-faint">
            {cutList.partCount} panels · {cutList.rows.length} unique · {cutList.holeCount} holes
          </span>
          <UnitFilter className="h-9 sm:h-7" />
          <div className="relative ml-auto min-w-0 flex-1 sm:flex-none">
            <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-faint" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Filter panels"
              aria-label="Filter panels"
              className="h-9 w-full rounded-md border border-line bg-bg/60 pr-2 pl-7 text-[16px] text-ink outline-none placeholder:text-faint focus:border-accent/60 sm:h-7 sm:w-[170px] sm:text-[12.5px]"
            />
          </div>
          <SegmentedControl
            ariaLabel="Grouping"
            value={grouped}
            onChange={setGrouped}
            segments={[
              { value: "material", label: "By material" },
              { value: "flat", label: "Flat" },
            ]}
          />
        </div>

        {/* Column headers double as the sort control on a desktop. The cards have no
            headers to click, so sorting gets an explicit pair of controls instead. */}
        {narrow ? (
          <div className="mt-2 flex items-center gap-1.5">
            <span className="text-[11px] text-faint">Sort</span>
            <Select
              value={sort.key}
              onChange={(value) => setSort((previous) => ({ ...previous, key: value as SortKey }))}
              options={SORT_OPTIONS}
              className="h-9 flex-1 text-[13px]"
            />
            <Button
              size="icon"
              variant="outline"
              className="size-9 shrink-0"
              onClick={() =>
                setSort((previous) => ({
                  ...previous,
                  direction: previous.direction === "asc" ? "desc" : "asc",
                }))
              }
              aria-label={sort.direction === "asc" ? "Sort descending" : "Sort ascending"}
            >
              {sort.direction === "asc" ? (
                <ArrowUp className="size-4" />
              ) : (
                <ArrowDown className="size-4" />
              )}
            </Button>
          </div>
        ) : null}
      </div>

      <div className="ws-scroll min-h-0 flex-1 overflow-auto">
        {narrow ? (
          <div className="space-y-3 p-3">
            {groups.map((group) => (
              <section key={group.key}>
                {grouped === "material" ? (
                  <h2 className="mb-1.5 flex items-center gap-2">
                    <span
                      className="size-2.5 rounded-sm ring-1 ring-line"
                      style={{ background: group.rows[0]?.material.color }}
                      aria-hidden
                    />
                    <span className="text-[12px] font-medium text-ink">{group.label}</span>
                    <span className="tabular text-[11px] text-faint">
                      {group.rows.reduce((sum, row) => sum + row.quantity, 0)} panels
                    </span>
                  </h2>
                ) : null}
                <ul className="space-y-1.5">
                  {group.rows.map((row) => (
                    <PanelCard
                      key={row.key}
                      row={row}
                      units={unitsOf(row)}
                      selected={row.partIds.includes(selectedPartId ?? "")}
                      onSelect={() => selectPart(row.partIds[0] as string)}
                      onOpen={() => openPanelFor(row.partIds[0] as string)}
                    />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        ) : (
        <table className="w-full border-collapse text-[12px]">
          <thead className="sticky top-0 z-10 bg-surface/95 backdrop-blur">
            <tr className="border-b border-line text-left">
              <Th onClick={() => toggleSort("quantity")} sort={sort} sortKey="quantity" align="right" width="w-14">
                Qty
              </Th>
              <Th onClick={() => toggleSort("label")} sort={sort} sortKey="label">
                Panel
              </Th>
              <Th onClick={() => toggleSort("length")} sort={sort} sortKey="length" align="right" width="w-20">
                Length
              </Th>
              <Th onClick={() => toggleSort("width")} sort={sort} sortKey="width" align="right" width="w-20">
                Width
              </Th>
              <Th onClick={() => toggleSort("thickness")} sort={sort} sortKey="thickness" align="right" width="w-16">
                Thk
              </Th>
              <th className="w-24 px-2 py-1.5 text-[10.5px] font-medium tracking-wide text-faint uppercase">
                Grain
              </th>
              <th className="w-28 px-2 py-1.5 text-[10.5px] font-medium tracking-wide text-faint uppercase">
                <Tooltip content="Banded edges, by the panel's own edge labels" wide>
                  <span className="cursor-help">Banding</span>
                </Tooltip>
              </th>
              <Th onClick={() => toggleSort("holes")} sort={sort} sortKey="holes" align="right" width="w-16">
                Holes
              </Th>
              <th className="w-24" />
            </tr>
          </thead>
          {groups.map((group) => (
            <tbody key={group.key}>
              {grouped === "material" ? (
                <tr className="bg-raised/60">
                  <td colSpan={9} className="border-y border-line px-2 py-1">
                    <span className="flex items-center gap-2">
                      <span
                        className="size-2.5 rounded-sm ring-1 ring-line"
                        style={{ background: group.rows[0]?.material.color }}
                        aria-hidden
                      />
                      <span className="text-[11.5px] font-medium text-ink">{group.label}</span>
                      <span className="tabular text-[11px] text-faint">
                        {group.rows.reduce((sum, row) => sum + row.quantity, 0)} panels
                      </span>
                    </span>
                  </td>
                </tr>
              ) : null}
              {group.rows.map((row) => (
                <Row
                  key={row.key}
                  row={row}
                  units={unitsOf(row)}
                  selected={row.partIds.includes(selectedPartId ?? "")}
                  onEnter={() => hoverParts(row.partIds)}
                  onLeave={() => hoverParts([])}
                  onOpen={() => openPanelFor(row.partIds[0] as string)}
                />
              ))}
            </tbody>
          ))}
        </table>
        )}

        {sorted.length === 0 ? (
          <p className="px-3 py-8 text-center text-[12px] text-faint">No panels match that filter.</p>
        ) : null}

        <BandingTotals />
      </div>
    </div>
  );
}

const SORT_OPTIONS: readonly { readonly value: SortKey; readonly label: string }[] = [
  { value: "length", label: "Length" },
  { value: "width", label: "Width" },
  { value: "thickness", label: "Thickness" },
  { value: "quantity", label: "Quantity" },
  { value: "holes", label: "Holes" },
  { value: "label", label: "Name" },
];

const GRAIN_LABEL: Record<CutListRow["grain"], string> = {
  none: "grain: any",
  length: "grain ↕ length",
  width: "grain ↔ width",
};

/**
 * The same row as a card, for screens where nine columns will not fit.
 *
 * The two numbers that matter at the saw — length and width — are the largest thing on
 * the card, and the rest is a single line of secondary detail underneath. Tapping the
 * card selects the panel in 3D, which is the touch stand-in for hovering the table row.
 */
function PanelCard({
  row,
  units,
  selected,
  onSelect,
  onOpen,
}: {
  readonly row: CutListRow;
  readonly units: string | null;
  readonly selected: boolean;
  readonly onSelect: () => void;
  readonly onOpen: () => void;
}) {
  return (
    <li>
      <div
        className={cn(
          "rounded-lg border bg-surface/70 p-2.5",
          selected ? "border-accent/50 bg-accent/[0.07]" : "border-line",
        )}
      >
        <button
          type="button"
          onClick={onSelect}
          className="flex w-full items-start gap-2 text-left"
          aria-label={`Show ${row.label} in the 3D view`}
        >
          {row.quantity > 1 ? (
            <span className="tabular mt-px shrink-0 rounded bg-raised px-1.5 py-0.5 text-[11px] font-semibold text-muted">
              ×{row.quantity}
            </span>
          ) : null}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-medium text-ink">{row.label}</span>
            {units ? (
              <span className="block truncate text-[11px] text-faint">{units}</span>
            ) : null}
            <span className="tabular mt-0.5 block text-[15px] text-ink">
              {row.length} <span className="text-faint">×</span> {row.width}
              <span className="ml-1.5 text-[12px] text-faint">{row.thickness} thk</span>
            </span>
          </span>
        </button>

        <div className="mt-2 flex items-center gap-2">
          <span className="flex shrink-0 items-center gap-[3px]" aria-label="Banded edges">
            {EDGE_ORDER.map((edge) => {
              const banded = row.banding.find((entry) => entry.edge === edge);
              return (
                <span
                  key={edge}
                  className={cn(
                    "grid size-4 place-items-center rounded-sm text-[8.5px] font-semibold",
                    banded ? "bg-accent/25 text-accent" : "bg-bg/60 text-faint",
                  )}
                  title={banded ? `${banded.label}: ${banded.name}` : `${edge.toUpperCase()}: bare`}
                >
                  {edge.toUpperCase()}
                </span>
              );
            })}
          </span>
          <span className="min-w-0 flex-1 truncate text-[11px] text-faint">
            {GRAIN_LABEL[row.grain]}
            {row.holeCount > 0 ? ` · ${row.holeCount * row.quantity} holes` : ""}
          </span>
          <Button size="sm" variant="outline" className="h-8 shrink-0 px-2.5" onClick={onOpen}>
            Drawing
          </Button>
        </div>
      </div>
    </li>
  );
}

function Th({
  children,
  onClick,
  sort,
  sortKey,
  align = "left",
  width,
}: {
  readonly children: React.ReactNode;
  readonly onClick: () => void;
  readonly sort: { key: SortKey; direction: SortDirection };
  readonly sortKey: SortKey;
  readonly align?: "left" | "right";
  readonly width?: string;
}) {
  const active = sort.key === sortKey;
  return (
    <th className={cn("px-2 py-1.5", width)}>
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "flex w-full items-center gap-1 text-[10.5px] font-medium tracking-wide uppercase transition-colors",
          align === "right" ? "justify-end" : "justify-start",
          active ? "text-accent" : "text-faint hover:text-ink",
        )}
      >
        {children}
        {active ? (
          sort.direction === "asc" ? (
            <ArrowUp className="size-3" />
          ) : (
            <ArrowDown className="size-3" />
          )
        ) : null}
      </button>
    </th>
  );
}

const EDGE_ORDER: readonly PanelEdge[] = PANEL_EDGES;

function Row({
  row,
  units,
  selected,
  onEnter,
  onLeave,
  onOpen,
}: {
  readonly row: CutListRow;
  readonly units: string | null;
  readonly selected: boolean;
  readonly onEnter: () => void;
  readonly onLeave: () => void;
  readonly onOpen: () => void;
}) {
  return (
    <tr
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onDoubleClick={onOpen}
      className={cn(
        "border-b border-line/40 transition-colors",
        selected ? "bg-accent/[0.09]" : "hover:bg-surface/70",
      )}
    >
      <td className="tabular px-2 py-1 text-right text-muted">{row.quantity}</td>
      <td className="max-w-[280px] px-2 py-1">
        <span className="block truncate text-ink">{row.label}</span>
        {units ? <span className="block truncate text-[10.5px] text-faint">{units}</span> : null}
      </td>
      <td className="tabular px-2 py-1 text-right text-ink">{row.length}</td>
      <td className="tabular px-2 py-1 text-right text-ink">{row.width}</td>
      <td className="tabular px-2 py-1 text-right text-muted">{row.thickness}</td>
      <td className="px-2 py-1 text-[11px] text-muted">
        {row.grain === "none" ? (
          <span className="text-faint">any</span>
        ) : row.grain === "length" ? (
          "↕ length"
        ) : (
          "↔ width"
        )}
      </td>
      <td className="px-2 py-1">
        <span className="flex items-center gap-[3px]">
          {EDGE_ORDER.map((edge) => {
            const banded = row.banding.find((entry) => entry.edge === edge);
            return (
              <Tooltip
                key={edge}
                content={
                  banded
                    ? `${banded.label}: ${banded.name}`
                    : `${edge.toUpperCase()}: no banding`
                }
              >
                <span
                  className={cn(
                    "grid size-3.5 place-items-center rounded-sm text-[8px] font-semibold",
                    banded ? "bg-accent/25 text-accent" : "bg-bg/60 text-faint",
                  )}
                >
                  {edge.toUpperCase()}
                </span>
              </Tooltip>
            );
          })}
        </span>
      </td>
      <td className="tabular px-2 py-1 text-right text-muted">
        {row.holeCount * row.quantity}
      </td>
      <td className="px-2 py-1 text-right">
        <Button variant="ghost" size="sm" className="px-1.5 text-[11px]" onClick={onOpen}>
          Drawing
        </Button>
      </td>
    </tr>
  );
}

function BandingTotals() {
  const { cutList } = useUnitScope();
  if (cutList.bandingTotals.length === 0) return null;

  return (
    <div className="border-t border-line bg-surface/60 px-3 py-3">
      <h2 className="mb-2 flex items-center gap-1.5 text-[11px] font-medium tracking-wide text-muted uppercase">
        <Circle className="size-3" />
        Edge banding
      </h2>
      <ul className="tabular grid gap-x-6 gap-y-1 text-[11.5px] sm:grid-cols-2 lg:grid-cols-3">
        {cutList.bandingTotals.map((total) => (
          <li key={total.id} className="flex justify-between gap-3">
            <span className="truncate text-muted">{total.name}</span>
            <span className="shrink-0 text-ink">
              {total.metres.toFixed(1)} m
              <span className="ml-2 text-faint">{total.cost.toFixed(2)}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
