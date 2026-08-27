import { nest, type NestOptions, type NestPart, type NestResult } from "@/engine/cutlist/nesting";

/**
 * Nesting off the main thread.
 *
 * MaxRects over a hundred panels across several sheets is the one part of the pipeline
 * that can take long enough to drop a frame, and the viewport is being orbited while it
 * runs. Everything the worker needs is plain data — the engine has no DOM or React
 * dependency — so it imports the same module the tests do.
 */

export type NestRequest = {
  readonly id: number;
  readonly parts: readonly NestPart[];
  readonly options: NestOptions;
};

export type NestResponse =
  | { readonly id: number; readonly ok: true; readonly result: NestResult; readonly elapsedMs: number }
  | { readonly id: number; readonly ok: false; readonly error: string };

self.onmessage = (event: MessageEvent<NestRequest>) => {
  const { id, parts, options } = event.data;
  const started = performance.now();
  try {
    const result = nest(parts, options);
    const response: NestResponse = {
      id,
      ok: true,
      result,
      elapsedMs: performance.now() - started,
    };
    (self as unknown as Worker).postMessage(response);
  } catch (error) {
    const response: NestResponse = {
      id,
      ok: false,
      error: error instanceof Error ? error.message : "Nesting failed",
    };
    (self as unknown as Worker).postMessage(response);
  }
};
