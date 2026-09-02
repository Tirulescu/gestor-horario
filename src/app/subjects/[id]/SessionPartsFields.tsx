"use client";

import { Label } from "@/components/ui/label";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { sessionPartsOptions, SESSION_PART_MIN } from "@/lib/hours";

export type SessionPartsValue = {
  split: boolean;
  sessionParts: string;
};

type SessionPartsFieldsProps = {
  value: SessionPartsValue;
  onChange: (value: SessionPartsValue) => void;
  /** Duración total en minutos; las opciones se derivan de maxSessionParts(durationMin). */
  durationMin: number;
  idPrefix: string;
  description?: string;
  /** Texto bajo el selector de partes; omitir en el diálogo de edición. */
  partsHint?: React.ReactNode;
  className?: string;
};

/** Ajusta split/parts cuando cambia la duración (misma lógica que antes en los 3 formularios). */
export function syncSessionPartsForDuration(
  durationMin: number,
  current: SessionPartsValue,
): SessionPartsValue {
  const opts = sessionPartsOptions(durationMin);
  if (opts.length === 0) {
    return { ...current, split: false };
  }
  if (current.split && !opts.includes(Number(current.sessionParts))) {
    return { ...current, sessionParts: String(opts[0]) };
  }
  return current;
}

export function SessionPartsFields({
  value,
  onChange,
  durationMin,
  idPrefix,
  description = "Varias medias horas en horarios distintos",
  partsHint,
  className,
}: SessionPartsFieldsProps) {
  const opts = sessionPartsOptions(durationMin);
  if (opts.length === 0) return null;

  const splitId = `${idPrefix}-split`;
  const partsId = `${idPrefix}-parts`;

  return (
    <div className={className ?? "space-y-3 rounded-lg border border-gray-100 bg-gray-50/80 p-3"}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <Label htmlFor={splitId}>Dividir asignatura</Label>
          <p className="text-xs text-gray-500 mt-0.5">{description}</p>
        </div>
        <Switch
          id={splitId}
          checked={value.split}
          onCheckedChange={(v) => {
            if (v) {
              const nextParts = opts.includes(Number(value.sessionParts))
                ? value.sessionParts
                : String(opts[0]);
              onChange({ split: true, sessionParts: nextParts });
            } else {
              onChange({ ...value, split: false });
            }
          }}
        />
      </div>
      {value.split && (
        <div className={partsHint != null ? undefined : "space-y-2"}>
          <Label htmlFor={partsId}>Número de partes</Label>
          <Select
            value={value.sessionParts}
            onValueChange={(sessionParts) => onChange({ ...value, sessionParts })}
          >
            <SelectTrigger id={partsId}><SelectValue placeholder="Selecciona…" /></SelectTrigger>
            <SelectContent>
              {opts.map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n} × {SESSION_PART_MIN} min
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {partsHint != null && (
            <p className="text-xs text-gray-500 mt-1">{partsHint}</p>
          )}
        </div>
      )}
    </div>
  );
}
