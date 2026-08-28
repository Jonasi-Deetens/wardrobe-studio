import { UnitFilter } from "../shell/UnitFilter";
import { useUnitScope } from "../store/derived";

const KIND_LABELS: Record<string, string> = {
  hinge: "Hinges",
  slide: "Drawer runners",
  handle: "Handles",
  rail: "Hanging rails",
  connector: "Carcase connectors",
  "shelf-support": "Shelf supports",
  leg: "Levelling legs",
  screw: "Screws and fixings",
  other: "Other",
};

/**
 * The hardware list, grouped by kind. It sits beside the cut list because ordering the
 * hardware is the long-lead item: you can cut panels the same day, but a missing hinge
 * stops the job.
 */
export function BomView() {
  const { cutList } = useUnitScope();

  const groups = new Map<string, typeof cutList.bom>();
  for (const row of cutList.bom) {
    const bucket = groups.get(row.kind);
    if (bucket) (bucket as (typeof cutList.bom)[number][]).push(row);
    else groups.set(row.kind, [row]);
  }

  return (
    <div className="ws-scroll h-full overflow-y-auto bg-bg">
      <div className="flex items-center gap-2 border-b border-line bg-surface px-3 py-2">
        <h1 className="text-[13px] font-semibold text-ink">Hardware</h1>
        <span className="tabular text-[11.5px] text-faint">
          {cutList.bom.length} lines · {cutList.hardwareCost.toFixed(2)}
        </span>
        <UnitFilter className="ml-auto h-9 sm:h-7" />
      </div>

      {[...groups.entries()].map(([kind, rows]) => (
        <section key={kind} className="border-b border-line">
          <h2 className="bg-raised/50 px-3 py-1 text-[11px] font-medium tracking-wide text-muted uppercase">
            {KIND_LABELS[kind] ?? kind}
          </h2>
          <ul className="divide-y divide-line/40">
            {rows.map((row) => (
              <li key={row.key} className="flex items-start gap-3 px-3 py-1.5">
                <span className="tabular w-10 shrink-0 text-right text-[12px] font-medium text-accent">
                  {row.quantity}
                </span>
                <span className="w-8 shrink-0 text-[11px] text-faint">{row.unit}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[12px] text-ink">{row.name}</span>
                  {row.notes.length > 0 ? (
                    <span className="block text-[11px] leading-snug text-faint">
                      {row.notes.slice(0, 4).join(" · ")}
                      {row.notes.length > 4 ? ` +${row.notes.length - 4} more` : ""}
                    </span>
                  ) : null}
                </span>
                <span className="tabular w-20 shrink-0 text-right text-[11.5px] text-muted">
                  {row.total.toFixed(2)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
