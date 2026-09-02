"use client";

import { Save, X } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
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

type AddGradeDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  grades: string[];
  grade: string;
  onGradeChange: (grade: string) => void;
  durationMin: string;
  onDurationMinChange: (value: string) => void;
  slotsRequired: string;
  onSlotsRequiredChange: (value: string) => void;
  sessionParts: SessionPartsValue;
  onSessionPartsChange: (value: SessionPartsValue) => void;
  saving: boolean;
  onSubmit: () => void;
};

export function AddGradeDialog({
  open,
  onOpenChange,
  grades,
  grade,
  onGradeChange,
  durationMin,
  onDurationMinChange,
  slotsRequired,
  onSlotsRequiredChange,
  sessionParts,
  onSessionPartsChange,
  saving,
  onSubmit,
}: AddGradeDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Añadir curso a la asignatura</DialogTitle>
          <DialogDescription>Inscribe el curso con una duración.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="g-grade">Curso</Label>
            <Select value={grade} onValueChange={onGradeChange}>
              <SelectTrigger><SelectValue placeholder="Selecciona…" /></SelectTrigger>
              <SelectContent>
                {grades.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="g-dur">Duración de clase para este curso (minutos)</Label>
              <Input
                id="g-dur"
                type="number"
                min={MIN_DURATION_MIN}
                step={DURATION_STEP_MIN}
                value={durationMin}
                onChange={(e) => {
                  onDurationMinChange(e.target.value);
                  const dur = Number(e.target.value) || 0;
                  onSessionPartsChange(syncSessionPartsForDuration(dur, sessionParts));
                }}
              />
            </div>
            <div>
              <Label htmlFor="g-slots">{COPY.slotsRequiredLabel}</Label>
              <Input id="g-slots" type="number" min={1} max={10} value={slotsRequired} onChange={(e) => onSlotsRequiredChange(e.target.value)} />
            </div>
          </div>
          <SessionPartsFields
            idPrefix="g"
            durationMin={Number(durationMin) || 0}
            value={sessionParts}
            onChange={onSessionPartsChange}
            description="Aplica a todos los alumnos del curso"
            partsHint={
              <>Cada alumno tendrá {sessionParts.sessionParts} clases de {SESSION_PART_MIN} min (sin juntarlas).</>
            }
          />
          {grade && (
            <p className="text-xs text-gray-700 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
              Se inscribirán los alumnos de <strong>{grade}</strong> que aún no estén en esta asignatura, cada uno con clase de <strong>{fmtDurationMin(Number(durationMin) || 0)}</strong>
              {sessionParts.split ? <> dividida en <strong>{sessionParts.sessionParts}×{SESSION_PART_MIN} min</strong></> : null}.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}><X size={14} /> Cancelar</Button>
          <Button onClick={onSubmit} loading={saving}><Save size={14} /> Añadir curso</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
