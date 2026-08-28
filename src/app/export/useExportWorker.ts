import { useCallback, useEffect, useRef } from "react";
import { advise } from "@/engine/advisor";
import { buildCutList } from "@/engine/cutlist";
import { modelToDxfFiles } from "@/engine/export/dxf";
import { buildBooklet } from "@/engine/export/pdf";
import { createZip } from "@/engine/export/zip";
import { cutListInputOf, scopeProject, solveProject } from "@/engine/project";
import type { ExportJob, ExportRequest, ExportResponse } from "./export.worker";

/**
 * Runs an export request in a worker, falling back to the main thread.
 *
 * The fallback is not dead weight: a browser can refuse to start a module worker, and an
 * export that freezes the tab for two seconds is still better than an export that does not
 * happen. It runs exactly the same engine code, so the bytes are identical either way.
 */

export type ExportResult = {
  readonly bytes: Uint8Array;
  readonly fileCount: number;
  /** Set when the work had to run on the main thread after all. */
  readonly onMainThread: boolean;
};

type Pending = {
  readonly resolve: (result: ExportResult) => void;
  readonly reject: (error: Error) => void;
};

export function useExportWorker(): (request: ExportJob) => Promise<ExportResult> {
  const worker = useRef<Worker | null>(null);
  const failed = useRef(false);
  const pending = useRef(new Map<number, Pending>());
  const nextId = useRef(0);

  useEffect(
    () => () => {
      worker.current?.terminate();
      worker.current = null;
      /* Nothing will answer these now, and a promise that never settles leaves the
         export button spinning forever. */
      for (const request of pending.current.values()) {
        request.reject(new Error("the export was cancelled"));
      }
      pending.current.clear();
    },
    [],
  );

  const ensureWorker = useCallback((): Worker | null => {
    if (worker.current) return worker.current;
    if (failed.current || typeof Worker === "undefined") return null;
    try {
      const instance = new Worker(new URL("./export.worker.ts", import.meta.url), {
        type: "module",
      });
      instance.onmessage = (event: MessageEvent<ExportResponse>) => {
        const response = event.data;
        const request = pending.current.get(response.id);
        if (!request) return;
        pending.current.delete(response.id);
        if (response.ok) {
          request.resolve({
            bytes: response.bytes,
            fileCount: response.fileCount,
            onMainThread: false,
          });
        } else {
          request.reject(new Error(response.error));
        }
      };
      instance.onerror = (event) => {
        const message = event.message || "the export worker stopped unexpectedly";
        for (const request of pending.current.values()) request.reject(new Error(message));
        pending.current.clear();
        /* A worker that has died once will die again; later exports go straight to the
           main thread rather than failing twice. */
        failed.current = true;
        instance.terminate();
        worker.current = null;
      };
      worker.current = instance;
      return instance;
    } catch {
      failed.current = true;
      return null;
    }
  }, []);

  return useCallback(
    async (request: ExportJob): Promise<ExportResult> => {
      const instance = ensureWorker();
      if (!instance) return runOnMainThread(request);

      nextId.current += 1;
      const id = nextId.current;
      return new Promise<ExportResult>((resolve, reject) => {
        pending.current.set(id, { resolve, reject });
        instance.postMessage({ ...request, id } as ExportRequest);
      });
    },
    [ensureWorker],
  );
}

async function runOnMainThread(request: ExportJob): Promise<ExportResult> {
  const project = scopeProject(solveProject(request.spec), request.unitId);
  if (request.kind === "dxf") {
    const files = modelToDxfFiles(project.parts, project.members);
    const bytes = createZip(
      files.map((file) => ({ name: file.filename, content: file.content })),
    );
    return { bytes, fileCount: files.length, onMainThread: true };
  }
  const bytes = await buildBooklet({
    project,
    cutList: buildCutList(cutListInputOf(project)),
    nest: request.nest,
    findings: project.units.flatMap((unit) =>
      unit.detail.kind === "wardrobe" ? advise(unit.detail.model) : [],
    ),
    views: request.views,
    sections: request.sections,
  });
  return { bytes, fileCount: 0, onMainThread: true };
}
