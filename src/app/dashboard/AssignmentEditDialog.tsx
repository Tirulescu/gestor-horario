"use client";

import { Trash2, Save } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import { DAYS } from "@/lib/validate";
import { fmtHour, fmtDurationMin, slotDurationMin } from "@/lib/hours";
import { HOURS_START } from "./types";
import type { Assignment } from "./types";

function hourItem(o: { value: string; label: string }, allowed: Set<string>) {
  if (!allowed.has(o.value)) return null;
  return <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>;
}

export interface AssignmentEditDialogProps {
  selectedAssignment: Assignment | null;
  selectedCollectiveSession: Assignment[] | null;
  durationMin: number | null;
  editAsgDay: string;
  editAsgStart: string;
  editAsgEnd: string;
  editHourSets: { startSet: Set<string>; endSet: Set<string> };
  savingEdit: boolean;
  onEditAsgDayChange: (v: string) => void;
  onEditAsgStartChange: (v: string) => void;
  onEditAsgEndChange: (v: string) => void;
  onClose: () => void;
  onSave: () => void;
  onRequestDelete: () => void;
}

export default function AssignmentEditDialog({
  selectedAssignment,
  selectedCollectiveSession,
  durationMin,
  editAsgDay,
  editAsgStart,
  editAsgEnd,
  editHourSets,
  savingEdit,
  onEditAsgDayChange,
  onEditAsgStartChange,
  onEditAsgEndChange,
  onClose,
  onSave,
  onRequestDelete,
}: AssignmentEditDialogProps) {
  const open = selectedAssignment != null || selectedCollectiveSession != null;
  const target = selectedCollectiveSession?.[0] ?? selectedAssignment;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {selectedCollectiveSession ? "Sesión colectiva" : "Detalle de asignación"}
          </DialogTitle>
        </DialogHeader>
        {target && (
          <div className="space-y-3 text-sm">
            <dl className="space-y-2">
              <div className="flex justify-between gap-2"><dt className="text-gray-500 shrink-0">Asignatura</dt><dd className="font-medium text-right truncate max-w-[58%]">{target.subject?.name ?? `#${target.subjectId}`}</dd></div>
              {durationMin != null && (
                <div className="flex justify-between"><dt className="text-gray-500">Duración</dt><dd className="font-medium">{fmtDurationMin(durationMin)}</dd></div>
              )}
              {selectedCollectiveSession ? (
                <div>
                  <dt className="text-gray-500 mb-1">Alumnos ({selectedCollectiveSession.length})</dt>
                  <dd className="flex flex-wrap gap-1">
                    {selectedCollectiveSession.map((a) => (
                      <Badge key={a.id}>{a.student?.name ?? `#${a.studentId}`}</Badge>
                    ))}
                  </dd>
                </div>
              ) : (
                <div className="flex justify-between gap-2"><dt className="text-gray-500 shrink-0">Alumno</dt><dd className="font-medium text-right truncate max-w-[58%]">{target.student?.name ?? `#${target.studentId}`}</dd></div>
              )}
            </dl>
            <div className="divider" />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <Label htmlFor="tb-1">Día</Label>
                <Select value={editAsgDay} onValueChange={onEditAsgDayChange}>
                  <SelectTrigger><SelectValue placeholder="Selecciona…" /></SelectTrigger>
                  <SelectContent>
                    {DAYS.map((d, i) => <SelectItem key={i} value={String(i)}>{d}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="tb-2">Hora de inicio</Label>
                <Select value={editAsgStart} onValueChange={onEditAsgStartChange}>
                  <SelectTrigger><SelectValue placeholder="Selecciona…" /></SelectTrigger>
                  <SelectContent>
                    {HOURS_START.map((o) => hourItem(o, editHourSets.startSet))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="tb-3">Hora de fin</Label>
                <Select value={editAsgEnd} onValueChange={onEditAsgEndChange} disabled={editHourSets.endSet.size === 0}>
                  <SelectTrigger><SelectValue placeholder="Selecciona…" /></SelectTrigger>
                  <SelectContent>
                    {Array.from(editHourSets.endSet)
                      .sort((a, b) => Number(a) - Number(b))
                      .map((v) => (
                        <SelectItem key={v} value={v}>{fmtHour(Number(v))}</SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {editHourSets.startSet.size === 0 && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                No hay hueco libre ese día (chocaría con otras clases, bloqueos o reservas).
              </p>
            )}
            {durationMin != null && (
              <p className="text-xs text-gray-500">
                Máximo {fmtDurationMin(durationMin)} para {selectedCollectiveSession ? "la sesión colectiva" : "este alumno"}
                {editAsgStart !== "" && editAsgEnd !== "" && Number(editAsgEnd) > Number(editAsgStart)
                  ? ` · esta clase: ${fmtDurationMin(slotDurationMin(Number(editAsgStart), Number(editAsgEnd)))}`
                  : ""}
                {selectedCollectiveSession ? ". Al mover o borrar, se aplica a todos los alumnos." : "."}
              </p>
            )}
          </div>
        )}
        <div className="mt-5 border-t border-gray-100 pt-4">
          <Button
            className="w-full"
            onClick={onSave}
            loading={savingEdit}
            disabled={editHourSets.startSet.size === 0}
          >
            <Save size={14} /> Guardar cambios
          </Button>
          <div className="mt-5 flex justify-center border-t border-dashed border-gray-200 pt-4">
            <button
              type="button"
              onClick={onRequestDelete}
              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 hover:text-red-700 transition-colors"
            >
              <Trash2 size={13} aria-hidden />
              {selectedCollectiveSession ? "Eliminar sesión colectiva" : "Eliminar asignación"}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
