"use client";

import * as React from "react";
import * as AlertDialogPrimitive from "@radix-ui/react-alert-dialog";
import {
  motion,
  useDragControls,
  type PanInfo,
} from "motion/react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "./button";
import {
  SHEET_DISMISS_OFFSET,
  SHEET_DISMISS_VELOCITY,
  useMobileSheet,
} from "@/lib/useMobileSheet";

type AlertDialogCtx = {
  open: boolean;
  setOpen: (open: boolean) => void;
};

const AlertDialogContext = React.createContext<AlertDialogCtx | null>(null);

function useAlertDialogCtx() {
  const ctx = React.useContext(AlertDialogContext);
  if (!ctx) throw new Error("AlertDialog components must be used within <AlertDialog>");
  return ctx;
}

function AlertDialog({
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  children,
  ...props
}: React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Root>) {
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
    <AlertDialogContext.Provider value={{ open, setOpen }}>
      <AlertDialogPrimitive.Root open={open} onOpenChange={setOpen} {...props}>
        {children}
      </AlertDialogPrimitive.Root>
    </AlertDialogContext.Provider>
  );
}

const AlertDialogPortal = AlertDialogPrimitive.Portal;

function shouldDismissSheet(info: PanInfo) {
  return info.offset.y > SHEET_DISMISS_OFFSET || info.velocity.y > SHEET_DISMISS_VELOCITY;
}

const sheetTween = { type: "tween" as const, ease: [0.32, 0.72, 0, 1] as const, duration: 0.3 };
const desktopTween = { type: "spring" as const, stiffness: 360, damping: 32 };

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

function AlertDialogContent({
  className,
  children,
  ...props
}: React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Content>) {
  const { open, setOpen } = useAlertDialogCtx();
  const isSheet = useMobileSheet();
  const dragControls = useDragControls();
  const overlayReady = useOverlayReady(open);
  const [mounted, setMounted] = React.useState(open);

  if (open && !mounted) {
    setMounted(true);
  }

  if (!mounted) return null;

  return (
    <AlertDialogPortal forceMount>
      <motion.div
        className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-[3px]"
        style={{ pointerEvents: overlayReady && open ? "auto" : "none" }}
        initial={{ opacity: 0 }}
        animate={{ opacity: open ? 1 : 0 }}
        transition={{ duration: 0.2 }}
        aria-hidden
      />
      <AlertDialogPrimitive.Content asChild forceMount {...props}>
        <motion.div
          initial={isSheet ? { y: "100%" } : { opacity: 0, scale: 0.96 }}
          animate={
            open
              ? isSheet
                ? { y: 0, opacity: 1 }
                : { opacity: 1, scale: 1 }
              : isSheet
                ? { y: "100%", opacity: 1 }
                : { opacity: 0, scale: 0.97 }
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
            "app-dialog fixed inset-0 z-50 m-auto flex h-fit max-h-[85dvh] min-h-0 w-[min(92vw,24rem)] max-w-md flex-col overflow-y-auto rounded-2xl bg-white p-5 shadow-[0_20px_50px_0_rgb(0_0_0/0.25)]",
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
        </motion.div>
      </AlertDialogPrimitive.Content>
    </AlertDialogPortal>
  );
}
AlertDialogContent.displayName = "AlertDialogContent";

const AlertDialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex shrink-0 flex-col gap-2 text-left pr-11", className)} {...props} />
);
AlertDialogHeader.displayName = "AlertDialogHeader";

const AlertDialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("mt-5 flex shrink-0 flex-col-reverse sm:flex-row justify-end gap-2 [&>button]:w-full sm:[&>button]:w-auto", className)} {...props} />
);
AlertDialogFooter.displayName = "AlertDialogFooter";

const AlertDialogTitle = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <AlertDialogPrimitive.Title
    ref={ref}
    className={cn("text-base font-semibold", className)}
    {...props}
  />
));
AlertDialogTitle.displayName = "AlertDialogTitle";

const AlertDialogDescription = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <AlertDialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-gray-600", className)}
    {...props}
  />
));
AlertDialogDescription.displayName = "AlertDialogDescription";

const AlertDialogAction = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Action>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Action> & { loading?: boolean }
>(({ className, loading = false, disabled, children, ...props }, ref) => (
  <AlertDialogPrimitive.Action
    ref={ref}
    className={cn(buttonVariants({ variant: "destructiveSolid" }), className)}
    disabled={disabled || loading}
    aria-busy={loading || undefined}
    {...props}
  >
    {loading ? <span className="spinner" aria-hidden /> : children}
  </AlertDialogPrimitive.Action>
));
AlertDialogAction.displayName = "AlertDialogAction";

const AlertDialogCancel = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Cancel>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Cancel>
>(({ className, disabled, ...props }, ref) => (
  <AlertDialogPrimitive.Cancel ref={ref} className={cn(buttonVariants({ variant: "outline" }), className)} disabled={disabled} {...props} />
));
AlertDialogCancel.displayName = "AlertDialogCancel";

export {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
};
