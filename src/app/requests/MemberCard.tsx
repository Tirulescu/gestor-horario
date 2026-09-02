"use client";

import { ArrowUp, ArrowDown, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { AnimatePresence, Reorder, useDragControls } from "motion/react";
import { DragHandle } from "@/components/DragHandle";
import { COPY } from "@/lib/copy";
import { SlotRow } from "./SlotRow";
import type { SlotRequest, SubjectStudent } from "./types";

export function MemberCard({ m, mi, total, reqs, busy, moveMember, moveSlot, handleReorder, openAdd, openEdit, setConfirmTarget, readOnly = false }: {
  m: SubjectStudent; mi: number; total: number; reqs: SlotRequest[];
  busy: boolean; moveMember: (id: number, dir: "up" | "down") => void;
  moveSlot: (id: number, dir: "up" | "down") => void;
  handleReorder: (next: SlotRequest[], studentId: number, subjectId: number) => void;
  openAdd: (studentId: number) => void; openEdit: (r: SlotRequest) => void;
  setConfirmTarget: (t: { kind: "slot"; id: number; label: string }) => void;
  readOnly?: boolean;
}) {
  const controls = useDragControls();
  const fulfilled = reqs.length >= m.slotsRequired;

  const header = (
    <div className="flex items-start justify-between gap-3 flex-wrap">
      <div className="flex items-center gap-2 flex-wrap">
        {!readOnly && <DragHandle controls={controls} />}
        {!readOnly && (
          <div className="inline-flex items-center gap-1">
            <Button size="iconSm" variant="ghost" onClick={() => moveMember(m.id, "up")} disabled={busy || mi === 0} aria-label="Subir prioridad"><ArrowUp size={14} /></Button>
            <Button size="iconSm" variant="ghost" onClick={() => moveMember(m.id, "down")} disabled={busy || mi === total - 1} aria-label="Bajar prioridad"><ArrowDown size={14} /></Button>
          </div>
        )}
        <span className="font-semibold text-gray-900">{m.student.name}</span>
        <Badge variant={fulfilled ? "success" : "warn"}>
          {COPY.slotsProgress(reqs.length, m.slotsRequired)}
        </Badge>
        {m.durationMin != null && <Badge variant="gray">{m.durationMin} min</Badge>}
      </div>
      {!readOnly && (
        <Button size="sm" variant="outline" className="w-full sm:w-auto shrink-0" onClick={() => openAdd(m.studentId)}>
          <Plus size={14} /> <span className="sm:hidden">Añadir</span><span className="hidden sm:inline">Añadir solicitud</span>
        </Button>
      )}
    </div>
  );

  const slots = reqs.length === 0 ? (
    <p className="text-sm text-gray-400">Sin solicitudes de horario</p>
  ) : readOnly ? (
    <div className="space-y-1.5">
      {reqs.map((r, ri) => (
        <SlotRow
          key={r.id}
          r={r}
          ri={ri}
          total={reqs.length}
          busy={busy}
          moveSlot={moveSlot}
          openEdit={openEdit}
          setConfirmTarget={setConfirmTarget}
          m={m}
          readOnly
        />
      ))}
    </div>
  ) : (
    <Reorder.Group
      axis="y"
      values={reqs}
      onReorder={(next) => handleReorder(next, m.studentId, m.subjectId)}
      layoutScroll
      className="space-y-1.5 reorder-group"
    >
      <AnimatePresence initial={false}>
        {reqs.map((r, ri) => (
          <SlotRow
            key={r.id}
            r={r}
            ri={ri}
            total={reqs.length}
            busy={busy}
            moveSlot={moveSlot}
            openEdit={openEdit}
            setConfirmTarget={setConfirmTarget}
            m={m}
          />
        ))}
      </AnimatePresence>
    </Reorder.Group>
  );

  const body = (
    <Card className="p-4 space-y-3">
      {header}
      <Separator />
      {slots}
    </Card>
  );

  if (readOnly) {
    return body;
  }

  return (
    <Reorder.Item
      value={m}
      layout
      dragListener={false}
      dragControls={controls}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
      whileDrag={{ scale: 1.01, boxShadow: "0 12px 32px rgb(0 0 0 / 0.14)", zIndex: 20 }}
    >
      {body}
    </Reorder.Item>
  );
}
