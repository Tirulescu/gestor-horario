"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import {
  motion,
  useDragControls,
  type PanInfo,
} from "motion/react";
import { cn } from "@/lib/utils";
import {
  SHEET_DISMISS_OFFSET,
  SHEET_DISMISS_VELOCITY,
  useMobileSheet,
} from "@/lib/useMobileSheet";

type DialogCtx = {
  open: boolean;
  setOpen: (open: boolean) => void;
};

const DialogContext = React.createContext<DialogCtx | null>(null);

function useDialogCtx() {
  const ctx = React.useContext(DialogContext);
  if (!ctx) throw new Error("Dialog components must be used within <Dialog>");
  return ctx;
}

function Dialog({
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  children,
  ...props
}: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Root>) {
  const [uncontrolled, setUncontrolled] = React.useState(defaultOpen);
  const controlled = openProp !== undefined;
  const open = controlled ? !!openProp : uncontrolled;

  const setOpen = React.useCallback(
    (next: boolean) => {
      if (!controlled) setUncontrolled(next);
      onOpenChange?.(next);
    },
    [controlled, onOpenChange],
  );

  return (
    <DialogContext.Provider value={{ open, setOpen }}>
      <DialogPrimitive.Root open={open} onOpenChange={setOpen} {...props}>
        {children}
      </DialogPrimitive.Root>
    </DialogContext.Provider>
  );
}

const DialogPortal = DialogPrimitive.Portal;

type DialogSize = "sm" | "md" | "lg" | "xl";

const dialogSizeClasses: Record<DialogSize, string> = {
  sm: "w-[min(calc(100vw-1.25rem),28rem)] max-w-[28rem]",
  md: "w-[min(calc(100vw-1.25rem),480px)] max-w-[32rem]",
  lg: "w-[min(calc(100vw-1.25rem),42rem)] max-w-none",
  xl: "w-[min(calc(100vw-1.25rem),56rem)] max-w-none",
};

function shouldDismissSheet(info: PanInfo) {
  return info.offset.y > SHEET_DISMISS_OFFSET || info.velocity.y > SHEET_DISMISS_VELOCITY;
}

const sheetTween = { type: "tween" as const, ease: [0.32, 0.72, 0, 1] as const, duration: 0.3 };
const desktopTween = { type: "spring" as const, stiffness: 360, damping: 32 };

/** Evita que el mismo clic que abre el diálogo lo cierre al caer en el overlay. */
function useOverlayReady(open: boolean) {
  const [ready, setReady] = React.useState(false);
  React.useEffect(() => {
    if (!open) {
      setReady(false);
      return;
    }
    const id = window.setTimeout(() => setReady(true), 50);
    return () => window.clearTimeout(id);
  }, [open]);
  return ready;
}

function DialogContent({
  className,
  children,
  size = "md",
  onOpenAutoFocus,
  onPointerDownOutside,
  onInteractOutside,
  ...props
}: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & { size?: DialogSize }) {
  const { open, setOpen } = useDialogCtx();
  const isSheet = useMobileSheet();
  const dragControls = useDragControls();
  const overlayReady = useOverlayReady(open);
  const [mounted, setMounted] = React.useState(open);

  if (open && !mounted) {
    setMounted(true);
  }

  if (!mounted) return null;

  return (
    <DialogPortal forceMount>
      <motion.div
        className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-[3px]"
        style={{ pointerEvents: overlayReady && open ? "auto" : "none" }}
        initial={{ opacity: 0 }}
        animate={{ opacity: open ? 1 : 0 }}
        transition={{ duration: 0.2 }}
        onClick={() => {
          if (overlayReady) setOpen(false);
        }}
        aria-hidden
      />
      <DialogPrimitive.Content
        asChild
        forceMount
        onOpenAutoFocus={(e) => {
          onOpenAutoFocus?.(e);
          if (e.defaultPrevented) return;
          e.preventDefault();
          (e.currentTarget as HTMLElement).focus({ preventScroll: true });
        }}
        onPointerDownOutside={(e) => {
          if (!overlayReady) {
            e.preventDefault();
            return;
          }
          onPointerDownOutside?.(e);
        }}
        onInteractOutside={(e) => {
          if (!overlayReady) {
            e.preventDefault();
            return;
          }
          onInteractOutside?.(e);
        }}
        {...props}
      >
        <motion.div
          tabIndex={-1}
          initial={isSheet ? { y: "100%" } : { opacity: 0, scale: 0.97, y: 8 }}
          animate={
            open
              ? isSheet
                ? { y: 0, opacity: 1 }
                : { opacity: 1, scale: 1, y: 0 }
              : isSheet
                ? { y: "100%", opacity: 1 }
                : { opacity: 0, scale: 0.98, y: 8 }
          }
          transition={isSheet ? sheetTween : desktopTween}
          onAnimationComplete={() => {
            if (!open) setMounted(false);
          }}
          drag={isSheet && open ? "y" : false}
          dragControls={dragControls}
          dragListener={false}
          dragConstraints={{ top: 0, bottom: 0 }}
          dragElastic={{ top: 0, bottom: 0.55 }}
          dragMomentum={false}
          onDragEnd={(_, info) => {
            if (shouldDismissSheet(info)) setOpen(false);
          }}
          className={cn(
            "app-dialog fixed inset-0 z-50 m-auto flex h-fit max-h-[85dvh] min-h-0 flex-col overflow-y-auto rounded-2xl bg-white p-5 shadow-[0_20px_50px_0_rgb(0_0_0/0.25)] outline-none",
            dialogSizeClasses[size],
            className,
          )}
        >
          {isSheet && (
            <div
              className="app-dialog-handle -mt-1 mb-3 flex shrink-0 cursor-grab touch-none items-center justify-center py-1 active:cursor-grabbing"
              onPointerDown={(e) => dragControls.start(e)}
              aria-hidden
            >
              <span className="block h-[0.28rem] w-9 rounded-full bg-gray-200" />
            </div>
          )}
          {children}
          <button
            type="button"
            className="absolute right-3 top-3 z-10 inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/80 text-gray-500 hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
            aria-label="Cerrar"
            onClick={() => setOpen(false)}
          >
            <X className="h-4 w-4" />
          </button>
        </motion.div>
      </DialogPrimitive.Content>
    </DialogPortal>
  );
}
DialogContent.displayName = "DialogContent";

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
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
};
