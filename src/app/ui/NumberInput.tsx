import { ChevronDown, ChevronUp } from "lucide-react";
import { useEffect, useId, useState, type KeyboardEvent } from "react";
import { cn } from "@/lib/cn";

/**
 * A millimetre field.
 *
 * It keeps the typed text locally so a half-finished number is never pushed into the
 * spec — typing "1" on the way to "1800" must not rebuild the wardrobe as a 1mm box —
 * and commits on blur, Enter, or a stepper click. Arrow keys nudge by the step, with
 * Shift for a coarse jump, because that is how you dial a dimension in.
 */
export type NumberInputProps = {
  readonly value: number;
  readonly onChange: (value: number) => void;
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  readonly coarseStep?: number;
  readonly unit?: string;
  readonly width?: string;
  readonly id?: string;
  readonly disabled?: boolean;
  readonly allowEmpty?: boolean;
  readonly onEmpty?: () => void;
  readonly invalid?: boolean;
};

export function NumberInput({
  value,
  onChange,
  min,
  max,
  step = 1,
  coarseStep,
  unit = "mm",
  width = "w-[76px]",
  id,
  disabled = false,
  allowEmpty = false,
  onEmpty,
  invalid = false,
}: NumberInputProps) {
  const fallbackId = useId();
  const inputId = id ?? fallbackId;
  const [text, setText] = useState(() => String(value));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setText(String(value));
  }, [value, focused]);

  const clamp = (next: number) => {
    let result = next;
    if (min !== undefined) result = Math.max(min, result);
    if (max !== undefined) result = Math.min(max, result);
    return Math.round(result * 100) / 100;
  };

  const commit = (raw: string) => {
    const trimmed = raw.trim().replace(",", ".");
    if (trimmed === "") {
      if (allowEmpty && onEmpty) {
        onEmpty();
        return;
      }
      setText(String(value));
      return;
    }
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) {
      setText(String(value));
      return;
    }
    const next = clamp(parsed);
    setText(String(next));
    if (next !== value) onChange(next);
  };

  const nudge = (direction: 1 | -1, coarse: boolean) => {
    const amount = coarse ? (coarseStep ?? step * 10) : step;
    const next = clamp(value + direction * amount);
    setText(String(next));
    if (next !== value) onChange(next);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowUp") {
      event.preventDefault();
      nudge(1, event.shiftKey);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      nudge(-1, event.shiftKey);
    } else if (event.key === "Enter") {
      commit(text);
      (event.target as HTMLInputElement).blur();
    } else if (event.key === "Escape") {
      setText(String(value));
      (event.target as HTMLInputElement).blur();
    }
  };

  const outOfRange =
    (min !== undefined && value < min) || (max !== undefined && value > max) || invalid;

  return (
    <div
      className={cn(
        "group/num flex items-center rounded-md border bg-bg/60 transition-colors",
        outOfRange ? "border-error/60" : "border-line focus-within:border-accent/60",
        disabled && "opacity-45",
      )}
    >
      <input
        id={inputId}
        inputMode="decimal"
        value={text}
        disabled={disabled}
        onChange={(event) => setText(event.target.value)}
        onFocus={(event) => {
          setFocused(true);
          event.target.select();
        }}
        onBlur={() => {
          setFocused(false);
          commit(text);
        }}
        onKeyDown={onKeyDown}
        aria-invalid={outOfRange || undefined}
        className={cn(
          /* 16px on touch: anything smaller and iOS Safari zooms the page on focus, which
             then has to be pinched back out after every dimension you type. */
          "h-7 bg-transparent px-2 text-right text-[12.5px] text-ink outline-none",
          "pointer-coarse:h-11 pointer-coarse:text-[16px]",
          width,
        )}
      />
      {unit ? (
        <span className="pointer-events-none pr-1 text-[10.5px] text-faint select-none">{unit}</span>
      ) : null}
      <div className="flex h-7 w-4 shrink-0 flex-col border-l border-line/70 pointer-coarse:h-11 pointer-coarse:w-8">
        <button
          type="button"
          tabIndex={-1}
          disabled={disabled}
          aria-label="Increase"
          onClick={(event) => nudge(1, event.shiftKey)}
          className="flex flex-1 items-center justify-center text-faint hover:bg-hover hover:text-ink"
        >
          <ChevronUp className="size-3 pointer-coarse:size-4" />
        </button>
        <button
          type="button"
          tabIndex={-1}
          disabled={disabled}
          aria-label="Decrease"
          onClick={(event) => nudge(-1, event.shiftKey)}
          className="flex flex-1 items-center justify-center border-t border-line/70 text-faint hover:bg-hover hover:text-ink"
        >
          <ChevronDown className="size-3 pointer-coarse:size-4" />
        </button>
      </div>
    </div>
  );
}
