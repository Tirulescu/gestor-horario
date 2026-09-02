"use client";

import { createPortal } from "react-dom";
import { useEffect, useState, type ReactNode } from "react";
import { X } from "lucide-react";

export interface CalendarEventDetailRow {
  label: string;
  value: ReactNode;
}

interface CalendarEventDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  color?: string;
  rows: CalendarEventDetailRow[];
}

export default function CalendarEventDetailDialog({
  open,
  onOpenChange,
  title,
  description,
  color,
  rows,
}: CalendarEventDetailDialogProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  if (!mounted || !open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[250] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-[2px]"
        aria-label="Cerrar"
        onClick={() => onOpenChange(false)}
      />
      <div className="relative w-full max-w-md rounded-2xl bg-white p-5 shadow-[0_20px_50px_0_rgb(0_0_0/0.25)]">
        <button
          type="button"
          className="absolute right-3 top-3 inline-flex h-9 w-9 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100"
          aria-label="Cerrar"
          onClick={() => onOpenChange(false)}
        >
          <X className="h-4 w-4" />
        </button>
        <div className="mb-4 pr-10">
          <h2 className="text-lg font-semibold leading-snug flex items-center gap-2">
            {color && (
              <span
                className="inline-block h-3 w-3 shrink-0 rounded-full"
                style={{ background: color }}
                aria-hidden
              />
            )}
            {title}
          </h2>
          {description && <p className="mt-1 text-sm text-gray-500">{description}</p>}
        </div>
        <dl className="space-y-2.5 text-sm">
          {rows.map((row) => (
            <div key={row.label} className="flex justify-between gap-3">
              <dt className="text-gray-500 shrink-0">{row.label}</dt>
              <dd className="font-medium text-right">{row.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>,
    document.body,
  );
}
