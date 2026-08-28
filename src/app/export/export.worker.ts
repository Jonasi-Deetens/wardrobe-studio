import { advise } from "@/engine/advisor";
import { buildCutList } from "@/engine/cutlist";
import type { NestResult } from "@/engine/cutlist/nesting";
import { modelToDxfFiles } from "@/engine/export/dxf";
import { buildBooklet, type BookletInput, type BookletView } from "@/engine/export/pdf";
import { createZip } from "@/engine/export/zip";
import { cutListInputOf, scopeProject, solveProject } from "@/engine/project";
import type { ProjectSpec } from "@/engine/spec/types";

/**
 * The PDF and the DXF archive, off the main thread.
 *
 * A booklet with a page per panel is a few hundred vector drawings and every one of them
 * is laid out synchronously; on a phone that is several seconds with the main thread
 * pinned, which reads as a crash. The engine is pure data in and bytes out, so it moves
 * here whole.
 *
 * The spec crosses instead of the solved model. It is a fraction of the size, and solving
 * is deterministic, so the worker rebuilds exactly the model the screen is showing — no
 * cloning a graph of frozen parts, and no chance of sending a stale one.
 */

export type ExportJob =
  | {
      readonly kind: "pdf";
      readonly spec: ProjectSpec;
      /** One unit, or null for the whole room, matching the filter on screen. */
      readonly unitId: string | null;
      readonly nest: NestResult | null;
      readonly views: readonly BookletView[];
      readonly sections: NonNullable<BookletInput["sections"]>;
    }
  | { readonly kind: "dxf"; readonly spec: ProjectSpec; readonly unitId: string | null };

export type ExportRequest = ExportJob & { readonly id: number };

export type ExportResponse =
  | {
      readonly id: number;
      readonly ok: true;
      readonly bytes: Uint8Array;
      /** How many DXF files went into the archive, for the message shown afterwards. */
      readonly fileCount: number;
      readonly elapsedMs: number;
    }
  | { readonly id: number; readonly ok: false; readonly error: string };

self.onmessage = (event: MessageEvent<ExportRequest>) => {
  const request = event.data;
  const started = performance.now();

  void (async () => {
    try {
      const project = scopeProject(solveProject(request.spec), request.unitId);
      let bytes: Uint8Array;
      let fileCount = 0;

      if (request.kind === "dxf") {
        const files = modelToDxfFiles(project.parts, project.members);
        fileCount = files.length;
        bytes = createZip(files.map((file) => ({ name: file.filename, content: file.content })));
      } else {
        bytes = await buildBooklet({
          project,
          cutList: buildCutList(cutListInputOf(project)),
          nest: request.nest,
          findings: project.units.flatMap((unit) =>
            unit.detail.kind === "wardrobe" ? advise(unit.detail.model) : [],
          ),
          views: request.views,
          sections: request.sections,
        });
      }

      const response: ExportResponse = {
        id: request.id,
        ok: true,
        bytes,
        fileCount,
        elapsedMs: performance.now() - started,
      };
      /* Hand the buffer over rather than copying it; a booklet can be several megabytes. */
      (self as unknown as Worker).postMessage(response, [bytes.buffer as ArrayBuffer]);
    } catch (error) {
      const response: ExportResponse = {
        id: request.id,
        ok: false,
        error: error instanceof Error ? error.message : "Export failed",
      };
      (self as unknown as Worker).postMessage(response);
    }
  })();
};
