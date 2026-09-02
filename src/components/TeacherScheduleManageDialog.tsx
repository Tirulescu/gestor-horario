"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarClock, CalendarPlus, Plus, Save, X } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { DAYS } from "@/lib/validate";
import { fmtDayRange, SCHEDULE_HOURS_START, SCHEDULE_HOURS_END } from "@/lib/hours";
import {
  getFreeHourSetsForDays,
  slotOverlapsBlocked,
  type TimeRange,
} from "@/lib/studentAvailability";

type ActionType = "availability" | "block";

function toggleId(prev: Set<number>, id: number) {
  const n = new Set(prev);
  if (n.has(id)) n.delete(id);
  else n.add(id);
  return n;
}

interface Availability {
  id: number;
  dayOfWeek: number;
  startHour: number;
  endHour: number;
}

interface TeacherBlock {
  id: number;
  title: string;
  dayOfWeek: number;
  startHour: number;
  endHour: number;
}

interface TeacherScheduleManageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  availabilities: Availability[];
  teacherBlocks: TeacherBlock[];
  /** Clases ya asignadas: no pueden solapar con nuevos eventos. */
  assignments?: { dayOfWeek: number; startHour: number; endHour: number }[];
  saving?: boolean;
  onApplyAvailability: (args: {
    removeIds: number[];
    adds: TimeRange[];
  }) => Promise<boolean>;
  onApplyBlocks: (args: {
    removeIds: number[];
    create?: { days: number[]; start: number; end: number; title: string };
  }) => Promise<boolean>;
}

const HOURS_START = SCHEDULE_HOURS_START;
const HOURS_END = SCHEDULE_HOURS_END;

function blocksToRanges(blocks: TeacherBlock[]): TimeRange[] {
  return blocks.map((b) => ({ day: b.dayOfWeek, start: b.startHour, end: b.endHour }));
}

export default function TeacherScheduleManageDialog({
  open,
  onOpenChange,
  availabilities,
  teacherBlocks,
  assignments = [],
  saving = false,
  onApplyAvailability,
  onApplyBlocks,
}: TeacherScheduleManageDialogProps) {
  const [action, setAction] = useState<ActionType>("availability");
  const [days, setDays] = useState<Set<number>>(new Set());
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [blockTitle, setBlockTitle] = useState("");
  const [pendingAvail, setPendingAvail] = useState<TimeRange[]>([]);
  const [pendingRemoveAvail, setPendingRemoveAvail] = useState<Set<number>>(new Set());
  const [pendingRemoveBlocks, setPendingRemoveBlocks] = useState<Set<number>>(new Set());
  const [addErr, setAddErr] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const busy = saving || submitting;

  const activeBlocks = useMemo(
    () => teacherBlocks.filter((b) => !pendingRemoveBlocks.has(b.id)),
    [teacherBlocks, pendingRemoveBlocks],
  );
  const blockedRanges = useMemo(() => blocksToRanges(activeBlocks), [activeBlocks]);
  const occupiedRanges = useMemo(
    () => [
      ...blockedRanges,
      ...assignments.map((a) => ({ day: a.dayOfWeek, start: a.startHour, end: a.endHour })),
    ],
    [blockedRanges, assignments],
  );

  const hourSets = useMemo(() => {
    // Eventos: pueden estar fuera de la disponibilidad, pero no solapar eventos/clases.
    if (action === "block") {
      return getFreeHourSetsForDays([...days], occupiedRanges, HOURS_START, HOURS_END, start || undefined);
    }
    // Disponibilidad: solo huecos libres (sin eventos/reservas del profesor).
    return getFreeHourSetsForDays(
      [...days],
      [...blockedRanges, ...pendingAvail],
      HOURS_START,
      HOURS_END,
      start || undefined,
    );
  }, [action, days, blockedRanges, occupiedRanges, pendingAvail, start]);

  useEffect(() => {
    if (!open) {
      setPendingAvail([]);
      setPendingRemoveAvail(new Set());
      setPendingRemoveBlocks(new Set());
      return;
    }
    setAction("availability");
    setDays(new Set());
    setStart("");
    setEnd("");
    setBlockTitle("");
    setPendingAvail([]);
    setPendingRemoveAvail(new Set());
    setPendingRemoveBlocks(new Set());
    setAddErr("");
  }, [open]);

  useEffect(() => {
    setPendingRemoveAvail(new Set());
    setPendingRemoveBlocks(new Set());
    setDays(new Set());
    setStart("");
    setEnd("");
    setBlockTitle("");
    setPendingAvail([]);
    setAddErr("");
  }, [action]);

  useEffect(() => {
    setAddErr("");
  }, [action, days, start, end, blockTitle]);

  useEffect(() => {
    if (start === "") return;
    if (hourSets.startSet.size === 0 || !hourSets.startSet.has(start)) {
      setStart("");
    }
  }, [hourSets.startSet, start, action, days, pendingAvail]);

  useEffect(() => {
    if (end === "") return;
    if (start === "" || hourSets.endSet.size === 0 || !hourSets.endSet.has(end) || !(Number(end) > Number(start))) {
      setEnd("");
    }
  }, [hourSets.endSet, end, start]);

  function toggleDay(day: number) {
    setDays((prev) => {
      const n = new Set(prev);
      if (n.has(day)) n.delete(day);
      else n.add(day);
      return n;
    });
  }

  const blockFormComplete =
    blockTitle.trim() !== "" &&
    days.size > 0 &&
    start !== "" &&
    end !== "" &&
    Number(end) > Number(start) &&
    hourSets.startSet.size > 0 &&
    hourSets.startSet.has(start) &&
    hourSets.endSet.has(end);

  const blockFormTouched =
    blockTitle.trim() !== "" || days.size > 0 || start !== "" || end !== "";

  const canSave =
    (action === "availability" && (pendingAvail.length > 0 || pendingRemoveAvail.size > 0)) ||
    (action === "block" && (pendingRemoveBlocks.size > 0 || blockFormComplete));

  function formErr(): string {
    if (action === "availability") return "";
    if (pendingRemoveBlocks.size > 0) return "";
    if (!blockFormTouched) return "";
    if (!blockTitle.trim()) return "El motivo es obligatorio";
    if (days.size === 0) return "Selecciona al menos un día";
    if (start === "" || end === "") return "Selecciona hora de inicio y fin";
    if (!(Number(end) > Number(start))) return "La hora de fin debe ser posterior a la de inicio";
    if (hourSets.startSet.size === 0) return "No hay huecos libres: chocan con otros eventos";
    return "";
  }
  const err = formErr();

  function hourItem(o: { value: string; label: string }, allowed: Set<string>) {
    if (!allowed.has(o.value)) return null;
    return <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>;
  }

  function blockedConflictMessage(range: TimeRange): string | null {
    if (slotOverlapsBlocked(range.day, range.start, range.end, blockedRanges)) {
      const hit = teacherBlocks.find(
        (b) => b.dayOfWeek === range.day && b.endHour > range.start && b.startHour < range.end
      );
      const label = hit?.title ? `«${hit.title}»` : "un evento";
      return `La franja ${fmtDayRange(range.day, range.start, range.end)} choca con ${label}`;
    }
    return null;
  }

  function addPendingAvailForEachDay() {
    if (days.size === 0) {
      setAddErr("Selecciona al menos un día");
      return;
    }
    if (start === "" || end === "") {
      setAddErr("Selecciona hora de inicio y fin");
      return;
    }
    const s = Number(start);
    const e = Number(end);
    if (!(e > s)) {
      setAddErr("La hora de fin debe ser posterior a la de inicio");
      return;
    }
    if (hourSets.startSet.size === 0) {
      setAddErr("No hay horas libres (sin eventos) para los días seleccionados");
      return;
    }
    const toAdd: TimeRange[] = [];
    for (const day of days) {
      const range = { day, start: s, end: e };
      const dup = pendingAvail.some((r) => r.day === day && r.end > s && r.start < e);
      if (dup) continue;
      const conflict = blockedConflictMessage(range);
      if (conflict) {
        setAddErr(conflict);
        return;
      }
      toAdd.push(range);
    }
    if (toAdd.length === 0) {
      setAddErr("Esa franja ya está en la lista");
      return;
    }
    setAddErr("");
    setPendingAvail((cur) => [...cur, ...toAdd].sort((a, b) => a.day - b.day || a.start - b.start));
  }

  function removePendingAvail(target: TimeRange) {
    setPendingAvail((cur) =>
      cur.filter((r) => !(r.day === target.day && r.start === target.start && r.end === target.end))
    );
  }

  async function handleSubmit() {
    if (err || busy) return;
    setSubmitting(true);
    try {
      if (action === "availability") {
        for (const r of pendingAvail) {
          const conflict = blockedConflictMessage(r);
          if (conflict) {
            setAddErr(conflict);
            return;
          }
        }
        const ok = await onApplyAvailability({
          removeIds: [...pendingRemoveAvail],
          adds: pendingAvail,
        });
        if (!ok) return;
        setPendingAvail([]);
        setPendingRemoveAvail(new Set());
        onOpenChange(false);
      } else {
        const ok = await onApplyBlocks({
          removeIds: [...pendingRemoveBlocks],
          create: blockFormComplete
            ? {
                days: [...days],
                start: Number(start),
                end: Number(end),
                title: blockTitle.trim(),
              }
            : undefined,
        });
        if (!ok) return;
        setPendingRemoveBlocks(new Set());
        onOpenChange(false);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onOpenChange(false); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarClock size={18} className="text-blue-600" />
            Gestionar horario
          </DialogTitle>
          <DialogDescription>Disponibilidad o eventos.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 overflow-y-auto" style={{ maxHeight: "62dvh" }}>
          <div>
            <Label>¿Qué quieres hacer?</Label>
            <div className="flex flex-wrap gap-2 mt-1">
              <button type="button" onClick={() => setAction("availability")} className={`chip ${action === "availability" ? "chip-active" : ""}`}>
                Añadir o modificar disponibilidad
              </button>
              <button type="button" onClick={() => setAction("block")} className={`chip ${action === "block" ? "chip-active" : ""}`}>
                Añadir o modificar evento
              </button>
            </div>
          </div>

          {action === "availability" && teacherBlocks.length > 0 && (
            <div className="rounded-lg border border-red-100 bg-red-50/50 p-3 space-y-1.5">
              <p className="text-xs font-medium text-red-900">Eventos (no se pueden marcar como disponibles)</p>
              <div className="flex flex-wrap gap-1.5">
                {teacherBlocks.map((b) => (
                  <span key={b.id} className="text-xs bg-white text-red-800 border border-red-200 rounded-full px-2.5 py-0.5">
                    {b.title} · {fmtDayRange(b.dayOfWeek, b.startHour, b.endHour)}
                  </span>
                ))}
              </div>
            </div>
          )}

          {action === "availability" && availabilities.length > 0 && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-3 space-y-2">
              <p className="text-sm font-medium text-emerald-950">Disponibilidad actual</p>
              <ul className="space-y-1.5 max-h-[28dvh] overflow-y-auto">
                {availabilities.map((a) => {
                  const marked = pendingRemoveAvail.has(a.id);
                  return (
                  <li
                    key={a.id}
                    className={`flex items-center gap-2 rounded-lg border border-emerald-200/80 bg-white px-3 py-2 ${marked ? "opacity-50" : ""}`}
                  >
                    <p className={`min-w-0 flex-1 text-sm font-medium text-emerald-950 truncate ${marked ? "line-through" : ""}`}>
                      {fmtDayRange(a.dayOfWeek, a.startHour, a.endHour)}
                    </p>
                    <button
                      type="button"
                      onClick={() => setPendingRemoveAvail((prev) => toggleId(prev, a.id))}
                      className="inline-flex items-center justify-center w-8 h-8 rounded-full text-red-600 hover:bg-red-50"
                      aria-label={marked ? "Deshacer quitar" : "Quitar"}
                    >
                      <X size={14} />
                    </button>
                  </li>
                  );
                })}
              </ul>
            </div>
          )}

          {action === "block" && teacherBlocks.length > 0 && (
            <div className="rounded-lg border border-red-200 bg-red-50/60 p-3 space-y-2">
              <p className="text-sm font-medium text-red-950">Eventos actuales</p>
              <ul className="space-y-1.5 max-h-[28dvh] overflow-y-auto">
                {teacherBlocks.map((b) => {
                  const marked = pendingRemoveBlocks.has(b.id);
                  return (
                  <li
                    key={b.id}
                    className={`flex items-center gap-2 rounded-lg border border-red-200/80 bg-white px-3 py-2 ${marked ? "opacity-50" : ""}`}
                  >
                    <div className={`min-w-0 flex-1 ${marked ? "line-through" : ""}`}>
                      <p className="text-sm font-medium text-red-950 truncate">{b.title}</p>
                      <p className="text-xs text-red-800/70 truncate">
                        {fmtDayRange(b.dayOfWeek, b.startHour, b.endHour)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setPendingRemoveBlocks((prev) => toggleId(prev, b.id))}
                      className="inline-flex items-center justify-center w-8 h-8 rounded-full text-red-600 hover:bg-red-50"
                      aria-label={marked ? "Deshacer quitar" : "Quitar"}
                    >
                      <X size={14} />
                    </button>
                  </li>
                  );
                })}
              </ul>
            </div>
          )}

          {action === "availability" && pendingAvail.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {pendingAvail.map((r, i) => (
                <span key={i} className="inline-flex items-center gap-1 text-xs bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-full pl-2.5 pr-1 py-0.5">
                  {fmtDayRange(r.day, r.start, r.end)}
                  <button type="button" onClick={() => removePendingAvail(r)} className="inline-flex items-center justify-center w-5 h-5 rounded-full hover:bg-emerald-100" aria-label="Quitar">
                    <X size={11} />
                  </button>
                </span>
              ))}
            </div>
          )}

          <div className="rounded-lg border border-gray-100 bg-gray-50/80 p-3 space-y-3">
            <p className="text-xs font-medium text-gray-600">
              {action === "availability" ? "Nueva franja de disponibilidad" : "Nuevo evento"}
            </p>
            {action === "block" && (
              <div>
                <Label htmlFor="tb-title">Motivo</Label>
                <Input
                  id="tb-title"
                  value={blockTitle}
                  onChange={(e) => setBlockTitle(e.target.value)}
                  placeholder="Ej: Reunión de departamento"
                  required
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
                      onChange={() => toggleDay(i)}
                    />
                    {d}
                  </label>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label>Desde</Label>
                <Select value={start || undefined} onValueChange={setStart} disabled={days.size === 0 || hourSets.startSet.size === 0}>
                  <SelectTrigger><SelectValue placeholder="Selecciona…" /></SelectTrigger>
                  <SelectContent>
                    {HOURS_START.map((o) => hourItem(o, hourSets.startSet))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Hasta</Label>
                <Select value={end || undefined} onValueChange={setEnd} disabled={start === "" || hourSets.endSet.size === 0}>
                  <SelectTrigger><SelectValue placeholder="Selecciona…" /></SelectTrigger>
                  <SelectContent>
                    {HOURS_END.map((o) => hourItem(o, hourSets.endSet))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {action === "availability" && (
              <Button type="button" variant="outline" className="w-full" onClick={addPendingAvailForEachDay}>
                <Plus size={14} /> Añadir franja{days.size > 1 ? "s" : ""}
              </Button>
            )}
          </div>

          {action === "availability" && (
            <p className="text-xs text-gray-500">
              Solo horas libres, sin eventos.
            </p>
          )}

          {action === "block" && (
            <p className="text-xs text-gray-500">
              Pueden estar fuera de tu disponibilidad; no pueden solapar otros eventos o clases.
            </p>
          )}

          {(addErr || err) && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              {addErr || err}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            <X size={14} /> Cancelar
          </Button>
          <Button onClick={handleSubmit} loading={busy} disabled={!canSave || !!err || !!addErr}>
            {action === "availability" ? (
              <><Save size={14} /> Guardar{(pendingAvail.length + pendingRemoveAvail.size) > 0 ? ` (${pendingAvail.length + pendingRemoveAvail.size})` : ""}</>
            ) : pendingRemoveBlocks.size > 0 ? (
              <><Save size={14} /> Guardar ({pendingRemoveBlocks.size})</>
            ) : (
              <><CalendarPlus size={14} /> Añadir evento</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
