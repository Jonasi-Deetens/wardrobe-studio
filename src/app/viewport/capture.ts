import type { StandardView } from "../store/useStudio";

/**
 * Viewport captures for the PDF cover.
 *
 * The bridge lives inside the Canvas and registers itself here, so the export panel can
 * ask for a set of standard views without knowing anything about three.js — and without
 * the viewport having to be mounted in the export tab.
 */

export type CapturedView = {
  readonly label: string;
  readonly png: Uint8Array;
};

export type Capturer = (views: readonly StandardView[]) => CapturedView[];

let capturer: Capturer | null = null;

export function registerCapturer(next: Capturer | null): void {
  capturer = next;
}

export function canCapture(): boolean {
  return capturer !== null;
}

export type CaptureResult = {
  readonly views: readonly CapturedView[];
  /** Why fewer views came back than were asked for, if that happened. */
  readonly problem: string | null;
};

/**
 * Captures the requested views, and says so when it cannot.
 *
 * A silent empty result meant the booklet reported success with a blank cover, which is
 * the worst of both: no picture and no explanation. WebGL contexts get lost, and a
 * `preserveDrawingBuffer: false` canvas reads back black — so the caller gets a reason
 * to put in front of the user.
 */
export function captureViews(views: readonly StandardView[]): CaptureResult {
  if (!capturer) {
    return {
      views: [],
      problem:
        "the 3D view has not been opened yet this session, so there was nothing to photograph. Open the Design tab and try again.",
    };
  }
  try {
    const captured = capturer(views);
    if (captured.length === 0) {
      return { views: [], problem: "the 3D view returned no images." };
    }
    if (captured.length < views.length) {
      return {
        views: captured,
        problem: `only ${captured.length} of ${views.length} views could be captured.`,
      };
    }
    return { views: captured, problem: null };
  } catch (error) {
    return {
      views: [],
      problem: `the 3D view could not be photographed (${error instanceof Error ? error.message : "unknown error"}).`,
    };
  }
}

export function dataUrlToBytes(dataUrl: string): Uint8Array {
  const comma = dataUrl.indexOf(",");
  const base64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

export const VIEW_LABELS: Record<StandardView, string> = {
  front: "Front",
  back: "Back",
  left: "Left",
  right: "Right",
  top: "Plan",
  iso: "Isometric",
};
