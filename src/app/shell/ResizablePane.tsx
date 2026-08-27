import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

/**
 * A drag handle between panes.
 *
 * The width lives in local state rather than the store because it is not part of the
 * design: undoing an edit should not move the furniture.
 */
export type ResizeHandleProps = {
  readonly onResize: (delta: number) => void;
  readonly onDoubleClick?: () => void;
  readonly ariaLabel: string;
};

export function ResizeHandle({ onResize, onDoubleClick, ariaLabel }: ResizeHandleProps) {
  const dragging = useRef<number | null>(null);
  const [active, setActive] = useState(false);

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    dragging.current = event.clientX;
    setActive(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragging.current === null) return;
    const delta = event.clientX - dragging.current;
    dragging.current = event.clientX;
    onResize(delta);
  };

  const stop = () => {
    dragging.current = null;
    setActive(false);
  };

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={ariaLabel}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={stop}
      onPointerCancel={stop}
      onDoubleClick={onDoubleClick}
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft") onResize(-16);
        if (event.key === "ArrowRight") onResize(16);
      }}
      className={cn(
        "group relative w-px shrink-0 cursor-col-resize bg-line transition-colors",
        active ? "bg-accent" : "hover:bg-line-strong",
      )}
    >
      <span className="absolute inset-y-0 -left-1 -right-1" aria-hidden />
    </div>
  );
}

/** Width state with a clamp, kept in localStorage so the layout survives a reload. */
export function usePaneWidth(
  key: string,
  initial: number,
  min: number,
  max: number,
): [number, (delta: number) => void, () => void] {
  const [width, setWidth] = useState(() => {
    const stored = Number(localStorage.getItem(key));
    return Number.isFinite(stored) && stored >= min && stored <= max ? stored : initial;
  });

  useEffect(() => {
    localStorage.setItem(key, String(width));
  }, [key, width]);

  const resize = useCallback(
    (delta: number) => setWidth((previous) => Math.min(max, Math.max(min, previous + delta))),
    [min, max],
  );

  const reset = useCallback(() => setWidth(initial), [initial]);

  return [width, resize, reset];
}
