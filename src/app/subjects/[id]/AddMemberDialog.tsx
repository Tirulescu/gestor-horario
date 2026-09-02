"use client";

import Link from "next/link";
import { Plus, Save, X } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import { COPY } from "@/lib/copy";
import { fmtDurationMin, MIN_DURATION_MIN, DURATION_STEP_MIN, SESSION_PART_MIN } from "@/lib/hours";
import {
  SessionPartsFields,
  syncSessionPartsForDuration,
  type SessionPartsValue,
} from "./SessionPartsFields";
import type { Student } from "./types";

type AddMemberDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  availableStudents: Student[];
  isCollective: boolean;
  defaultDur: number;
  studentId: string;
  onStudentChange: (studentId: string) => void;
  slotsRequired: string;
  onSlotsRequiredChange: (value: string) => void;
  durationMin: string;
  onDurationMinChange: (value: string) => void;
  sessionParts: SessionPartsValue;
  onSessionPartsChange: (value: SessionPartsValue) => void;
  gradeRuleHint: boolean;
  saving: boolean;
  onSubmit: () => void;
};

export function AddMemberDialog({
  open,
  onOpenChange,
  availableStudents,
  isCollective,
  defaultDur,
  studentId,
  onStudentChange,
  slotsRequired,
  onSlotsRequiredChange,
  durationMin,
  onDurationMinChange,
  sessionParts,
  onSessionPartsChange,
  gradeRuleHint,
  saving,
  onSubmit,
}: AddMemberDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Añadir alumno a la asignatura</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="m-student">Alumno</Label>
            <Select value={studentId} onValueChange={onStudentChange}>
              <SelectTrigger><SelectValue placeholder="Selecciona…" /></SelectTrigger>
              <SelectContent>
                {availableStudents.map((s) => (
                  <SelectItem key={s.id} value={String(s.id)}>
                    {s.name}{s.grade ? ` · ${s.grade}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {availableStudents.length === 0 && (
              <div className="mt-2 flex flex-col sm:flex-row sm:items-center gap-2">
                <p className="text-xs text-gray-500">Todos los alumnos ya están inscritos.</p>
                <Button asChild size="xs" variant="outline">
                  <Link href="/students"><Plus /> Crear alumno</Link>
                </Button>
              </div>
            )}
          </div>
          <div className="space-y-4">
            {!isCollective && (
              <>
                <div>
                  <Label htmlFor="m-slots">{COPY.slotsRequiredLabel}</Label>
                  <Input id="m-slots" type="number" min={1} max={10} value={slotsRequired} onChange={(e) => onSlotsRequiredChange(e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="m-dur">{COPY.durationLabel}</Label>
                  <Input
                    id="m-dur"
                    type="number"
                    min={MIN_DURATION_MIN}
                    step={DURATION_STEP_MIN}
                    value={durationMin}
                    onChange={(e) => {
                      onDurationMinChange(e.target.value);
                      const dur = Number(e.target.value) || defaultDur;
                      onSessionPartsChange(syncSessionPartsForDuration(dur, sessionParts));
                    }}
                    placeholder={String(defaultDur)}
                  />
                  {gradeRuleHint && (
                    <p className="text-xs text-gray-500 mt-1">Pre-rellenado por regla del curso</p>
                  )}
                </div>
                <SessionPartsFields
                  idPrefix="m"
                  durationMin={Number(durationMin) || defaultDur}
                  value={sessionParts}
                  onChange={onSessionPartsChange}
                  partsHint={
                    <>El auto-agendado colocará {sessionParts.sessionParts} clases de {SESSION_PART_MIN} min sin juntarlas.</>
                  }
                />
              </>
            )}
          </div>
          {isCollective ? (
            <p className="text-xs text-gray-700 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
              La duración de la sesión colectiva es <strong>{fmtDurationMin(defaultDur)}</strong> (definida en la asignatura).
            </p>
          ) : (
            <p className="text-xs text-gray-700 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
              Prioridad: entrará el <strong>último</strong> de la fila (después de los actuales). Reordénalo luego con ▲▼.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}><X size={14} /> Cancelar</Button>
          <Button onClick={onSubmit} loading={saving}><Save size={14} /> Añadir</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
