"use client";

import { Plus } from "lucide-react";

interface FloatingActionButtonProps {
  onClick: () => void;
  "aria-label": string;
  disabled?: boolean;
}

export default function FloatingActionButton({
  onClick,
  "aria-label": ariaLabel,
  disabled = false,
}: FloatingActionButtonProps) {
  return (
    <button
      type="button"
      className="fab"
      onClick={onClick}
      aria-label={ariaLabel}
      disabled={disabled}
    >
      <Plus size={24} strokeWidth={2.5} />
    </button>
  );
}
