"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-[0.6rem] text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:opacity-55 disabled:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 select-none",
  {
    variants: {
      variant: {
        default: "bg-[var(--accent)] text-white hover:bg-[#1d4ed8]",
        outline: "bg-white border border-gray-200 text-gray-800 hover:bg-gray-50",
        ghost: "bg-transparent hover:bg-gray-100 text-gray-800",
        destructive: "bg-white border border-red-200 text-red-700 hover:bg-red-50",
        destructiveSolid: "bg-[var(--danger)] text-white border border-[var(--danger)] hover:bg-red-700",
        link: "text-[var(--accent)] underline-offset-4 hover:underline bg-transparent",
      },
      size: {
        default: "h-11 px-4",
        sm: "h-10 px-3 text-sm",
        xs: "h-8 px-2.5 text-xs [&_svg]:size-3.5",
        icon: "h-11 w-11 p-0",
        iconSm: "h-10 w-10 p-0",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  /** Desactiva el botón y sustituye el contenido por un spinner. */
  loading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading = false, disabled, children, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size, className }))}
        disabled={asChild ? disabled : disabled || loading}
        aria-busy={loading || undefined}
        {...props}
      >
        {loading && !asChild ? <span className="spinner" aria-hidden /> : children}
      </Comp>
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
