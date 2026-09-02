import * as React from "react";
import { cn } from "@/lib/utils";

const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "rounded-[0.9rem] border border-gray-200 bg-white text-gray-900 shadow-[0_1px_2px_0_rgb(0_0_0/0.04)]",
        className
      )}
      {...props}
    />
  )
);
Card.displayName = "Card";

export { Card };
