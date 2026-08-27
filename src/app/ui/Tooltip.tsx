import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export const TooltipProvider = ({ children }: { readonly children: ReactNode }) => (
  <TooltipPrimitive.Provider delayDuration={320} skipDelayDuration={120}>
    {children}
  </TooltipPrimitive.Provider>
);

export type TooltipProps = {
  readonly children: ReactNode;
  readonly content: ReactNode;
  readonly side?: "top" | "right" | "bottom" | "left";
  readonly align?: "start" | "center" | "end";
  /** Wider box for the construction rationale, which is a sentence or two. */
  readonly wide?: boolean;
  readonly asChild?: boolean;
};

export function Tooltip({
  children,
  content,
  side = "top",
  align = "center",
  wide = false,
  asChild = true,
}: TooltipProps) {
  if (!content) return <>{children}</>;
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild={asChild}>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          align={align}
          sideOffset={6}
          collisionPadding={12}
          className={cn(
            "z-50 rounded-md border border-line bg-raised px-2.5 py-1.5 text-[12px] leading-snug text-ink shadow-xl shadow-black/40",
            "data-[state=delayed-open]:animate-in data-[state=closed]:animate-out",
            wide ? "max-w-[280px]" : "max-w-[220px]",
          )}
        >
          {content}
          <TooltipPrimitive.Arrow className="fill-[var(--color-line)]" width={10} height={5} />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
