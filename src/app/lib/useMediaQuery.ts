import { useCallback, useEffect, useState } from "react";

/**
 * Media queries as state.
 *
 * The layout has to know whether it is on a phone for more than styling: side panels
 * become drawers, hover affordances become taps, and the 3D view drops its pixel ratio.
 * CSS alone cannot express those, so the breakpoints are read here too — using the same
 * values Tailwind uses, so the two can never disagree about where `md` starts.
 */

export const BREAKPOINTS = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
} as const;

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window === "undefined" ? false : window.matchMedia(query).matches,
  );

  useEffect(() => {
    const list = window.matchMedia(query);
    const update = (): void => setMatches(list.matches);
    update();
    list.addEventListener("change", update);
    return () => list.removeEventListener("change", update);
  }, [query]);

  return matches;
}

/** True below the given Tailwind breakpoint, matching `max-<name>` in CSS. */
export function useBelow(breakpoint: keyof typeof BREAKPOINTS): boolean {
  return useMediaQuery(`(max-width: ${BREAKPOINTS[breakpoint] - 0.02}px)`);
}

/**
 * A finger rather than a mouse. This is the right test for touch affordances and for
 * scaling back rendering work: it is about the input device, not the screen size, so a
 * touchscreen laptop is treated as touch and a small window on a desktop is not.
 */
export function useCoarsePointer(): boolean {
  return useMediaQuery("(pointer: coarse)");
}

/** Someone who has asked for less movement; honoured by the drawers and the viewport. */
export function useReducedMotion(): boolean {
  return useMediaQuery("(prefers-reduced-motion: reduce)");
}

/**
 * A stable callback that reports whether the pointer is coarse right now, for event
 * handlers that must not re-subscribe when the device changes.
 */
export function useIsTouch(): () => boolean {
  return useCallback(
    () => typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches,
    [],
  );
}
