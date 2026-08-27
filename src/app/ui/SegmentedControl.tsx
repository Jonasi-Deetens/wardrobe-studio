import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Tooltip } from "./Tooltip";

export type Segment<T extends string> = {
  readonly value: T;
  readonly label?: string;
  readonly icon?: ReactNode;
  readonly tooltip?: string;
};

export type SegmentedControlProps<T extends string> = {
  readonly value: T;
  readonly onChange: (value: T) => void;
  readonly segments: readonly Segment<T>[];
  readonly className?: string;
  readonly size?: "sm" | "md";
  readonly ariaLabel?: string;
};

export function SegmentedControl<T extends string>({
  value,
  onChange,
  segments,
  className,
  size = "sm",
  ariaLabel,
}: SegmentedControlProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn(
        "inline-flex items-center gap-0.5 rounded-md border border-line bg-bg/60 p-0.5",
        className,
      )}
    >
      {segments.map((segment) => {
        const selected = segment.value === value;
        const button = (
          <button
            key={segment.value}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={segment.tooltip ?? segment.label}
            onClick={() => onChange(segment.value)}
            className={cn(
              "inline-flex items-center justify-center gap-1.5 rounded font-medium transition-colors",
              size === "sm" ? "h-6 px-2 text-[11.5px]" : "h-7 px-2.5 text-[12.5px]",
              segment.label ? "" : size === "sm" ? "w-6 px-0" : "w-7 px-0",
              /* Segments sit inside a 2px-padded track, so 40px of button is a 44px target. */
              size === "sm" ? "pointer-coarse:h-9 pointer-coarse:min-w-9" : "pointer-coarse:h-10 pointer-coarse:min-w-10",
              selected ? "bg-accent/18 text-accent" : "text-muted hover:bg-hover hover:text-ink",
            )}
          >
            {segment.icon}
            {segment.label}
          </button>
        );
        return segment.tooltip ? (
          <Tooltip key={segment.value} content={segment.tooltip}>
            {button}
          </Tooltip>
        ) : (
          button
        );
      })}
    </div>
  );
}
