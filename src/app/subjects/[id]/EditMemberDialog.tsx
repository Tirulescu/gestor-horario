"use client";

import { Save, X } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { COPY } from "@/lib/copy";
import { fmtDurationMin, MIN_DURATION_MIN, DURATION_STEP_MIN } from "@/lib/hours";
import {
  SessionPartsFields,
  syncSessionPartsForDuration,
  type SessionPartsValue,
} from "./SessionPartsFields";

type EditMemberDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isCollective: boolean;
  defaultDur: number;
  slotsRequired: string;
  onSlotsRequiredChange: (value: string) => void;
  durationMin: string;
  onDurationMinChange: (value: string) => void;
  sessionParts: SessionPartsValue;
  onSessionPartsChange: (value: SessionPartsValue) => void;
  saving: boolean;
  onSubmit: () => void;
};

export function EditMemberDialog({
  open,
  onOpenChange,
  isCollective,
  defaultDur,
  slotsRequired,
  onSlotsRequiredChange,
  durationMin,
  onDurationMinChange,
  sessionParts,
  onSessionPartsChange,
  saving,
  onSubmit,
}: EditMemberDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="text-center sm:text-center">
          <DialogTitle>Editar inscripción</DialogTitle>
        </DialogHeader>
        <div className="mx-auto w-full max-w-xs space-y-4 py-1">
          {!isCollective && (
            <>
              <div className="space-y-2">
                <Label htmlFor="em-slots">{COPY.slotsRequiredLabel}</Label>
                <Input id="em-slots" type="number" min={1} max={10} value={slotsRequired} onChange={(e) => onSlotsRequiredChange(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="em-dur">{COPY.durationLabel}</Label>
                <Input
                  id="em-dur"
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
              </div>
              <SessionPartsFields
                idPrefix="em"
                durationMin={Number(durationMin) || defaultDur}
                value={sessionParts}
                onChange={onSessionPartsChange}
                className="space-y-3 rounded-lg border border-gray-100 bg-gray-50/80 p-3 text-left"
              />
            </>
          )}
          {isCollective && (
            <p className="text-xs text-gray-500 text-center">En asignaturas colectivas la duración es común: {fmtDurationMin(defaultDur)}.</p>
          )}
        </div>
        <DialogFooter className="sm:justify-center gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}><X size={14} /> Cancelar</Button>
          <Button onClick={onSubmit} loading={saving}><Save size={14} /> Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
