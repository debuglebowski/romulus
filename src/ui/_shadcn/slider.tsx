"use client"

import * as React from "react"
import { Slider as SliderPrimitive } from "@base-ui/react/slider"

import { cn } from "@/ui/_shadcn.lib/utils"

function Slider({
  className,
  defaultValue,
  value,
  min = 0,
  max = 100,
  onValueChange,
  ...props
}: SliderPrimitive.Root.Props) {
  const _values = React.useMemo(
    () =>
      Array.isArray(value)
        ? value
        : Array.isArray(defaultValue)
          ? defaultValue
          : [min, max],
    [value, defaultValue, min, max]
  )

  // Normalize the callback to always pass an array
  // Base-ui may pass a single number for single-thumb sliders
  const handleValueChange = React.useCallback(
    (newValue: number | number[], event: SliderPrimitive.Root.ChangeEventDetails) => {
      if (!onValueChange) {
        return;
      }
      const normalized = Array.isArray(newValue) ? newValue : [newValue];
      onValueChange(normalized, event);
    },
    [onValueChange]
  )

  return (
    <SliderPrimitive.Root
      className="w-full"
      data-slot="slider"
      defaultValue={defaultValue}
      value={value}
      min={min}
      max={max}
      thumbAlignment="edge"
      onValueChange={handleValueChange}
      {...props}
    >
      <SliderPrimitive.Control
        className={cn(
          "relative flex w-full touch-none items-center select-none disabled:opacity-50",
          className
        )}
      >
        <SliderPrimitive.Track
          data-slot="slider-track"
          className="bg-gray-500 h-[2px] w-full relative overflow-hidden select-none"
        >
          <SliderPrimitive.Indicator
            data-slot="slider-range"
            className="bg-primary select-none h-full"
          />
        </SliderPrimitive.Track>
        {Array.from({ length: _values.length }, (_, index) => (
          <SliderPrimitive.Thumb
            data-slot="slider-thumb"
            key={index}
            className="border-ring ring-ring/50 relative size-3 border bg-white transition-[color,box-shadow] after:absolute after:-inset-2 hover:ring-[3px] focus-visible:ring-[3px] focus-visible:outline-hidden active:ring-[3px] block shrink-0 select-none disabled:pointer-events-none disabled:opacity-50"
          />
        ))}
      </SliderPrimitive.Control>
    </SliderPrimitive.Root>
  )
}

export { Slider }
