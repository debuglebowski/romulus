import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/ui/_shadcn.lib/utils"

const badgeVariants = cva(
  "h-5 gap-1 rounded-none border border-transparent px-2 py-0.5 text-xs font-semibold uppercase tracking-wide transition-all has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&>svg]:size-3! inline-flex items-center justify-center w-fit whitespace-nowrap shrink-0 [&>svg]:pointer-events-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive transition-colors overflow-hidden group/badge",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground [a]:hover:bg-primary/80",
        secondary: "bg-secondary text-secondary-foreground [a]:hover:bg-secondary/80",
        destructive: "bg-[var(--danger-bg)] text-[var(--danger-text)] border-[var(--danger)] [a]:hover:bg-[var(--danger-bg)] [a]:hover:opacity-80 focus-visible:ring-destructive/20",
        success: "bg-[var(--success-bg)] text-[var(--success-text)] border-[var(--success)] [a]:hover:bg-[var(--success-bg)] [a]:hover:opacity-80",
        info: "bg-[var(--info-bg)] text-[var(--info-text)] border-[var(--info)] [a]:hover:bg-[var(--info-bg)] [a]:hover:opacity-80",
        outline: "border-border text-foreground [a]:hover:bg-muted [a]:hover:text-muted-foreground",
        ghost: "hover:bg-muted hover:text-muted-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  render,
  ...props
}: useRender.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(
      {
        className: cn(badgeVariants({ className, variant })),
      },
      props
    ),
    render,
    state: {
      slot: "badge",
      variant,
    },
  })
}

export { Badge, badgeVariants }
