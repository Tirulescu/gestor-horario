"use client";

import { useEffect, useMemo, useState } from "react";
import { Ban, CalendarPlus, X } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { fmtDayRange, SCHEDULE_HOURS_START, SCHEDULE_HOURS_END, endHourFromDuration, resolveMemberDurationMin, slotDurationMin } from "@/lib/hours";
import {
  getFreeHourSetsForDays,
  slotOverlapsBlocked,
  type TimeRange,
} from "@/lib/studentAvailability";
import type {
  ActionType,
  EventClassType,
  Student,
  StudentScheduleManageDialogProps,
  TargetMode,
} from "./types";
import TargetPicker from "./TargetPicker";
import ScheduleSlotForm from "./ScheduleSlotForm";

const HOURS_START = SCHEDULE_HOURS_START;
const HOURS_END = SCHEDULE_HOURS_END;

export default function StudentScheduleManageDialog({
  open,
  onOpenChange,
  students,
  grades,
  subjects,
  subjectLinks,
  teacherBlocks = [],
  assignments = [],
  initialStudentId = null,
  saving = false,
  onApplyBlocks,
  onApplyEvents,
}: StudentScheduleManageDialogProps) {
  const [action, setAction] = useState<ActionType>("event");
  const [eventType, setEventType] = useState<EventClassType>("subject");
  const [targetMode, setTargetMode] = useState<TargetMode>("student");
  const [studentId, setStudentId] = useState("");
  const [grade, setGrade] = useState("");
  const [group, setGroup] = useState<Set<number>>(new Set());
  const [eventSubjectId, setEventSubjectId] = useState("");
  const [days, setDays] = useState<Set<number>>(new Set());
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [slotTitle, setSlotTitle] = useState("");
  const [addErr, setAddErr] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const busy = saving || submitting;

  useEffect(() => {
    if (!open) return;
    setAction("event");
    setEventType("subject");
    if (initialStudentId != null) {
      setTargetMode("student");
      setStudentId(String(initialStudentId));
    } else {
      setTargetMode("student");
      setStudentId("");
      setGrade("");
      setGroup(new Set());
    }
    setEventSubjectId("");
    setDays(new Set());
    setStart("");
    setEnd("");
    setSlotTitle("");
    setAddErr("");
  }, [open, initialStudentId]);

  useEffect(() => {
    setDays(new Set());
    setStart("");
    setEnd("");
    setEventSubjectId("");
    setSlotTitle("");
    setAddErr("");
  }, [action, eventType, targetMode, studentId, grade, group]);

  const targets = useMemo(() => {
    if (targetMode === "student") return students.filter((s) => String(s.id) === studentId);
    if (targetMode === "grade") return students.filter((s) => (s.grade ?? "").trim() === grade);
    return students.filter((s) => group.has(s.id));
  }, [students, targetMode, studentId, grade, group]);

  const enrolledTargets = useMemo(() => {
    if (!eventSubjectId) return [];
    const sid = Number(eventSubjectId);
    return targets.filter((st) =>
      subjectLinks.some((l) => l.subjectId === sid && l.studentId === st.id),
    );
  }, [targets, eventSubjectId, subjectLinks]);

  const eventSubjects = useMemo(() => {
    const ids = new Set(targets.map((t) => t.id));
    return subjects.filter((sub) =>
      subjectLinks.some((l) => l.subjectId === sub.id && ids.has(l.studentId)),
    );
  }, [subjects, subjectLinks, targets]);

  const selectedSubject = subjects.find((s) => String(s.id) === eventSubjectId) ?? null;

  function memberFor(subjectId: number, studentId: number) {
    return subjectLinks.find((l) => l.subjectId === subjectId && l.studentId === studentId) ?? null;
  }

  function durationForStudent(st: Student): number | null {
    if (!selectedSubject) return null;
    const member = memberFor(selectedSubject.id, st.id);
    return resolveMemberDurationMin(selectedSubject, member ? { durationMin: member.durationMin ?? null } : null);
  }

  const eventSlotDuration = useMemo(() => {
    if (action !== "event" || eventType !== "subject" || !selectedSubject || enrolledTargets.length === 0) {
      return null;
    }
    const durations = enrolledTargets
      .map((st) => durationForStudent(st))
      .filter((d): d is number => d != null);
    if (durations.length === 0) return null;
    return Math.min(...durations);
  }, [action, eventType, selectedSubject, enrolledTargets, subjectLinks]);

  function effectiveBlocked(st: Student): TimeRange[] {
    return st.blockedRanges ?? [];
  }

  const hourSets = useMemo(() => {
    const occupied: TimeRange[] = [
      ...targets.flatMap((st) => effectiveBlocked(st)),
    ];
    if (action === "event" && eventType === "subject") {
      occupied.push(
        ...teacherBlocks.map((b) => ({ day: b.dayOfWeek, start: b.startHour, end: b.endHour })),
        ...assignments.map((a) => ({ day: a.dayOfWeek, start: a.startHour, end: a.endHour })),
      );
    } else {
      const targetIds = new Set(targets.map((st) => st.id));
      occupied.push(
        ...assignments
          .filter((a) => targetIds.has(a.studentId))
          .map((a) => ({ day: a.dayOfWeek, start: a.startHour, end: a.endHour })),
      );
    }
    return getFreeHourSetsForDays(
      [...days],
      occupied,
      HOURS_START,
      HOURS_END,
      start || undefined,
      action === "event" && eventType === "subject" ? eventSlotDuration ?? undefined : undefined,
    );
  }, [action, eventType, days, targets, start, teacherBlocks, assignments, eventSlotDuration]);

  useEffect(() => {
    setAddErr("");
  }, [action, eventType, targetMode, studentId, grade, group, days, start, end, eventSubjectId, slotTitle]);

  useEffect(() => {
    if (start === "") return;
    if (hourSets.startSet.size === 0 || !hourSets.startSet.has(start)) {
      setStart("");
    }
  }, [hourSets.startSet, start, action, days, eventSubjectId, eventType, targets]);

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

  const slotReady = days.size > 0 && start !== "" && end !== "" && Number(end) > Number(start);

  const canSave =
    targets.length > 0 &&
    slotReady &&
    (
      (action === "block") ||
      (action === "event" && eventType === "external" && slotTitle.trim() !== "") ||
      (
        action === "event" &&
        eventType === "subject" &&
        !!eventSubjectId &&
        enrolledTargets.length > 0 &&
        hourSets.startSet.has(start) &&
        hourSets.endSet.has(end) &&
        (eventSlotDuration == null || slotDurationMin(Number(start), Number(end)) <= eventSlotDuration)
      )
    );

  function formErr(): string {
    if (targets.length === 0) return "";
    if (action === "event" && eventType === "subject") {
      if (!eventSubjectId) return "";
      if (enrolledTargets.length === 0) return "Ningún alumno seleccionado está inscrito en esa asignatura";
      if (eventSlotDuration != null && start && end && slotDurationMin(Number(start), Number(end)) > eventSlotDuration) {
        return `La franja no puede superar ${eventSlotDuration} min`;
      }
    }
    if (action === "event" && eventType === "external" && slotReady && !slotTitle.trim()) {
      return "Pon un nombre a la clase";
    }
    return "";
  }
  const err = formErr();

  function blockedConflictMessage(range: TimeRange, forTargets = targets): string | null {
    for (const st of forTargets) {
      if (slotOverlapsBlocked(range.day, range.start, range.end, effectiveBlocked(st))) {
        return `La franja ${fmtDayRange(range.day, range.start, range.end)} choca con ${st.name}`;
      }
    }
    return null;
  }

  function rangesFromForm(kind: TimeRange["kind"], title?: string): TimeRange[] | null {
    if (targets.length === 0) {
      setAddErr("Selecciona a quién afecta");
      return null;
    }
    if (days.size === 0) {
      setAddErr("Selecciona al menos un día");
      return null;
    }
    if (start === "" || end === "") {
      setAddErr("Selecciona hora de inicio y fin");
      return null;
    }
    const s = Number(start);
    const e = Number(end);
    if (!(e > s)) {
      setAddErr("La hora de fin debe ser posterior a la de inicio");
      return null;
    }
    if (hourSets.startSet.size === 0) {
      setAddErr("No hay hueco libre para esos días");
      return null;
    }
    const name = title?.trim();
    const toAdd: TimeRange[] = [];
    for (const day of days) {
      const range: TimeRange = { day, start: s, end: e, kind, ...(name ? { title: name } : {}) };
      const conflict = blockedConflictMessage(range);
      if (conflict) {
        setAddErr(conflict);
        return null;
      }
      toAdd.push(range);
    }
    setAddErr("");
    return toAdd;
  }

  async function handleSubmit() {
    if (err || busy || !canSave) return;
    setSubmitting(true);
    try {
      if (action === "block") {
        const adds = rangesFromForm("block", slotTitle);
        if (!adds) return;
        const ok = await onApplyBlocks({ removes: [], targets, adds });
        if (ok) onOpenChange(false);
        return;
      }
      if (eventType === "external") {
        const adds = rangesFromForm("class", slotTitle);
        if (!adds) return;
        const ok = await onApplyBlocks({ removes: [], targets, adds });
        if (ok) onOpenChange(false);
        return;
      }
      const subjectId = Number(eventSubjectId);
      const ok = await onApplyEvents({
        removeIds: [],
        create: {
          targets: enrolledTargets,
          subjectId,
          days: [...days],
          start: Number(start),
          endForStudent: (st) => {
            const maxDur = durationForStudent(st);
            const requested = Number(end);
            if (maxDur == null) return requested;
            const maxEnd = endHourFromDuration(Number(start), maxDur);
            return Math.min(requested, maxEnd);
          },
        },
      });
      if (ok) onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  }

  const needsTitle = action === "block" || (action === "event" && eventType === "external");

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onOpenChange(false); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarPlus size={18} className="text-blue-600" />
            Añadir al horario
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 overflow-y-auto" style={{ maxHeight: "62dvh" }}>
          <div>
            <Label>Qué añadir</Label>
            <div className="flex flex-wrap gap-2 mt-1">
              <button type="button" onClick={() => setAction("event")} className={`chip ${action === "event" ? "chip-active" : ""}`}>
                Clase
              </button>
              <button type="button" onClick={() => setAction("block")} className={`chip ${action === "block" ? "chip-active" : ""}`}>
                Bloqueo
              </button>
            </div>
          </div>

          <TargetPicker
            targetMode={targetMode}
            onTargetModeChange={setTargetMode}
            students={students}
            grades={grades}
            studentId={studentId}
            onStudentIdChange={setStudentId}
            grade={grade}
            onGradeChange={setGrade}
            group={group}
            onGroupChange={setGroup}
            targets={targets}
          />

          {action === "event" && targets.length > 0 && (
            <div>
              <Label>Tipo de clase</Label>
              <div className="flex flex-wrap gap-2 mt-1">
                <button type="button" onClick={() => setEventType("subject")} className={`chip ${eventType === "subject" ? "chip-active" : ""}`}>
                  Mi asignatura
                </button>
                <button type="button" onClick={() => setEventType("external")} className={`chip ${eventType === "external" ? "chip-active" : ""}`}>
                  Otra asignatura
                </button>
              </div>
            </div>
          )}

          {action === "event" && eventType === "subject" && targets.length > 0 && (
            <div>
              <Label htmlFor="sm-subject">Asignatura</Label>
              {eventSubjects.length === 0 ? (
                <p className="text-xs text-gray-500 mt-1">Sin asignaturas en la selección.</p>
              ) : (
                <Select value={eventSubjectId} onValueChange={setEventSubjectId}>
                  <SelectTrigger><SelectValue placeholder="Selecciona…" /></SelectTrigger>
                  <SelectContent>
                    {eventSubjects.map((s) => (
                      <SelectItem key={s.id} value={String(s.id)}>
                        {s.name}{s.isCollective ? " · Colectiva" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}

          {targets.length > 0 && (
            <ScheduleSlotForm
              title={needsTitle ? {
                value: slotTitle,
                onChange: setSlotTitle,
                label: "Nombre",
                placeholder: action === "block" ? "Ej: extraescolar, médico…" : "Ej: Orquesta, Lenguaje…",
              } : undefined}
              days={days}
              onToggleDay={toggleDay}
              start={start}
              onStartChange={setStart}
              end={end}
              onEndChange={setEnd}
              hourSets={hourSets}
              startLabel={action === "event" ? "Hora de inicio" : "Desde"}
              endLabel={action === "event" ? "Hora de fin" : "Hasta"}
            />
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
            {action === "event" ? (
              <><CalendarPlus size={14} /> Crear clase</>
            ) : (
              <><Ban size={14} /> Crear bloqueo</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
