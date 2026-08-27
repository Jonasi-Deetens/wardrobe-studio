import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Button } from "../ui";

/**
 * A panel that slides in over the work surface, for screens too narrow to show it beside.
 *
 * Built on Radix Dialog rather than a bare fixed div, because a drawer has to behave like
 * a modal to be usable: focus goes inside it and cannot escape, Escape closes it, the page
 * behind stops scrolling, and screen readers announce it. Hand-rolled drawers get all four
 * of those wrong.
 */

export type DrawerProps = {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly side: "left" | "right";
  readonly title: string;
  readonly description?: string;
  readonly children: ReactNode;
};

export function Drawer({
  open,
  onOpenChange,
  side,
  title,
  description,
  children,
}: DrawerProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="ws-drawer-overlay fixed inset-0 z-40 bg-black/55 backdrop-blur-[1px]" />
        <Dialog.Content
          className={cn(
            "fixed top-0 z-50 flex h-full w-[min(23rem,88vw)] flex-col bg-surface shadow-2xl shadow-black/60",
            side === "left"
              ? "ws-drawer-left left-0 border-r border-line"
              : "ws-drawer-right right-0 border-l border-line",
          )}
        >
          <div className="flex h-12 shrink-0 items-center gap-2 border-b border-line px-3">
            <Dialog.Title className="min-w-0 flex-1 truncate text-[13px] font-semibold text-ink">
              {title}
            </Dialog.Title>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon" aria-label={`Close ${title.toLowerCase()}`}>
                <X className="size-4" />
              </Button>
            </Dialog.Close>
          </div>
          {description ? (
            <Dialog.Description className="sr-only">{description}</Dialog.Description>
          ) : null}
          <div className="min-h-0 flex-1">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
