import * as React from "react"
import { cn } from "@/lib/utils"

type SliderProps = Omit<
  React.ComponentProps<"input">,
  "type" | "onChange"
> & {
  onValueChange?: (value: number) => void
  /** Controlled value; pairs with onValueChange */
  value?: number
  min?: number
  max?: number
  step?: number
}

function Slider({
  className,
  onValueChange,
  value: valueProp,
  min = 0,
  max = 100,
  step = 1,
  disabled,
  ...props
}: SliderProps) {
  const isControlled = valueProp != null
  const [uncontrolled, setUncontrolled] = React.useState(min)
  const value = isControlled ? (valueProp as number) : uncontrolled
  return (
    <div className={cn("relative flex w-full touch-none items-center py-1", className)}>
      <input
        type="range"
        data-slot="slider"
        className="h-2 w-full cursor-pointer appearance-none rounded-full bg-zinc-200 accent-[#FF9500] dark:bg-zinc-800 dark:accent-[#FF9500] disabled:cursor-not-allowed disabled:opacity-50"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => {
          const n = Number(e.target.value)
          if (isControlled) {
            onValueChange?.(n)
          } else {
            setUncontrolled(n)
            onValueChange?.(n)
          }
        }}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        {...props}
      />
    </div>
  )
}

export { Slider }
