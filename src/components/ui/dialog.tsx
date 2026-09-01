"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "@/lib/utils";

const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogPortal = DialogPrimitive.Portal;
const DialogClose = DialogPrimitive.Close;

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-[3px] data-[state=open]:animate-in data-[state=closed]:animate-out",
      className
    )}
    {...props}
  />
));
DialogOverlay.displayName = "DialogOverlay";

type DialogSize = "sm" | "md" | "lg" | "xl";

const dialogSizeClasses: Record<DialogSize, string> = {
  sm: "w-[min(calc(100vw-1.25rem),28rem)] max-w-[28rem]",
  md: "w-[min(calc(100vw-1.25rem),480px)] max-w-[32rem]",
  lg: "w-[min(calc(100vw-1.25rem),42rem)] max-w-none",
  xl: "w-[min(calc(100vw-1.25rem),56rem)] max-w-none",
};

function DialogContent({
  className,
  children,
  size = "md",
  ...props
}: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & { size?: DialogSize }) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        asChild
        {...props}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.97, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.98, y: 8 }}
          transition={{ type: "spring", stiffness: 320, damping: 30, duration: 0.2 }}
          className={cn(
            "fixed inset-0 z-50 m-auto flex h-fit max-h-[85dvh] min-h-0 flex-col overflow-y-auto rounded-2xl bg-white p-5 shadow-[0_20px_50px_0_rgb(0_0_0/0.25)]",
            dialogSizeClasses[size],
            className
          )}
        >
          {children}
          <DialogPrimitive.Close
            className="absolute right-3 top-3 inline-flex h-9 w-9 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 bg-white/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" />
          </DialogPrimitive.Close>
        </motion.div>
      </DialogPrimitive.Content>
    </DialogPortal>
  );
}
DialogContent.displayName = "DialogContent";

function DialogContentAnimated({
  className,
  children,
  ...props
}: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>) {
  return (
    <AnimatePresence>
      <DialogContent className={className} {...props}>
        {children}
      </DialogContent>
    </AnimatePresence>
  );
}

function DialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("mb-4 flex shrink-0 flex-col items-start gap-1 pr-11", className)} {...props} />;
}
DialogHeader.displayName = "DialogHeader";

function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("mt-5 flex shrink-0 flex-col-reverse sm:flex-row justify-end gap-2 pt-4 border-t border-gray-100 [&>button]:w-full sm:[&>button]:w-auto", className)}
      {...props}
    />
  );
}
DialogFooter.displayName = "DialogFooter";

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn("text-lg font-semibold leading-snug", className)}
    {...props}
  />
));
DialogTitle.displayName = "DialogTitle";

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-gray-500", className)}
    {...props}
  />
));
DialogDescription.displayName = "DialogDescription";

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogContentAnimated,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
};