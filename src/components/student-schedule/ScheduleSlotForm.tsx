"use client";

import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { DAYS } from "@/lib/validate";
import { fmtHour, SCHEDULE_HOURS_START, SCHEDULE_HOURS_END } from "@/lib/hours";

const HOURS_START = SCHEDULE_HOURS_START;
const HOURS_END = SCHEDULE_HOURS_END;

interface ScheduleSlotFormProps {
  title?: { value: string; onChange: (value: string) => void; label: string; placeholder: string };
  days: Set<number>;
  onToggleDay: (day: number) => void;
  start: string;
  onStartChange: (value: string) => void;
  end: string;
  onEndChange: (value: string) => void;
  hourSets: { startSet: Set<string>; endSet: Set<string> };
  startLabel?: string;
  endLabel?: string;
  onAdd?: () => void;
  addLabel?: string;
}

function hourItem(o: { value: string; label: string }, allowed: Set<string>) {
  if (!allowed.has(o.value)) return null;
  return <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>;
}

export default function ScheduleSlotForm({
  title,
  days,
  onToggleDay,
  start,
  onStartChange,
  end,
  onEndChange,
  hourSets,
  startLabel = "Desde",
  endLabel = "Hasta",
  onAdd,
  addLabel,
}: ScheduleSlotFormProps) {
  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50/80 p-3 space-y-3">
      {title && (
        <div>
          <Label htmlFor="st-slot-title">{title.label}</Label>
          <Input
            id="st-slot-title"
            value={title.value}
            onChange={(e) => title.onChange(e.target.value)}
            placeholder={title.placeholder}
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
          <Label>{startLabel}</Label>
          <Select value={start || undefined} onValueChange={onStartChange} disabled={days.size === 0 || hourSets.startSet.size === 0}>
            <SelectTrigger><SelectValue placeholder="Selecciona…" /></SelectTrigger>
            <SelectContent>
              {HOURS_START.map((o) => hourItem(o, hourSets.startSet))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>{endLabel}</Label>
          <Select value={end || undefined} onValueChange={onEndChange} disabled={start === "" || hourSets.endSet.size === 0}>
            <SelectTrigger><SelectValue placeholder="Selecciona…" /></SelectTrigger>
            <SelectContent>
              {Array.from(hourSets.endSet)
                .sort((a, b) => Number(a) - Number(b))
                .map((v) => (
                  <SelectItem key={v} value={v}>{fmtHour(Number(v))}</SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      {onAdd && (
        <Button type="button" variant="outline" className="w-full" onClick={onAdd}>
          <Plus size={14} /> {addLabel ?? "Añadir"}
        </Button>
      )}
    </div>
  );
}
