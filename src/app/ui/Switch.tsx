import * as SwitchPrimitive from "@radix-ui/react-switch";
import { cn } from "@/lib/cn";

export type SwitchProps = {
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
  readonly id?: string;
  readonly disabled?: boolean;
  readonly label?: string;
};

export function Switch({ checked, onChange, id, disabled = false, label }: SwitchProps) {
  return (
    <SwitchPrimitive.Root
      id={id}
      checked={checked}
      onCheckedChange={onChange}
      disabled={disabled}
      aria-label={label}
      className={cn(
        "relative h-[18px] w-8 shrink-0 rounded-full border transition-colors",
        checked ? "border-accent/50 bg-accent/80" : "border-line bg-bg/70",
        "disabled:opacity-45",
        /* An 18px track is an unhittable target on a phone, but growing it would loosen
           every parameter row. The hit area grows instead of the switch. */
        "pointer-coarse:before:absolute pointer-coarse:before:-inset-3.5 pointer-coarse:before:content-['']",
      )}
    >
      <SwitchPrimitive.Thumb
        className={cn(
          "block size-3.5 rounded-full bg-ink shadow transition-transform",
          "translate-x-[2px] data-[state=checked]:translate-x-[16px]",
          checked && "bg-on-accent",
        )}
      />
    </SwitchPrimitive.Root>
  );
}
