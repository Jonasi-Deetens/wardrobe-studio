import { Maximize2, Minus, Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Drawing } from "@/engine/drawing/types";
import { DARK_THEME, drawingToSvg, PRINT_THEME } from "@/engine/drawing/svg";
import { cn } from "@/lib/cn";
import { Button, Tooltip } from "../ui";

/**
 * Shows a `Drawing` on screen, pan and zoom included.
 *
 * It renders the same SVG string the PDF and DXF paths are built from, rather than a
 * separate canvas drawing, so what is on screen is what comes out of the printer. Zoom is
 * applied as a transform on the container so the SVG itself stays crisp at any scale.
 */
export type DrawingCanvasProps = {
  readonly drawing: Drawing;
  readonly theme?: "dark" | "print";
  readonly className?: string;
  /** Extra chrome, rendered in the top-right of the frame. */
  readonly actions?: React.ReactNode;
};

const MIN_ZOOM = 0.15;
const MAX_ZOOM = 12;

type View = { readonly zoom: number; readonly x: number; readonly y: number };
const IDENTITY: View = { zoom: 1, x: 0, y: 0 };

const clamp = (zoom: number): number => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));

type Point = { readonly x: number; readonly y: number };
type Gesture =
  | { readonly kind: "pan"; readonly id: number; readonly origin: Point; readonly from: View }
  | { readonly kind: "pinch"; readonly spread: number; readonly origin: Point; readonly from: View };

const distance = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);

/** One finger pans, two pinch. Re-derived whenever a pointer joins or leaves. */
function startGesture(pointers: Map<number, Point>, from: View): Gesture | null {
  const entries = [...pointers.entries()];
  const [first, second] = entries;
  if (!first) return null;
  if (!second) return { kind: "pan", id: first[0], origin: first[1], from };
  return {
    kind: "pinch",
    spread: distance(first[1], second[1]),
    origin: {
      x: (first[1].x + second[1].x) / 2,
      y: (first[1].y + second[1].y) / 2,
    },
    from,
  };
}

export function DrawingCanvas({ drawing, theme = "dark", className, actions }: DrawingCanvasProps) {
  const svg = useMemo(
    () => drawingToSvg(drawing, { theme: theme === "dark" ? DARK_THEME : PRINT_THEME }),
    [drawing, theme],
  );

  const frame = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>(IDENTITY);

  const reset = useCallback(() => setView(IDENTITY), []);

  /* A new drawing means a new subject; keeping the old pan would leave it off screen. */
  useEffect(() => {
    reset();
  }, [drawing, reset]);

  /**
   * Zoom about a point rather than the centre, so the detail under the finger or cursor
   * stays put. The transform is `translate(pan) scale(zoom)` about the frame centre, so a
   * point `p` measured from that centre holds still when
   * `pan' = p - (p - pan) · zoom'/zoom`.
   */
  const zoomAbout = useCallback(
    (nextZoom: number, clientX: number, clientY: number, from?: View) => {
      const box = frame.current?.getBoundingClientRect();
      setView((current) => {
        const base = from ?? current;
        const zoom = clamp(nextZoom);
        if (!box) return { ...base, zoom };
        const px = clientX - (box.left + box.width / 2);
        const py = clientY - (box.top + box.height / 2);
        const ratio = zoom / base.zoom;
        return {
          zoom,
          x: px - (px - base.x) * ratio,
          y: py - (py - base.y) * ratio,
        };
      });
    },
    [],
  );

  /**
   * Wheel has to be a native listener: React registers `onWheel` passively at the root, so
   * `preventDefault` there is ignored and the page scrolls behind the drawing instead.
   */
  useEffect(() => {
    const element = frame.current;
    if (!element) return;
    const onWheel = (event: WheelEvent): void => {
      if (!event.ctrlKey && !event.metaKey && Math.abs(event.deltaY) < 2) return;
      event.preventDefault();
      /* A trackpad pinch arrives as ctrl+wheel with small deltas; a mouse wheel arrives
         in coarse notches. Damping the latter keeps one notch to a sensible step. */
      const scale = event.ctrlKey || event.metaKey ? 0.01 : 0.0015;
      setViewRef.current(Math.exp(-event.deltaY * scale), event.clientX, event.clientY);
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, []);

  /* The listener above is registered once, so it reaches the current zoom through a ref. */
  const setViewRef = useRef<(factor: number, x: number, y: number) => void>(() => {});
  setViewRef.current = (factor, x, y) => zoomAbout(view.zoom * factor, x, y);

  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<Gesture | null>(null);

  const onPointerDown = (event: React.PointerEvent) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    gesture.current = startGesture(pointers.current, view);
  };

  const onPointerMove = (event: React.PointerEvent) => {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const active = gesture.current;
    if (!active) return;

    if (active.kind === "pan") {
      const point = pointers.current.get(active.id);
      if (!point) return;
      setView({
        zoom: active.from.zoom,
        x: active.from.x + (point.x - active.origin.x),
        y: active.from.y + (point.y - active.origin.y),
      });
      return;
    }

    const [a, b] = [...pointers.current.values()];
    if (!a || !b) return;
    const spread = distance(a, b);
    if (spread < 1) return;
    /* Anchor on the midpoint where the pinch began, so the gesture zooms rather than
       zooming and sliding at the same time. */
    zoomAbout(active.from.zoom * (spread / active.spread), active.origin.x, active.origin.y, active.from);
  };

  const onPointerUp = (event: React.PointerEvent) => {
    pointers.current.delete(event.pointerId);
    /* Lifting one finger of a pinch should hand over to a pan rather than jump. */
    gesture.current = pointers.current.size > 0 ? startGesture(pointers.current, view) : null;
  };

  const stepZoom = (factor: number): void => {
    const box = frame.current?.getBoundingClientRect();
    zoomAbout(
      view.zoom * factor,
      box ? box.left + box.width / 2 : 0,
      box ? box.top + box.height / 2 : 0,
    );
  };

  const panning = gesture.current?.kind === "pan";

  return (
    <div
      ref={frame}
      className={cn(
        "relative min-h-0 touch-none overflow-hidden",
        theme === "print" ? "bg-white" : "grid-paper bg-bg",
        className,
      )}
    >
      <div
        role="presentation"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className={cn(
          "absolute inset-0 grid place-items-center p-4 sm:p-6",
          panning ? "cursor-grabbing" : "cursor-grab",
        )}
      >
        <div
          className="h-full w-full"
          style={{
            transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})`,
            transformOrigin: "center",
          }}
          // The SVG is generated by our own renderer from numeric geometry; there is no
          // user-authored markup in it.
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      </div>

      <div className="absolute top-2 right-2 flex items-center gap-1">
        {actions}
        <div className="flex items-center gap-0.5 rounded-md border border-line bg-surface/85 p-0.5 backdrop-blur">
          <Tooltip content="Zoom out">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Zoom out"
              onClick={() => stepZoom(1 / 1.3)}
            >
              <Minus className="size-3.5" />
            </Button>
          </Tooltip>
          <span className="tabular w-10 text-center text-[11px] text-muted">
            {Math.round(view.zoom * 100)}%
          </span>
          <Tooltip content="Zoom in">
            <Button variant="ghost" size="icon-sm" aria-label="Zoom in" onClick={() => stepZoom(1.3)}>
              <Plus className="size-3.5" />
            </Button>
          </Tooltip>
          <Tooltip content="Fit to view">
            <Button variant="ghost" size="icon-sm" aria-label="Fit to view" onClick={reset}>
              <Maximize2 className="size-3.5" />
            </Button>
          </Tooltip>
        </div>
      </div>
    </div>
  );
}
