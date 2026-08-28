import { useEffect, useMemo, useSyncExternalStore } from "react";
import {
  nestablePartsOf,
  type NestOptions,
  type NestPart,
  type NestResult,
} from "@/engine/cutlist/nesting";
import { useProjectModel, useUnitScope } from "../store/derived";
import type { NestRequest, NestResponse } from "./nesting.worker";

/**
 * Nesting, in a worker, shared by every view that needs it.
 *
 * There is one piece of nesting state for the whole app rather than one per component.
 * Three views ask for the nest — the summary panel, the nesting tab and the export panel
 * — and with isolated state each of them started from `idle`, so opening the Nesting tab
 * showed a spinner for work that had already finished seconds ago.
 *
 * Requests are deduplicated by input identity. The parts array and the options come out
 * of memoised selectors keyed on the spec, so identical inputs arrive as identical
 * references and a second subscriber costs nothing. The previous result stays on screen
 * while a new one computes, so the sheet view does not blink white on every nudge.
 */

export type NestingState = {
  readonly result: NestResult | null;
  readonly status: "idle" | "working" | "ready" | "error" | "unsupported";
  readonly error: string | null;
  readonly elapsedMs: number | null;
  /** True while a newer result is on its way and an older one is on screen. */
  readonly stale: boolean;
};

const IDLE: NestingState = {
  result: null,
  status: "idle",
  error: null,
  elapsedMs: null,
  stale: false,
};

let state: NestingState = IDLE;
const subscribers = new Set<() => void>();

function publish(next: NestingState): void {
  state = next;
  for (const notify of subscribers) notify();
}

function subscribe(notify: () => void): () => void {
  subscribers.add(notify);
  return () => subscribers.delete(notify);
}

/* ------------------------------------------------------------------ worker - */

let worker: Worker | null = null;
let workerFailed = false;
let requestId = 0;
let pendingId = 0;
let lastInputs: { parts: readonly NestPart[]; options: NestOptions } | null = null;

function ensureWorker(): Worker | null {
  if (worker) return worker;
  if (workerFailed) return null;
  if (typeof Worker === "undefined") {
    workerFailed = true;
    return null;
  }
  try {
    worker = new Worker(new URL("./nesting.worker.ts", import.meta.url), { type: "module" });
  } catch (error) {
    workerFailed = true;
    publish({
      ...IDLE,
      status: "unsupported",
      error: `This browser would not start the nesting worker (${error instanceof Error ? error.message : "unknown error"}).`,
    });
    return null;
  }

  worker.onmessage = (event: MessageEvent<NestResponse>) => {
    const response = event.data;
    // A fast edit supersedes a slow nest; the stale answer is simply dropped.
    if (response.id !== pendingId) return;
    if (response.ok) {
      publish({
        result: response.result,
        status: "ready",
        error: null,
        elapsedMs: response.elapsedMs,
        stale: false,
      });
    } else {
      publish({ ...state, status: "error", error: response.error, stale: false });
    }
  };

  worker.onerror = (event) => {
    publish({
      ...state,
      status: "error",
      error: event.message || "The nesting worker stopped unexpectedly.",
      stale: false,
    });
  };

  return worker;
}

function sameOptions(a: NestOptions, b: NestOptions): boolean {
  return (
    a.sheetSizeId === b.sheetSizeId &&
    a.kerf === b.kerf &&
    a.trim === b.trim &&
    a.respectGrain === b.respectGrain
  );
}

function requestNest(parts: readonly NestPart[], options: NestOptions): void {
  if (lastInputs && lastInputs.parts === parts && sameOptions(lastInputs.options, options)) {
    return;
  }

  const instance = ensureWorker();
  if (!instance) {
    if (state.status !== "unsupported") {
      publish({
        ...IDLE,
        status: "unsupported",
        error:
          "This browser does not support web workers, so sheet layouts cannot be calculated. Everything else still works.",
      });
    }
    return;
  }

  lastInputs = { parts, options };
  requestId += 1;
  pendingId = requestId;
  publish({ ...state, status: "working", stale: state.result !== null });
  const request: NestRequest = { id: pendingId, parts: [...parts], options };
  instance.postMessage(request);
}

/* -------------------------------------------------------------------- hook - */

export function useNesting(): NestingState {
  const project = useProjectModel();
  const scope = useUnitScope();
  const production = project.spec.production;

  const options = useMemo<NestOptions>(
    () => ({
      sheetSizeId: production.sheetSizeId,
      kerf: production.kerf,
      trim: production.sheetTrim,
      respectGrain: production.grainPolicy === "respect",
    }),
    [production.sheetSizeId, production.kerf, production.sheetTrim, production.grainPolicy],
  );

  /* Every unit in the room nests on the same sheets: two panels the same size in two
     different units are two panels off one board, and that is where the saving is. The
     unit filter narrows it when one unit is being cut on its own. */
  const parts = useMemo(() => nestablePartsOf(scope.parts), [scope.parts]);

  useEffect(() => {
    requestNest(parts, options);
  }, [parts, options]);

  return useSyncExternalStore(subscribe, () => state, () => state);
}
