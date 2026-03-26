import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-2xl text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] cursor-pointer",
  {
    variants: {
      variant: {
        default:
          "bg-[color:var(--primary)] text-[color:var(--primary-foreground)] shadow-[0_12px_28px_rgba(33,79,207,0.35)] hover:bg-[color:var(--primary)]/90",
        destructive:
          "bg-destructive text-white shadow-[0_10px_24px_rgba(239,68,68,0.3)] hover:bg-destructive/90",
        outline:
          "border border-[color:rgba(255,245,199,0.25)] bg-transparent shadow-xs hover:bg-[color:rgba(255,245,199,0.12)] hover:text-[color:var(--foreground)]",
        secondary:
          "bg-secondary text-secondary-foreground shadow-[0_8px_18px_rgba(18,12,30,0.35)] hover:bg-secondary/85",
        ghost:
          "text-[color:rgba(255,245,199,0.75)] hover:bg-[color:rgba(255,245,199,0.12)] hover:text-[color:var(--foreground)]",
        link: "text-primary underline-offset-4 hover:underline",
        "liquid-glass":
          "liquid-glass relative border border-white/50 text-white bg-[rgba(33,79,207,0.6)] backdrop-blur-sm [-webkit-backdrop-filter:blur(8px)] shadow-[inset_0_1px_0px_rgba(255,255,255,0.75),0_0_9px_rgba(0,0,0,0.2),0_3px_8px_rgba(0,0,0,0.15)] hover:bg-[rgba(33,79,207,0.75)] transition-all duration-300 before:absolute before:inset-0 before:rounded-2xl before:bg-gradient-to-br before:from-white/10 before:via-transparent before:to-transparent before:opacity-30 before:pointer-events-none after:absolute after:inset-0 after:rounded-2xl after:bg-gradient-to-tl after:from-white/5 after:via-transparent after:to-transparent after:opacity-20 after:pointer-events-none",
        "liquid-glass-transparent":
          "liquid-glass relative border border-white/30 text-white bg-white/5 backdrop-blur-sm [-webkit-backdrop-filter:blur(8px)] shadow-[inset_0_1px_0px_rgba(255,255,255,0.5),0_0_6px_rgba(0,0,0,0.15)] hover:bg-white/10 transition-all duration-300 before:absolute before:inset-0 before:rounded-2xl before:bg-gradient-to-br before:from-white/25 before:via-transparent before:to-transparent before:opacity-60 before:pointer-events-none after:absolute after:inset-0 after:rounded-2xl after:bg-gradient-to-tl after:from-white/15 after:via-transparent after:to-transparent after:opacity-40 after:pointer-events-none",
      },
      size: {
        default: "h-10 px-5 py-2.5 has-[>svg]:px-4",
        sm: "h-9 gap-1.5 px-4 has-[>svg]:px-3",
        lg: "h-11 px-6 has-[>svg]:px-5",
        xl: "h-12 px-8 text-base",
        icon: "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  children,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot : "button";
  const isLiquidGlass =
    variant === "liquid-glass" || variant === "liquid-glass-transparent";

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    >
      {isLiquidGlass ? (
        <span className="relative z-10 inline-flex items-center justify-center gap-2">
          {children}
        </span>
      ) : (
        children
      )}
    </Comp>
  );
}

export { Button, buttonVariants };
