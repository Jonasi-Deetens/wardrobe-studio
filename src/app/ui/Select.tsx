import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";

export type SelectOption = {
  readonly value: string;
  readonly label: string;
  readonly hint?: string;
};

export type SelectProps = {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly options: readonly SelectOption[];
  readonly id?: string;
  readonly disabled?: boolean;
  readonly className?: string;
  readonly placeholder?: string;
};

export function Select({
  value,
  onChange,
  options,
  id,
  disabled = false,
  className,
  placeholder = "Select",
}: SelectProps) {
  return (
    <SelectPrimitive.Root value={value} onValueChange={onChange} disabled={disabled}>
      <SelectPrimitive.Trigger
        id={id}
        className={cn(
          "flex h-7 items-center justify-between gap-1.5 rounded-md border border-line bg-bg/60 px-2 text-[12.5px] text-ink",
          "hover:border-line-strong focus-visible:border-accent/60 disabled:opacity-45",
          "max-w-[190px] min-w-[110px]",
          "pointer-coarse:h-11 pointer-coarse:text-[14px]",
          className,
        )}
      >
        <SelectPrimitive.Value placeholder={placeholder} className="truncate" />
        <SelectPrimitive.Icon>
          <ChevronDown className="size-3.5 shrink-0 text-faint" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={4}
          collisionPadding={12}
          className="z-50 max-h-[340px] overflow-hidden rounded-md border border-line bg-raised shadow-2xl shadow-black/50"
        >
          <SelectPrimitive.Viewport className="ws-scroll max-h-[340px] overflow-y-auto p-1">
            {options.map((option) => (
              <SelectPrimitive.Item
                key={option.value}
                value={option.value}
                className={cn(
                  "flex cursor-pointer items-start gap-2 rounded px-2 py-1.5 text-[12.5px] outline-none select-none",
                  "pointer-coarse:min-h-11 pointer-coarse:items-center pointer-coarse:text-[14px]",
                  "data-[highlighted]:bg-hover data-[state=checked]:text-accent",
                )}
              >
                <span className="mt-[3px] size-3 shrink-0">
                  <SelectPrimitive.ItemIndicator>
                    <Check className="size-3" />
                  </SelectPrimitive.ItemIndicator>
                </span>
                <span className="min-w-0">
                  <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
                  {option.hint ? (
                    <span className="mt-0.5 block text-[11px] leading-snug text-faint">
                      {option.hint}
                    </span>
                  ) : null}
                </span>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}
