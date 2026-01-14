import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"

import { cn } from "@/ui/_shadcn.lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        "h-8 w-full min-w-0 border border-input bg-[--bg-surface] px-2.5 py-1 text-base outline-none placeholder:text-muted-foreground focus-visible:border-[--accent] aria-invalid:border-destructive aria-invalid:bg-[--danger-bg] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground md:text-sm",
        className
      )}
      {...props}
    />
  )
}

export { Input }
