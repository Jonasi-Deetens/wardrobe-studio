import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "default" | "ghost" | "danger" | "outline";
type Size = "sm" | "md" | "icon" | "icon-sm";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-accent text-on-accent hover:bg-accent-strong shadow-[0_1px_0_0_rgba(255,255,255,0.15)_inset]",
  default: "bg-raised text-ink hover:bg-hover border border-line",
  outline: "border border-line text-muted hover:text-ink hover:border-line-strong",
  ghost: "text-muted hover:text-ink hover:bg-raised",
  danger: "text-error hover:bg-error/10 border border-error/40",
};

/**
 * The coarse-pointer sizes come from the 44px minimum in the Apple and Material guidelines.
 * They are applied as a minimum rather than a height so a button that has been given an
 * explicit larger size keeps it, and so a row of them does not change its own layout.
 */
const SIZES: Record<Size, string> = {
  sm: "h-7 px-2.5 text-[12px] gap-1.5 pointer-coarse:min-h-9",
  md: "h-8 px-3 text-[13px] gap-2 pointer-coarse:min-h-11",
  icon: "size-8 pointer-coarse:size-11",
  "icon-sm": "size-7 pointer-coarse:size-9",
};

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  readonly variant?: Variant;
  readonly size?: Size;
  readonly active?: boolean;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = "default", size = "md", active = false, type = "button", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      data-active={active || undefined}
      className={cn(
        "inline-flex select-none items-center justify-center rounded-md font-medium whitespace-nowrap transition-colors",
        "disabled:pointer-events-none disabled:opacity-40",
        "data-[active]:bg-accent/15 data-[active]:text-accent data-[active]:border-accent/40",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    />
  );
});
