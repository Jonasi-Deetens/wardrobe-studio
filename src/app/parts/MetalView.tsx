import { useMemo, useState } from "react";
import { drawingToSvg, DARK_THEME } from "@/engine/drawing";
import { renderMemberElevation } from "@/engine/drawing/member";
import { endLabel } from "@/engine/cutlist/tube";
import { UnitFilter } from "../shell/UnitFilter";
import { useUnitScope } from "../store/derived";
import { SegmentedControl } from "../ui";

/**
 * The metalwork side of the job: what to cut, how it comes out of the bars, and what gets
 * welded.
 *
 * Kept apart from the panel cut list because it is a different trade on a different bench —
 * the frames are welded up first and the panels go on afterwards — and because none of the
 * columns are the same: a tube has one length and two end cuts where a panel has two
 * dimensions and four edges.
 */
export function MetalView() {
  const { cutList, members } = useUnitScope();
  const [tab, setTab] = useState<"tube" | "bars" | "welds">("tube");
  const metal = cutList.metal;

  if (metal.memberCount === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-1 bg-bg px-6 text-center">
        <p className="text-[13px] text-ink">No metalwork in this project</p>
        <p className="max-w-xs text-[11.5px] leading-snug text-faint">
          Work tables and metal-framed counters bring a welded frame with them. A wardrobe is
          all panels, so there is nothing here to cut.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-bg">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line bg-surface px-3 py-2">
        <h1 className="text-[13px] font-semibold text-ink">Metal</h1>
        <span className="tabular text-[11.5px] text-faint">
          {metal.memberCount} pieces · {metal.totalMass.toFixed(1)} kg ·{" "}
          {metal.nest.bars.length} bar{metal.nest.bars.length === 1 ? "" : "s"} ·{" "}
          {metal.cost.toFixed(2)}
        </span>
        <UnitFilter className="ml-auto h-9 sm:h-7" />
      </div>

      <div className="shrink-0 border-b border-line bg-surface px-3 pb-2">
        <SegmentedControl
          ariaLabel="Tube schedule, bar cutting list or weld schedule"
          value={tab}
          onChange={setTab}
          segments={[
            { value: "tube", label: "Tube schedule" },
            { value: "bars", label: "Bars" },
            { value: "welds", label: `Welds (${metal.weldCount})` },
          ]}
          size="md"
          className="flex w-full [&>button]:flex-1 sm:w-auto sm:[&>button]:flex-none"
        />
      </div>

      <div className="ws-scroll min-h-0 flex-1 overflow-y-auto">
        {tab === "tube" ? <TubeSchedule members={members} /> : null}
        {tab === "bars" ? <BarList /> : null}
        {tab === "welds" ? <WeldSchedule /> : null}
      </div>
    </div>
  );
}

function TubeSchedule({ members }: { readonly members: ReturnType<typeof useUnitScope>["members"] }) {
  const { cutList } = useUnitScope();
  const [open, setOpen] = useState<string | null>(null);
  const byId = useMemo(() => new Map(members.map((member) => [member.id, member])), [members]);

  return (
    <>
      <ul className="divide-y divide-line/40">
        {cutList.metal.rows.map((row) => {
          const member = byId.get(row.memberIds[0] ?? "");
          const expanded = open === row.key;
          return (
            <li key={row.key}>
              <button
                type="button"
                onClick={() => setOpen(expanded ? null : row.key)}
                className="flex w-full items-start gap-3 px-3 py-2 text-left hover:bg-raised/40"
              >
                <span className="tabular w-8 shrink-0 text-right text-[12px] font-medium text-accent">
                  {row.quantity}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[12px] text-ink">{row.label}</span>
                  <span className="block text-[11px] leading-snug text-faint">
                    {row.profile.shortName} · ends {endLabel(row.ends[0])} / {endLabel(row.ends[1])}
                    {row.holeCount > 0
                      ? ` · ${row.holeCount} hole${row.holeCount === 1 ? "" : "s"} each`
                      : ""}
                  </span>
                </span>
                <span className="tabular w-20 shrink-0 text-right text-[12px] text-ink">
                  {row.length}
                </span>
                <span className="tabular hidden w-16 shrink-0 text-right text-[11.5px] text-muted sm:block">
                  {row.mass.toFixed(1)} kg
                </span>
              </button>
              {expanded && member ? (
                <div
                  className="border-t border-line/40 bg-surface/60 px-3 py-2 [&>svg]:h-auto [&>svg]:w-full"
                  /* The engine's own drawing, not a second one: the same primitives go to the
                     booklet and the DXF, so what is on screen cannot disagree with the print. */
                  dangerouslySetInnerHTML={{
                    __html: drawingToSvg(renderMemberElevation(member), { theme: DARK_THEME }),
                  }}
                />
              ) : null}
            </li>
          );
        })}
      </ul>

      <section className="border-t border-line px-3 py-2">
        <h2 className="pb-1 text-[11px] font-medium tracking-wide text-muted uppercase">
          Section totals
        </h2>
        <ul className="flex flex-col gap-0.5">
          {cutList.metal.profileTotals.map((total) => (
            <li key={total.profile.id} className="flex items-baseline gap-2 text-[11.5px]">
              <span className="min-w-0 flex-1 truncate text-ink">{total.profile.name}</span>
              <span className="tabular text-faint">
                {total.pieces} × · {total.metres.toFixed(1)} m · {total.mass.toFixed(1)} kg
              </span>
              <span className="tabular w-24 text-right text-muted">
                {total.bars} bar{total.bars === 1 ? "" : "s"} · {total.cost.toFixed(2)}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

function BarList() {
  const { cutList } = useUnitScope();
  const { nest } = cutList.metal;

  return (
    <>
      <p className="border-b border-line px-3 py-1.5 text-[11px] leading-snug text-faint">
        Longest piece first into the first bar it fits, so the offcut falls at the end of the
        bar. Every cut is charged the saw kerf, the last one included.
      </p>

      <ul className="divide-y divide-line/40">
        {nest.bars.map((bar) => (
          <li key={bar.index} className="px-3 py-2">
            <div className="flex items-baseline gap-2">
              <span className="text-[12px] font-medium text-ink">Bar {bar.index + 1}</span>
              <span className="text-[11px] text-faint">{bar.profileId}</span>
              <span className="tabular ml-auto text-[11px] text-muted">
                {bar.used} of {bar.stockLength} · {bar.offcut} left
              </span>
            </div>

            {/* A bar drawn to scale, because "is there room for one more" is a question
                about a picture and not about a number. */}
            <div className="mt-1 flex h-4 w-full overflow-hidden rounded-sm border border-line bg-raised">
              {bar.cuts.map((cut) => (
                <span
                  key={cut.memberId}
                  title={`${cut.label} — ${cut.length}mm at ${cut.at}`}
                  className="h-full border-r border-bg/60 bg-accent/45"
                  style={{ width: `${(cut.length / bar.stockLength) * 100}%` }}
                />
              ))}
            </div>

            <ol className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-faint">
              {bar.cuts.map((cut) => (
                <li key={cut.memberId} className="tabular">
                  {cut.at} → {cut.at + cut.length}
                  <span className="pl-1 text-muted">{cut.label}</span>
                </li>
              ))}
            </ol>
          </li>
        ))}
      </ul>

      {nest.oversize.length > 0 ? (
        <section className="border-t border-line px-3 py-2">
          <h2 className="pb-1 text-[11px] font-medium tracking-wide text-warn uppercase">
            Longer than a stock bar
          </h2>
          <ul className="flex flex-col gap-0.5 text-[11.5px] text-ink">
            {nest.oversize.map((entry) => (
              <li key={entry.memberId}>
                {entry.label} — {entry.length}mm. Joined, or bought as a special length.
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}

function WeldSchedule() {
  const { cutList } = useUnitScope();
  const { welds, weldCount, weldMetres } = cutList.metal;

  if (welds.length === 0) {
    return (
      <p className="px-3 py-3 text-[11.5px] text-faint">
        Nothing welded. The metalwork here is bolted together.
      </p>
    );
  }

  return (
    <>
      <p className="border-b border-line px-3 py-1.5 text-[11px] leading-snug text-faint">
        {weldCount} joints, {weldMetres.toFixed(2)} m of weld. Grinding a joint flush costs
        about as long again as welding it, so only the corners that show are ground.
      </p>
      <ul className="divide-y divide-line/40">
        {welds.map((row) => (
          <li key={row.key} className="flex items-start gap-3 px-3 py-2">
            <span className="tabular w-8 shrink-0 text-right text-[12px] font-medium text-accent">
              {row.count}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[12px] text-ink">
                {row.size}mm {row.kind}
                {row.ground ? ", ground flush" : ""}
              </span>
              <span className="block text-[11px] leading-snug text-faint">
                {row.examples.join(" · ")}
              </span>
            </span>
            <span className="tabular w-20 shrink-0 text-right text-[11.5px] text-muted">
              {row.metres.toFixed(2)} m
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}
