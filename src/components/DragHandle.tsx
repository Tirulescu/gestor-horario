"use client";

import { GripVertical } from "lucide-react";
import type { DragControls } from "motion/react";

interface DragHandleProps {
  controls: DragControls;
  size?: number;
  /** Evita que un Reorder.Item padre capture el gesto en listas anidadas. */
  stopPropagation?: boolean;
  className?: string;
}

export function DragHandle({
  controls,
  size = 16,
  stopPropagation = true,
  className = "",
}: DragHandleProps) {
  function startDrag(e: React.PointerEvent<HTMLButtonElement>) {
    if (stopPropagation) e.stopPropagation();
    // En táctil evita scroll/selección antes de iniciar el arrastre.
    e.preventDefault();
    controls.start(e);
  }

  return (
    <button
      type="button"
      className={`drag-handle shrink-0 ${className}`.trim()}
      aria-label="Arrastrar para cambiar orden"
      onPointerDown={startDrag}
    >
      <GripVertical size={size} className="text-gray-400" aria-hidden />
    </button>
  );
}
