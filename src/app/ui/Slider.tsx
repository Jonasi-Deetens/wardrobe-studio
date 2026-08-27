import * as SliderPrimitive from "@radix-ui/react-slider";
import { cn } from "@/lib/cn";

export type SliderProps = {
  readonly value: number;
  readonly onChange: (value: number) => void;
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  readonly id?: string;
  readonly label?: string;
  readonly className?: string;
};

export function Slider({
  value,
  onChange,
  min = 0,
  max = 1,
  step = 0.01,
  id,
  label,
  className,
}: SliderProps) {
  return (
    <SliderPrimitive.Root
      id={id}
      aria-label={label}
      value={[value]}
      min={min}
      max={max}
      step={step}
      onValueChange={([next]) => onChange(next ?? min)}
      className={cn(
        "relative flex h-5 w-full touch-none items-center select-none pointer-coarse:h-11",
        className,
      )}
    >
      <SliderPrimitive.Track className="relative h-[3px] w-full grow rounded-full bg-line pointer-coarse:h-1">
        <SliderPrimitive.Range className="absolute h-full rounded-full bg-accent" />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb className="block size-3.5 rounded-full border border-accent bg-ink shadow transition-transform hover:scale-110 focus-visible:scale-110 pointer-coarse:size-6" />
    </SliderPrimitive.Root>
  );
}
