import { HelpCircle } from "lucide-react";
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { useCoarsePointer } from "../lib/useMediaQuery";
import { Tooltip } from "./Tooltip";

/**
 * The row every parameter uses: label on the left, control on the right, and a "why"
 * affordance carrying the construction rationale. The rationale is the point — a
 * number without the reason behind it is how people talk themselves into a 900mm
 * shelf span.
 */
export type FieldProps = {
  readonly label: string;
  readonly children: ReactNode;
  readonly why?: ReactNode;
  readonly hint?: string;
  readonly warning?: string;
  readonly disabled?: boolean;
  readonly htmlFor?: string;
  /** Stack the control under the label, for wide controls. */
  readonly stacked?: boolean;
};

export function Field({
  label,
  children,
  why,
  hint,
  warning,
  disabled = false,
  htmlFor,
  stacked = false,
}: FieldProps) {
  /* A tooltip on a hidden button is unreachable with a finger: there is no hover to reveal
     it and no hover to open it. On touch the same rationale becomes a visible question mark
     that expands inline. */
  const touch = useCoarsePointer();
  const [whyOpen, setWhyOpen] = useState(false);

  return (
    <div
      className={cn(
        "group/field px-3 py-[7px] transition-colors hover:bg-surface/60",
        disabled && "pointer-events-none opacity-45",
      )}
    >
      <div
        className={cn(
          stacked ? "flex flex-col gap-1.5" : "flex min-h-7 items-center justify-between gap-3",
        )}
      >
        <div className="flex min-w-0 items-center gap-1">
          <label
            htmlFor={htmlFor}
            className="truncate text-[12px] leading-tight text-muted select-none"
          >
            {label}
          </label>
          {why ? (
            touch ? (
              <button
                type="button"
                aria-label={`Why: ${label}`}
                aria-expanded={whyOpen}
                onClick={() => setWhyOpen((open) => !open)}
                className={cn(
                  "relative shrink-0 before:absolute before:-inset-2.5 before:content-['']",
                  whyOpen ? "text-accent" : "text-faint",
                )}
              >
                <HelpCircle className="size-4" />
              </button>
            ) : (
              <Tooltip content={why} wide side="right">
                <button
                  type="button"
                  aria-label={`Why: ${label}`}
                  className="text-faint opacity-0 transition-opacity group-hover/field:opacity-100 hover:text-accent focus-visible:opacity-100"
                >
                  <HelpCircle className="size-3.5" />
                </button>
              </Tooltip>
            )
          ) : null}
        </div>
        <div className={cn(stacked ? "w-full" : "flex shrink-0 items-center gap-1.5")}>
          {children}
        </div>
      </div>
      {touch && whyOpen && why ? (
        <div className="mt-1.5 rounded-md border border-line bg-bg/60 px-2.5 py-2 text-[11.5px] leading-snug text-muted">
          {why}
        </div>
      ) : null}
      {hint ? <p className="mt-1 text-[11px] leading-snug text-faint">{hint}</p> : null}
      {warning ? (
        <p className="mt-1 text-[11px] leading-snug text-warn">{warning}</p>
      ) : null}
    </div>
  );
}
