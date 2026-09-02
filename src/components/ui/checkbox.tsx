"use client";

import * as React from "react";
import { Check } from "lucide-react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const checkboxShell = cva("relative inline-flex shrink-0 items-center justify-center", {
  variants: {
    size: {
      default: "size-4",
      sm: "size-3.5",
    },
  },
  defaultVariants: { size: "default" },
});

export interface CheckboxProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "size">,
    VariantProps<typeof checkboxShell> {}

const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, size, checked, defaultChecked, onChange, disabled, ...props }, ref) => {
    const [uncontrolled, setUncontrolled] = React.useState(Boolean(defaultChecked));
    const isOn = checked !== undefined ? Boolean(checked) : uncontrolled;

    return (
      <span
        className={cn(checkboxShell({ size }), className)}
        data-state={isOn ? "checked" : "unchecked"}
      >
        <input
          ref={ref}
          type="checkbox"
          checked={checked}
          defaultChecked={defaultChecked}
          disabled={disabled}
          onChange={(e) => {
            if (checked === undefined) setUncontrolled(e.target.checked);
            onChange?.(e);
          }}
          className={cn(
            "peer absolute inset-0 z-10 m-0 size-full cursor-pointer opacity-0",
            "disabled:cursor-not-allowed"
          )}
          {...props}
        />
        <span
          aria-hidden
          className={cn(
            "pointer-events-none flex size-full items-center justify-center rounded-[0.28rem] border shadow-sm transition-colors",
            "peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--accent)]/15 peer-focus-visible:border-[var(--accent)]",
            isOn ? "border-[var(--accent)] bg-[var(--accent)]" : "border-gray-300 bg-white",
            disabled && "opacity-50"
          )}
        >
          <Check
            strokeWidth={3}
            className={cn(
              "text-white transition-opacity",
              size === "sm" ? "size-2.5" : "size-3",
              isOn ? "opacity-100" : "opacity-0"
            )}
          />
        </span>
      </span>
    );
  }
);
Checkbox.displayName = "Checkbox";

export { Checkbox };
