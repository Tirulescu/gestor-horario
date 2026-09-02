"use client";

import { ArrowUp, ArrowDown, Trash2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Reorder, useDragControls } from "motion/react";
import { DragHandle } from "@/components/DragHandle";
import { DAYS } from "@/lib/validate";
import { fmtRange } from "@/lib/hours";
import type { SlotRequest, SubjectStudent } from "./types";

export function SlotRow({ r, ri, total, busy, moveSlot, openEdit, setConfirmTarget, m, readOnly = false }: {
  r: SlotRequest; ri: number; total: number; busy: boolean;
  moveSlot: (id: number, dir: "up" | "down") => void;
  openEdit: (r: SlotRequest) => void;
  setConfirmTarget: (t: { kind: "slot"; id: number; label: string }) => void;
  m: SubjectStudent;
  readOnly?: boolean;
}) {
  const controls = useDragControls();

  const rowContent = (
    <>
      {!readOnly && <DragHandle controls={controls} size={14} />}
      {!readOnly && (
        <div className="flex items-center gap-0.5 shrink-0">
          <Button size="iconSm" variant="ghost" onClick={() => moveSlot(r.id, "up")} disabled={busy || ri === 0} aria-label="Subir preferencia"><ArrowUp size={12} /></Button>
          <Button size="iconSm" variant="ghost" onClick={() => moveSlot(r.id, "down")} disabled={busy || ri === total - 1} aria-label="Bajar preferencia"><ArrowDown size={12} /></Button>
        </div>
      )}
      <span className="min-w-0 flex-1 text-sm leading-snug tabular-nums">
        <span className="font-medium text-gray-900">{DAYS[r.dayOfWeek]}</span>
        {" "}
        <span className="text-gray-600 whitespace-nowrap">{fmtRange(r.startHour, r.endHour)}</span>
      </span>
      {!readOnly && (
        <div className="flex items-center gap-1 shrink-0 ml-auto">
          <Button size="iconSm" variant="outline" onClick={() => openEdit(r)} aria-label="Editar solicitud"><Pencil size={12} /></Button>
          <Button size="iconSm" variant="destructive" onClick={() => setConfirmTarget({ kind: "slot", id: r.id, label: `¿Borrar ${DAYS[r.dayOfWeek]} ${fmtRange(r.startHour, r.endHour)} de ${m.student.name}?` })} aria-label="Borrar"><Trash2 size={12} /></Button>
        </div>
      )}
    </>
  );

  if (readOnly) {
    return (
      <div className="flex items-center gap-2 text-sm bg-gray-50 rounded-lg px-2 py-2">
        {rowContent}
      </div>
    );
  }

  return (
    <Reorder.Item
      value={r}
      layout
      dragListener={false}
      dragControls={controls}
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -8 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
      whileDrag={{ scale: 1.02, boxShadow: "0 8px 24px rgb(0 0 0 / 0.12)", zIndex: 20 }}
      className="flex items-center gap-2 text-sm bg-gray-50 rounded-lg px-2 py-2"
    >
      {rowContent}
    </Reorder.Item>
  );
}
