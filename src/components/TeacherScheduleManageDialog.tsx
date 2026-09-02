"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarClock, CalendarPlus, Plus, Save, X } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { DAYS } from "@/lib/validate";
import { fmtDayRange, hourOptions } from "@/lib/hours";
import {
  getFreeHourSetsForDays,
  slotOverlapsBlocked,
  type TimeRange,
} from "@/lib/studentAvailability";

type ActionType = "availability" | "block";

type ConfirmRemove =
  | { kind: "availability"; id: number; label: string }
  | { kind: "block"; id: number; label: string }
  | null;

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
  onSaveAvailability: (ranges: TimeRange[]) => Promise<void>;
  onSaveBlock: (days: number[], start: number, end: number, title: string) => Promise<void>;
  onRemoveAvailability: (id: number) => Promise<void>;
  onRemoveBlock: (id: number) => Promise<void>;
}

const HOURS_START = hourOptions(8, 23);
const HOURS_END = hourOptions(9, 24);

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
  onSaveAvailability,
  onSaveBlock,
  onRemoveAvailability,
  onRemoveBlock,
}: TeacherScheduleManageDialogProps) {
  const [action, setAction] = useState<ActionType>("availability");
  const [days, setDays] = useState<Set<number>>(new Set([1]));
  const [start, setStart] = useState("16");
  const [end, setEnd] = useState("18");
  const [blockTitle, setBlockTitle] = useState("");
  const [pendingAvail, setPendingAvail] = useState<TimeRange[]>([]);
  const [addErr, setAddErr] = useState("");
  const [confirmRemove, setConfirmRemove] = useState<ConfirmRemove>(null);

  const blockedRanges = useMemo(() => blocksToRanges(teacherBlocks), [teacherBlocks]);
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
      return getFreeHourSetsForDays([...days], occupiedRanges, HOURS_START, HOURS_END, start);
    }
    // Disponibilidad: solo huecos libres (sin eventos/reservas del profesor).
    return getFreeHourSetsForDays(
      [...days],
      [...blockedRanges, ...pendingAvail],
      HOURS_START,
      HOURS_END,
      start,
    );
  }, [action, days, blockedRanges, occupiedRanges, pendingAvail, start]);

  useEffect(() => {
    if (!open) {
      setPendingAvail([]);
      return;
    }
    setAction("availability");
    setDays(new Set([1]));
    setStart("16");
    setEnd("18");
    setBlockTitle("");
    setPendingAvail([]);
    setAddErr("");
    setConfirmRemove(null);
  }, [open]);

  useEffect(() => {
    setAddErr("");
  }, [action, days, start, end, blockTitle]);

  useEffect(() => {
    if (hourSets.startSet.size === 0) return;
    if (!hourSets.startSet.has(start)) {
      setStart(Array.from(hourSets.startSet)[0]);
    }
  }, [hourSets.startSet, start, action, days, pendingAvail]);

  useEffect(() => {
    if (hourSets.endSet.size === 0) return;
    if (!hourSets.endSet.has(end)) {
      setEnd(Array.from(hourSets.endSet)[0]);
    }
  }, [hourSets.endSet, end]);

  function toggleDay(day: number) {
    setDays((prev) => {
      const n = new Set(prev);
      if (n.has(day)) n.delete(day);
      else n.add(day);
      return n;
    });
  }

  function formErr(): string {
    if (days.size === 0) return "Selecciona al menos un día";
    if (start === "" || end === "") return "";
    if (!(Number(end) > Number(start))) return "La hora de fin debe ser posterior a la de inicio";
    if (action === "availability" && pendingAvail.length === 0) return "Añade al menos una franja de disponibilidad";
    if (action === "availability" && hourSets.startSet.size === 0) {
      return "No hay horas libres (sin eventos) para los días seleccionados";
    }
    if (action === "block" && hourSets.startSet.size === 0) {
      return "No hay huecos libres: chocan con otros eventos";
    }
    if (action === "block" && !blockTitle.trim()) return "El motivo es obligatorio";
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
    const s = Number(start);
    const e = Number(end);
    if (!(e > s) || days.size === 0) return;
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
    if (err) return;
    if (action === "availability") {
      for (const r of pendingAvail) {
        const conflict = blockedConflictMessage(r);
        if (conflict) {
          setAddErr(conflict);
          return;
        }
      }
      await onSaveAvailability(pendingAvail);
      setPendingAvail([]);
      onOpenChange(false);
    } else {
      await onSaveBlock([...days], Number(start), Number(end), blockTitle.trim());
      onOpenChange(false);
    }
  }

  async function handleConfirmRemove() {
    if (!confirmRemove) return;
    if (confirmRemove.kind === "availability") await onRemoveAvailability(confirmRemove.id);
    else await onRemoveBlock(confirmRemove.id);
    setConfirmRemove(null);
  }

  return (
    <>
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
            <div className="rounded-lg border border-emerald-100 bg-emerald-50/50 p-3 space-y-1.5">
              <p className="text-xs font-medium text-emerald-900">Disponibilidad actual</p>
              <div className="flex flex-wrap gap-1.5">
                {availabilities.map((a) => (
                  <span key={a.id} className="inline-flex items-center gap-1 text-xs bg-white text-emerald-800 border border-emerald-200 rounded-full pl-2.5 pr-1 py-0.5">
                    {fmtDayRange(a.dayOfWeek, a.startHour, a.endHour)}
                    <button
                      type="button"
                      onClick={() => setConfirmRemove({
                        kind: "availability",
                        id: a.id,
                        label: `¿Quitar disponibilidad del ${fmtDayRange(a.dayOfWeek, a.startHour, a.endHour)}?`,
                      })}
                      className="inline-flex items-center justify-center w-5 h-5 rounded-full hover:bg-emerald-100"
                      aria-label="Quitar franja"
                    >
                      <X size={11} />
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}

          {action === "block" && teacherBlocks.length > 0 && (
            <div className="rounded-lg border border-red-100 bg-red-50/50 p-3 space-y-1.5">
              <p className="text-xs font-medium text-red-900">Eventos actuales</p>
              <div className="flex flex-wrap gap-1.5">
                {teacherBlocks.map((b) => (
                  <span key={b.id} className="inline-flex items-center gap-1 text-xs bg-white text-red-800 border border-red-200 rounded-full pl-2.5 pr-1 py-0.5">
                    {b.title} · {fmtDayRange(b.dayOfWeek, b.startHour, b.endHour)}
                    <button
                      type="button"
                      onClick={() => setConfirmRemove({
                        kind: "block",
                        id: b.id,
                        label: `¿Quitar el evento «${b.title}» del ${fmtDayRange(b.dayOfWeek, b.startHour, b.endHour)}?`,
                      })}
                      className="inline-flex items-center justify-center w-5 h-5 rounded-full hover:bg-red-100"
                      aria-label="Quitar evento"
                    >
                      <X size={11} />
                    </button>
                  </span>
                ))}
              </div>
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
                <Select value={start} onValueChange={setStart} disabled={hourSets.startSet.size === 0}>
                  <SelectTrigger><SelectValue placeholder="Selecciona…" /></SelectTrigger>
                  <SelectContent>
                    {HOURS_START.map((o) => hourItem(o, hourSets.startSet))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Hasta</Label>
                <Select value={end} onValueChange={setEnd} disabled={hourSets.endSet.size === 0}>
                  <SelectTrigger><SelectValue placeholder="Selecciona…" /></SelectTrigger>
                  <SelectContent>
                    {HOURS_END.map((o) => hourItem(o, hourSets.endSet))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {action === "availability" && (
              <Button type="button" variant="outline" className="w-full" onClick={addPendingAvailForEachDay} disabled={hourSets.startSet.size === 0 || hourSets.endSet.size === 0}>
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
          <Button variant="outline" onClick={() => onOpenChange(false)}><X size={14} /> Cancelar</Button>
          <Button onClick={handleSubmit} disabled={saving || !!err || (action === "availability" && !!addErr)}>
            {action === "availability" ? (
              <><Save size={14} /> Guardar disponibilidad{pendingAvail.length > 0 ? ` (${pendingAvail.length})` : ""}</>
            ) : (
              <><CalendarPlus size={14} /> Añadir evento</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

      <AlertDialog open={confirmRemove !== null} onOpenChange={(o) => { if (!o) setConfirmRemove(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmRemove?.kind === "block" ? "Quitar evento" : "Quitar disponibilidad"}
            </AlertDialogTitle>
            <AlertDialogDescription>{confirmRemove?.label}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmRemove}>Quitar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
