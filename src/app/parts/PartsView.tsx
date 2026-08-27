import { useState } from "react";
import { useBelow } from "../lib/useMediaQuery";
import { SegmentedControl } from "../ui";
import { BomView } from "./BomView";
import { CutListView } from "./CutListView";

/**
 * Panels on the left, hardware on the right. They are two halves of one order, and
 * splitting them across tabs makes you flip back and forth while writing a purchase list.
 *
 * Below `xl` there is no room for both, so they do become tabs — but tabs are still far
 * better than the alternative this replaced, which was hiding the hardware list outright
 * and leaving no way to reach it.
 */
export function PartsView() {
  const stacked = useBelow("xl");
  const [tab, setTab] = useState<"panels" | "hardware">("panels");

  if (stacked) {
    return (
      <div className="flex h-full min-h-0 flex-col bg-bg">
        <div className="shrink-0 border-b border-line bg-surface px-3 py-2">
          <SegmentedControl
            ariaLabel="Cut list or hardware"
            value={tab}
            onChange={setTab}
            segments={[
              { value: "panels", label: "Panels" },
              { value: "hardware", label: "Hardware" },
            ]}
            size="md"
            className="flex w-full [&>button]:flex-1"
          />
        </div>
        <div className="min-h-0 flex-1">
          {tab === "panels" ? <CutListView /> : <BomView />}
        </div>
      </div>
    );
  }

  return (
    <div className="grid h-full min-h-0 grid-cols-[minmax(0,1fr)_380px]">
      <div className="min-h-0 border-r border-line">
        <CutListView />
      </div>
      <div className="min-h-0">
        <BomView />
      </div>
    </div>
  );
}
