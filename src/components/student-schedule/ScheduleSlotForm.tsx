"use client";

import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { DAYS } from "@/lib/validate";
import { fmtHour, fmtDurationMin, slotDurationMin, SCHEDULE_HOURS_START, SCHEDULE_HOURS_END } from "@/lib/hours";
import type { ActionType } from "./types";

const HOURS_START = SCHEDULE_HOURS_START;
const HOURS_END = SCHEDULE_HOURS_END;

interface ScheduleSlotFormProps {
  action: ActionType;
  blockTitle: string;
  onBlockTitleChange: (value: string) => void;
  days: Set<number>;
  onToggleDay: (day: number) => void;
  start: string;
  onStartChange: (value: string) => void;
  end: string;
  onEndChange: (value: string) => void;
  hourSets: { startSet: Set<string>; endSet: Set<string> };
  eventSlotDuration: number | null;
  onAddAvailability: () => void;
  onAddBlocks: () => void;
}

function hourItem(o: { value: string; label: string }, allowed: Set<string>) {
  if (!allowed.has(o.value)) return null;
  return <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>;
}

export default function ScheduleSlotForm({
  action,
  blockTitle,
  onBlockTitleChange,
  days,
  onToggleDay,
  start,
  onStartChange,
  end,
  onEndChange,
  hourSets,
  eventSlotDuration,
  onAddAvailability,
  onAddBlocks,
}: ScheduleSlotFormProps) {
  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50/80 p-3 space-y-3">
      <p className="text-xs font-medium text-gray-600">
        {action === "event" ? "Nueva clase" : action === "availability" ? "Nueva franja de disponibilidad" : "Nuevo bloqueo"}
      </p>
      {action === "block" && (
        <div>
          <Label htmlFor="st-block-title">Nombre</Label>
          <Input
            id="st-block-title"
            value={blockTitle}
            onChange={(e) => onBlockTitleChange(e.target.value)}
            placeholder="Ej: Extraescolar, viaje, médico…"
          />
        </div>
      )}
      <div>
        <Label>Días</Label>
        <div className="flex flex-wrap gap-2 mt-1">
          {DAYS.map((d, i) => (
            <label
              key={i}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-sm cursor-pointer transition-colors ${
                days.has(i)
                  ? "bg-[#eff6ff] border-[var(--accent)] text-[var(--accent)]"
                  : "bg-white border-gray-200 text-gray-700"
              }`}
            >
              <Checkbox
                size="sm"
                checked={days.has(i)}
                onChange={() => onToggleDay(i)}
              />
              {d}
            </label>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <Label>{action === "event" ? "Hora de inicio" : "Desde"}</Label>
          <Select value={start || undefined} onValueChange={onStartChange} disabled={days.size === 0 || hourSets.startSet.size === 0}>
            <SelectTrigger><SelectValue placeholder="Selecciona…" /></SelectTrigger>
            <SelectContent>
              {HOURS_START.map((o) => hourItem(o, hourSets.startSet))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>{action === "event" ? "Hora de fin" : "Hasta"}</Label>
          <Select value={end || undefined} onValueChange={onEndChange} disabled={start === "" || hourSets.endSet.size === 0}>
            <SelectTrigger><SelectValue placeholder="Selecciona…" /></SelectTrigger>
            <SelectContent>
              {action === "event"
                ? Array.from(hourSets.endSet)
                    .sort((a, b) => Number(a) - Number(b))
                    .map((v) => (
                      <SelectItem key={v} value={v}>{fmtHour(Number(v))}</SelectItem>
                    ))
                : HOURS_END.map((o) => hourItem(o, hourSets.endSet))}
            </SelectContent>
          </Select>
        </div>
      </div>
      {action === "event" && start !== "" && end !== "" && Number(end) > Number(start) && (
        <p className="text-xs text-gray-500">
          Esta clase: {fmtDurationMin(slotDurationMin(Number(start), Number(end)))}
          {eventSlotDuration != null ? ` (máx. ${fmtDurationMin(eventSlotDuration)})` : ""}
        </p>
      )}
      {action === "availability" && (
        <Button type="button" variant="outline" className="w-full" onClick={onAddAvailability}>
          <Plus size={14} /> Añadir franja{days.size > 1 ? "s" : ""}
        </Button>
      )}
      {action === "block" && (
        <Button type="button" variant="outline" className="w-full" onClick={onAddBlocks}>
          <Plus size={14} /> Añadir bloqueo{days.size > 1 ? "s" : ""}
        </Button>
      )}
    </div>
  );
}
