import * as React from "react";
import { Minus, Plus } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

export type MacroDir = "min" | "max";

interface MacroSliderProps {
  label: string;
  unit: string;
  value: number;
  onChange: (v: number) => void;
  dir: MacroDir;
  onDirChange?: (d: MacroDir) => void;
  min: number;
  max: number;
  step?: number;
}

export function MacroSlider({
  label,
  unit,
  value,
  onChange,
  dir,
  onDirChange,
  min,
  max,
  step = 1,
}: MacroSliderProps) {
  const clamp = (v: number) => Math.max(min, Math.min(max, v));
  const [inputVal, setInputVal] = React.useState(String(value));

  React.useEffect(() => {
    setInputVal(String(value));
  }, [value]);

  return (
    <div className="rounded-2xl border border-neutral-100 bg-white p-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-neutral-900">{label}</span>
        {onDirChange && (
          <div className="flex overflow-hidden rounded-full border border-neutral-200 text-[11px] font-medium">
            {(["max", "min"] as MacroDir[]).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => onDirChange(d)}
                className={cn(
                  "px-2.5 py-1 transition-colors",
                  dir === d
                    ? "bg-[#FFD700] text-neutral-900"
                    : "bg-white text-neutral-500",
                )}
              >
                {d === "max" ? "이하" : "이상"}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          aria-label="감소"
          onClick={() => onChange(clamp(value - step))}
          className="flex h-8 w-8 items-center justify-center rounded-full border border-neutral-200 text-neutral-700 active:bg-neutral-100"
        >
          <Minus className="h-4 w-4" />
        </button>
        <input
          type="number"
          inputMode="numeric"
          value={inputVal}
          onChange={(e) => {
            setInputVal(e.target.value);
            const n = Number(e.target.value);
            if (e.target.value !== "" && Number.isFinite(n)) onChange(clamp(n));
          }}
          onBlur={() => {
            const n = Number(inputVal);
            const clamped = inputVal !== "" && Number.isFinite(n) ? clamp(n) : value;
            setInputVal(String(clamped));
            onChange(clamped);
          }}
          className="w-20 rounded-lg border border-neutral-200 bg-white px-2 py-1.5 text-center text-sm font-semibold tabular-nums text-neutral-900 focus:border-neutral-900 focus:outline-none"
        />
        <span className="text-xs text-neutral-500">{unit}</span>
        <button
          type="button"
          aria-label="증가"
          onClick={() => onChange(clamp(value + step))}
          className="flex h-8 w-8 items-center justify-center rounded-full border border-neutral-200 text-neutral-700 active:bg-neutral-100"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      <Slider
        className="mt-3"
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={(arr) => onChange(arr[0] ?? value)}
      />
      <div className="mt-1 flex justify-between text-[10px] text-neutral-400">
        <span>{min}</span>
        <span>{max}</span>
      </div>
    </div>
  );
}
