"use client";

import { useEffect, useMemo, useState } from "react";
import { Calendar, Plus, Save, Trash2 } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import WeekGrid, { type WeekBlock } from "@/components/WeekGrid";
import { DAYS } from "@/lib/validate";
import { hourOptions, fmtDayRange } from "@/lib/hours";
import { rangesEqual, rangesToZones, unavailableOutsideAvailable, type TimeRange } from "@/lib/studentAvailability";

const COLORS = ["#2563eb", "#1d4ed8", "#0891b2", "#4f46e5", "#0284c7", "#7c3aed", "#0e7490", "#4338ca"];

interface Subject { id: number; name: string; }
interface Assignment {
  id: number; subjectId: number; dayOfWeek: number; startHour: number; endHour: number;
  origin: string; subject?: { id: number; name: string };
}

interface StudentAvailabilityDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  student: { id: number; name: string; availableRanges?: TimeRange[]; blockedRanges?: TimeRange[] } | null;
  subjects?: Subject[];
  onSave: (ranges: TimeRange[]) => Promise<void>;
  saving?: boolean;
}

export default function StudentAvailabilityDialog({
  open,
  onOpenChange,
  student,
  subjects = [],
  onSave,
  saving = false,
}: StudentAvailabilityDialogProps) {
  const [ranges, setRanges] = useState<TimeRange[]>([]);
  const [initialRanges, setInitialRanges] = useState<TimeRange[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [addDay, setAddDay] = useState("1");
  const [addStart, setAddStart] = useState("16");
  const [addEnd, setAddEnd] = useState("20");
  const [confirmRemove, setConfirmRemove] = useState<TimeRange | null>(null);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    if (open && student) {
      const base = [...(student.availableRanges ?? [])];
      setRanges(base);
      setInitialRanges(base);
    }
  }, [open, student]);

  useEffect(() => {
    if (!open || !student) {
      setAssignments([]);
      return;
    }
    let alive = true;
    fetch(`/api/assignments?studentId=${student.id}`)
      .then((r) => r.json())
      .then((rows: Assignment[]) => { if (alive) setAssignments(rows); })
      .catch(() => { if (alive) setAssignments([]); });
    return () => { alive = false; };
  }, [open, student?.id]);

  const subjectColor = useMemo(() => {
    const m: Record<number, string> = {};
    let ci = 0;
    for (const s of subjects) m[s.id] = COLORS[ci++ % COLORS.length];
    return m;
  }, [subjects]);

  const assignmentBlocks: WeekBlock[] = useMemo(
    () => assignments.map((a) => ({
      id: a.id,
      dayOfWeek: a.dayOfWeek,
      startHour: a.startHour,
      endHour: a.endHour,
      title: a.subject?.name ?? subjects.find((s) => s.id === a.subjectId)?.name ?? "Asignatura",
      subtitle: a.origin === "auto" ? "auto-agendado" : a.origin === "manual" ? "manual" : undefined,
      color: subjectColor[a.subjectId] ?? "#2563eb",
    })),
    [assignments, subjects, subjectColor],
  );

  const legend = useMemo(() => {
    const items: { label: string; color: string; dashed?: boolean }[] = [];
    if (ranges.length > 0) items.push({ label: "Disponible", color: "#22c55e", dashed: true });
    if ((student?.blockedRanges ?? []).length > 0) items.push({ label: "Bloqueado", color: "#ef4444" });
    const scheduledIds = new Set(assignments.map((a) => a.subjectId));
    for (const sub of subjects) {
      if (scheduledIds.has(sub.id)) {
        items.push({ label: sub.name, color: subjectColor[sub.id] ?? "#2563eb" });
      }
    }
    return items;
  }, [ranges.length, student?.blockedRanges, assignments, subjects, subjectColor]);

  const availZones = useMemo(() => rangesToZones(ranges), [ranges]);
  const blockedZones = useMemo(() => rangesToZones(student?.blockedRanges ?? []), [student?.blockedRanges]);
  const unavail = useMemo(() => unavailableOutsideAvailable(ranges), [ranges]);

  function addRange() {
    const day = Number(addDay);
    const start = Number(addStart);
    const end = Number(addEnd);
    if (!(end > start)) return;
    const dup = ranges.some((r) => r.day === day && r.end > start && r.start < end);
    if (dup) return;
    setRanges((cur) => [...cur, { day, start, end }].sort((a, b) => a.day - b.day || a.start - b.start));
  }

  function removeRange(target: TimeRange) {
    setRanges((cur) =>
      cur.filter((r) => !(r.day === target.day && r.start === target.start && r.end === target.end))
    );
    setConfirmRemove(null);
  }

  const dirty = !rangesEqual(ranges, initialRanges);

  async function persistAndClose() {
    if (closing || saving) return;
    if (!dirty) {
      onOpenChange(false);
      return;
    }
    setClosing(true);
    try {
      await onSave(ranges);
      onOpenChange(false);
    } finally {
      setClosing(false);
    }
  }

  async function handleOpenChange(next: boolean) {
    if (!next && open) {
      await persistAndClose();
      return;
    }
    onOpenChange(next);
  }

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent size="xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calendar size={18} className="text-emerald-600" />
              Disponibilidad de {student?.name ?? "alumno"}
            </DialogTitle>
            <DialogDescription>
              Franjas disponibles, bloqueos y clases ya asignadas (manuales o auto-agendadas). Al cerrar se guardan solo los cambios.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 overflow-y-auto weekgrid-dialog-scroll max-h-[min(55dvh,520px)]">
            <WeekGrid
              compact
              hourHeight={56}
              inDialog
              allowFullscreen
              fullscreenTitle={student ? `Horario de ${student.name}` : "Horario del alumno"}
              blocks={assignmentBlocks}
              availableZones={availZones}
              blockedZones={blockedZones}
              unavailable={unavail}
              showLegend
              legend={legend}
              onAvailClick={(z) => setConfirmRemove({ day: z.day, start: z.start, end: z.end })}
            />

            {assignments.length > 0 && (
              <div className="rounded-lg border border-blue-100 bg-blue-50/60 p-3 space-y-1.5">
                <p className="text-xs font-medium text-blue-900">Clases asignadas</p>
                <div className="flex flex-wrap gap-1.5">
                  {assignments.map((a) => (
                    <span
                      key={a.id}
                      className="inline-flex items-center gap-1 text-xs rounded-full pl-2.5 pr-2 py-0.5 border"
                      style={{
                        backgroundColor: `${subjectColor[a.subjectId] ?? "#2563eb"}18`,
                        borderColor: `${subjectColor[a.subjectId] ?? "#2563eb"}40`,
                        color: subjectColor[a.subjectId] ?? "#2563eb",
                      }}
                    >
                      {a.subject?.name ?? subjects.find((s) => s.id === a.subjectId)?.name ?? "Asignatura"}
                      <span className="text-gray-600">
                        · {fmtDayRange(a.dayOfWeek, a.startHour, a.endHour)}
                      </span>
                      {a.origin === "auto" && (
                        <span className="text-[10px] font-medium uppercase tracking-wide opacity-75">auto</span>
                      )}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="rounded-lg border border-gray-100 bg-gray-50/80 p-3 space-y-3">
              <p className="text-xs font-medium text-gray-600">Añadir franja disponible</p>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div>
                  <Label htmlFor="av-day">Día</Label>
                  <Select value={addDay} onValueChange={setAddDay}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {DAYS.map((d, i) => <SelectItem key={i} value={String(i)}>{d}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="av-start">Desde</Label>
                  <Select value={addStart} onValueChange={setAddStart}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {hourOptions(8, 23).map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="av-end">Hasta</Label>
                  <Select value={addEnd} onValueChange={setAddEnd}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {hourOptions(9, 24).map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end">
                  <Button type="button" variant="outline" className="w-full" onClick={addRange}>
                    <Plus size={14} /> Añadir
                  </Button>
                </div>
              </div>
            </div>

            {ranges.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {ranges.map((r, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1 text-xs bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-full pl-2.5 pr-1 py-0.5"
                  >
                    {fmtDayRange(r.day, r.start, r.end)}
                    <button
                      type="button"
                      onClick={() => setConfirmRemove(r)}
                      className="inline-flex items-center justify-center w-5 h-5 rounded-full hover:bg-emerald-100"
                      aria-label="Quitar franja"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}

            {ranges.length === 0 && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                Sin franjas definidas: el alumno se considera disponible en cualquier hora (salvo bloqueos).
              </p>
            )}
          </div>

          <DialogFooter>
            <Button onClick={persistAndClose} disabled={saving || closing}>
              <Save size={14} /> {saving || closing ? "Guardando…" : dirty ? "Guardar y cerrar" : "Cerrar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmRemove !== null} onOpenChange={(o) => { if (!o) setConfirmRemove(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Quitar franja</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Quitar la franja {confirmRemove ? fmtDayRange(confirmRemove.day, confirmRemove.start, confirmRemove.end) : ""}?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirmRemove && removeRange(confirmRemove)}>
              <Trash2 size={14} /> Quitar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
