"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: "sm" | "md" | "lg";
}

export default function Modal({ open, onClose, title, children, footer, size = "md" }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      // Focus the dialog itself, not the first input (avoids mobile keyboard).
      d.focus();
    } else if (!open && d.open) {
      d.close();
    }
  }, [open]);

  function handleClose() {
    onClose();
  }

  function onCancel(e: React.SyntheticEvent) {
    e.preventDefault();
    handleClose();
  }

  function onBackdropClick(e: React.MouseEvent<HTMLDialogElement>) {
    if (e.target === e.currentTarget) handleClose();
  }

  const maxW = size === "sm" ? "24rem" : size === "lg" ? "44rem" : "32rem";

  return (
    <dialog
      ref={ref}
      className="modal-dialog"
      style={{ maxWidth: maxW }}
      onClose={handleClose}
      onCancel={onCancel}
      onClick={onBackdropClick}
    >
      <div className="p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-lg">{title}</h2>
          <button className="btn btn-ghost btn-icon" onClick={handleClose} aria-label="Cerrar">
            <X />
          </button>
        </div>
        <div className="space-y-4">{children}</div>
        {footer && <div className="flex gap-2 justify-end mt-5 pt-4 border-t border-gray-100">{footer}</div>}
      </div>
    </dialog>
  );
}
