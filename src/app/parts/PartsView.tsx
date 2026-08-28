import { useState } from "react";
import { useBelow } from "../lib/useMediaQuery";
import { useUnitScope } from "../store/derived";
import { SegmentedControl } from "../ui";
import { BomView } from "./BomView";
import { CutListView } from "./CutListView";
import { MetalView } from "./MetalView";

/**
 * Panels on the left, hardware on the right. They are two halves of one order, and
 * splitting them across tabs makes you flip back and forth while writing a purchase list.
 *
 * Below `xl` there is no room for both, so they do become tabs — but tabs are still far
 * better than the alternative this replaced, which was hiding the hardware list outright
 * and leaving no way to reach it.
 *
 * Metal is a tab either way, and only appears when there is metal: on a project of nothing
 * but wardrobes it would be a permanently empty third of the screen.
 */
type Tab = "panels" | "metal" | "hardware";

export function PartsView() {
  const stacked = useBelow("xl");
  const [tab, setTab] = useState<Tab>("panels");
  const { cutList } = useUnitScope();
  const hasMetal = cutList.metal.memberCount > 0;

  const segments = [
    { value: "panels" as const, label: "Panels" },
    ...(hasMetal ? [{ value: "metal" as const, label: "Metal" }] : []),
    { value: "hardware" as const, label: "Hardware" },
  ];

  /* A tab can vanish under you — filtering down to a wardrobe takes the metal away. */
  const active: Tab = tab === "metal" && !hasMetal ? "panels" : tab;

  if (stacked) {
    return (
      <div className="flex h-full min-h-0 flex-col bg-bg">
        <div className="shrink-0 border-b border-line bg-surface px-3 py-2">
          <SegmentedControl
            ariaLabel="Cut list, metal or hardware"
            value={active}
            onChange={setTab}
            segments={segments}
            size="md"
            className="flex w-full [&>button]:flex-1"
          />
        </div>
        <div className="min-h-0 flex-1">
          {active === "panels" ? <CutListView /> : null}
          {active === "metal" ? <MetalView /> : null}
          {active === "hardware" ? <BomView /> : null}
        </div>
      </div>
    );
  }

  return (
    <div className="grid h-full min-h-0 grid-cols-[minmax(0,1fr)_380px]">
      <div className="flex min-h-0 flex-col border-r border-line">
        {hasMetal ? (
          <div className="shrink-0 border-b border-line bg-surface px-3 py-2">
            <SegmentedControl
              ariaLabel="Panels or metal"
              value={active === "hardware" ? "panels" : active}
              onChange={setTab}
              segments={segments.filter((segment) => segment.value !== "hardware")}
              size="sm"
            />
          </div>
        ) : null}
        <div className="min-h-0 flex-1">
          {active === "metal" ? <MetalView /> : <CutListView />}
        </div>
      </div>
      <div className="min-h-0">
        <BomView />
      </div>
    </div>
  );
}
