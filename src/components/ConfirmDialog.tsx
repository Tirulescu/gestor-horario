"use client";

import Modal from "./Modal";
import { AlertTriangle } from "lucide-react";

interface ConfirmDialogProps {
  open: boolean;
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  open,
  title = "Confirmar borrado",
  message,
  confirmLabel = "Borrar",
  cancelLabel = "Cancelar",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      size="sm"
      footer={
        <>
          <button className="btn btn-ghost" onClick={onCancel}>{cancelLabel}</button>
          <button className="btn btn-danger-solid" onClick={onConfirm}>{confirmLabel}</button>
        </>
      }
    >
      <div className="flex gap-3 items-start">
        <AlertTriangle className="text-red-600 flex-shrink-0 mt-0.5" size={20} />
        <p className="text-sm text-gray-700">{message}</p>
      </div>
    </Modal>
  );
}