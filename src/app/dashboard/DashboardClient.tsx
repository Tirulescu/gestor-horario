"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Briefcase, Sparkles, CalendarClock,
} from "lucide-react";
import WeekGrid, { type WeekBlock } from "@/components/WeekGrid";
import AutoScheduleResultDialog, { type AutoScheduleResult } from "@/components/AutoScheduleResultDialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/Toast";
import PageHeader from "@/components/PageHeader";
import { WeekGridSkeleton } from "@/components/skeletons";
import { Skeleton } from "@/components/ui/skeleton";
import { SCHEDULE_DAY_START, SCHEDULE_DAY_END, endHourFromDuration, resolveMemberDurationMin } from "@/lib/hours";
import { carveAvailabilityAroundBlocked, getFreeHourSetsForDays, normalizeRanges, type TimeRange } from "@/lib/studentAvailability";
import { persistAvailabilityAdds, replaceAvailabilityPieces } from "@/lib/availabilityMutations";
import TeacherScheduleManageDialog from "@/components/TeacherScheduleManageDialog";
import { invalidate, invalidateMany, put, warmData } from "@/lib/clientCache";
import {
  COLORS, HOURS_START, HOURS_END,
  type Teacher, type Subject, type TeacherBlock, type Availability,
  type Student, type SubjectStudent, type Assignment,
} from "./types";
import { buildTeacherBlockBlocks, buildAssignmentBlocks } from "./buildWeekBlocks";
import AssignmentEditDialog from "./AssignmentEditDialog";
import ConfirmDeleteDialogs from "./ConfirmDeleteDialogs";

function readDashboardCache() {
  const teachers = warmData<Teacher[]>("/api/teachers");
  const subs = warmData<Subject[]>("/api/subjects");
  const asg = warmData<Assignment[]>("/api/assignments");
  const tb = warmData<TeacherBlock[]>("/api/teacher_blocks");
  const av = warmData<Availability[]>("/api/availabilities");
  if (!teachers || !subs || !asg || !tb || !av) return null;
  return {
    teacher: teachers[0] ?? null,
    subjects: subs,
    assignments: asg,
    teacherBlocks: tb,
    availabilities: av,
  };
}

export default function DashboardClient() {
  const toast = useToast();

  const [teacher, setTeacher] = useState<Teacher | null>(null);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [selectedAssignment, setSelectedAssignment] = useState<Assignment | null>(null);
  const [selectedCollectiveSession, setSelectedCollectiveSession] = useState<Assignment[] | null>(null);
  const [teacherBlocks, setTeacherBlocks] = useState<TeacherBlock[]>([]);
  const [availabilities, setAvailabilities] = useState<Availability[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [subjectStudents, setSubjectStudents] = useState<SubjectStudent[]>([]);
  const [confirmTb, setConfirmTb] = useState<TeacherBlock | null>(null);
  const [confirmDeleteAsg, setConfirmDeleteAsg] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [autoResult, setAutoResult] = useState<AutoScheduleResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [loading, setLoading] = useState(true);

  const [editAsgDay, setEditAsgDay] = useState("0");
  const [editAsgStart, setEditAsgStart] = useState("");
  const [editAsgEnd, setEditAsgEnd] = useState("");

  function hydrateFromCache(): boolean {
    const cached = readDashboardCache();
    if (!cached) return false;
    setTeacher(cached.teacher);
    setSubjects(cached.subjects);
    setAssignments(cached.assignments);
    setTeacherBlocks(cached.teacherBlocks);
    setAvailabilities(cached.availabilities);
    return true;
  }

  async function load() {
    const hadCache = hydrateFromCache();
    if (hadCache) setLoading(false);
    try {
      const [teachers, subs, asg, tb, av, sts, ss] = await Promise.all([
        fetch("/api/teachers").then((r) => r.json()) as Promise<Teacher[]>,
        fetch("/api/subjects").then((r) => r.json()) as Promise<Subject[]>,
        fetch("/api/assignments").then((r) => r.json()) as Promise<Assignment[]>,
        fetch("/api/teacher_blocks").then((r) => r.json()) as Promise<TeacherBlock[]>,
        fetch("/api/availabilities").then((r) => r.json()) as Promise<Availability[]>,
        fetch("/api/students").then((r) => r.json()) as Promise<Student[]>,
        fetch("/api/subject_students").then((r) => r.json()) as Promise<SubjectStudent[]>,
      ]);
      setTeacher(teachers[0] ?? null);
      setSubjects(subs);
      setAssignments(asg);
      setTeacherBlocks(tb);
      setAvailabilities(av);
      setStudents(sts);
      setSubjectStudents(ss);
      put("/api/teachers", teachers);
      put("/api/subjects", subs);
      put("/api/assignments", asg);
      put("/api/teacher_blocks", tb);
      put("/api/availabilities", av);
      put("/api/students", sts);
      put("/api/subject_students", ss);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  const subjectColor: Record<number, string> = useMemo(() => {
    const m: Record<number, string> = {};
    let ci = 0;
    for (const s of subjects) m[s.id] = COLORS[ci++ % COLORS.length];
    return m;
  }, [subjects]);

  const subjectNames: Record<number, string> = useMemo(() => {
    const m: Record<number, string> = {};
    for (const s of subjects) m[s.id] = s.name;
    return m;
  }, [subjects]);

  function memberFor(subjectId: number, studentId: number) {
    return subjectStudents.find((ss) => ss.subjectId === subjectId && ss.studentId === studentId) ?? null;
  }

  function assignmentDurationMin(target: Assignment, collective: Assignment[] | null): number | null {
    const subj = subjects.find((s) => s.id === target.subjectId);
    if (!subj) return null;
    if (collective) return subj.defaultDurationMin;
    return resolveMemberDurationMin(subj, memberFor(target.subjectId, target.studentId));
  }

  function studentsForAssignment(target: Assignment, collective: Assignment[] | null): Student[] {
    const ids = collective ? collective.map((a) => a.studentId) : [target.studentId];
    return ids.map((id) => students.find((s) => s.id === id)).filter((s): s is Student => s != null);
  }

  const editTarget = selectedCollectiveSession?.[0] ?? selectedAssignment;
  const editDurationMin = editTarget ? assignmentDurationMin(editTarget, selectedCollectiveSession) : null;

  const editHourSets = useMemo(() => {
    if (!editTarget) return { startSet: new Set<string>(), endSet: new Set<string>() };
    const day = Number(editAsgDay);
    const excludeIds = new Set(
      (selectedCollectiveSession ?? [editTarget]).map((a) => a.id),
    );
    const slotStudents = studentsForAssignment(editTarget, selectedCollectiveSession);
    const occupied: TimeRange[] = [
      ...slotStudents.flatMap((st) => normalizeRanges(st.blockedRanges)),
      ...teacherBlocks.map((b) => ({ day: b.dayOfWeek, start: b.startHour, end: b.endHour })),
      ...assignments
        .filter((a) => !excludeIds.has(a.id))
        .map((a) => ({ day: a.dayOfWeek, start: a.startHour, end: a.endHour })),
    ];
    return getFreeHourSetsForDays(
      [day],
      occupied,
      HOURS_START,
      HOURS_END,
      editAsgStart,
      editDurationMin ?? undefined,
    );
  }, [editTarget, selectedCollectiveSession, editAsgDay, editAsgStart, editDurationMin, teacherBlocks, assignments, students]);

  const blockBlocks: WeekBlock[] = useMemo(
    () => buildTeacherBlockBlocks(teacherBlocks),
    [teacherBlocks],
  );

  const assignmentBlocks: WeekBlock[] = useMemo(
    () => buildAssignmentBlocks({
      assignments,
      subjects,
      subjectStudents,
      subjectColor,
      subjectNames,
    }),
    [assignments, subjectColor, subjectNames, subjects, subjectStudents],
  );

  const blocks: WeekBlock[] = useMemo(
    () => [...blockBlocks, ...assignmentBlocks],
    [blockBlocks, assignmentBlocks],
  );

  const legend = useMemo(
    () => subjects.map((s) => ({ label: s.name, color: subjectColor[s.id] ?? "#2563eb" })),
    [subjects, subjectColor],
  );

  async function autoScheduleSubjects(subjectIds?: number[]) {
    setBusy(true); setAutoResult(null);
    const res = await fetch("/api/auto_schedule", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(subjectIds?.length ? { subjectIds } : {}),
    });
    setBusy(false);
    if (!res.ok) return toast("error", (await res.json().catch(() => ({}))).error || "No se pudo guardar");
    const data: AutoScheduleResult = await res.json();
    setAutoResult(data);
    const skipped = data.skipped?.length ?? 0;
    toast("success", `Auto-agendar: ${data.assigned.length} colocados, ${data.unassigned.length} sin colocar${skipped ? `, ${skipped} omitidas` : ""}`);
    invalidateMany(["/api/assignments", "/api/subject_students"]);
    await load();
  }

  async function deleteAssignment() {
    const target = selectedCollectiveSession?.[0] ?? selectedAssignment;
    if (!target || deleting) return;
    setDeleting(true);
    const res = await fetch(`/api/assignments?id=${target.id}`, { method: "DELETE" });
    setDeleting(false);
    setConfirmDeleteAsg(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      toast("error", d.error || "Error al borrar");
    } else {
      toast("success", selectedCollectiveSession ? "Sesión colectiva borrada" : "Asignación borrada");
    }
    setSelectedAssignment(null);
    setSelectedCollectiveSession(null);
    invalidate("/api/assignments");
    await load();
  }

  async function applyAvailabilityChanges(args: {
    removeIds: number[];
    adds: TimeRange[];
  }): Promise<boolean> {
    setBusy(true);
    try {
      const blocked = teacherBlocks.map((b) => ({
        day: b.dayOfWeek,
        start: b.startHour,
        end: b.endHour,
      }));
      const carved = args.adds.length > 0 ? carveAvailabilityAroundBlocked(args.adds, blocked) : [];
      if (args.adds.length > 0 && carved.length === 0) {
        toast("error", "Esa franja queda cubierta por un evento existente");
        return false;
      }

      const result = await persistAvailabilityAdds({
        removeIds: args.removeIds,
        adds: carved,
      });
      if (!result.ok) {
        toast("error", result.error);
        return false;
      }

      const parts: string[] = [];
      if (result.removed > 0) {
        parts.push(result.removed === 1 ? "1 franja quitada" : `${result.removed} franjas quitadas`);
      }
      if (result.saved > 0) {
        parts.push(result.saved === 1 ? "disponibilidad añadida" : `${result.saved} franjas añadidas`);
      }
      toast(
        "success",
        parts.length === 0
          ? "Cambios guardados"
          : parts.map((p, i) => (i === 0 ? p.charAt(0).toUpperCase() + p.slice(1) : p)).join(" y "),
      );
      invalidate("/api/availabilities");
      await load();
      return true;
    } finally {
      setBusy(false);
    }
  }

  async function applyBlockChanges(args: {
    removeIds: number[];
    create?: { days: number[]; start: number; end: number; title: string };
  }): Promise<boolean> {
    setBusy(true);
    let removed = 0;
    let saved = 0;
    try {
      for (const id of args.removeIds) {
        const res = await fetch(`/api/teacher_blocks?id=${id}`, { method: "DELETE" });
        if (!res.ok) {
          toast("error", "No se pudo quitar");
          return false;
        }
        removed++;
      }

      if (args.create) {
        const { days, start, end, title } = args.create;
        for (const day of days) {
          const dupBlock = teacherBlocks.some(
            (b) => !args.removeIds.includes(b.id) && b.dayOfWeek === day && end > b.startHour && start < b.endHour,
          );
          const dupAsg = assignments.some(
            (a) => a.dayOfWeek === day && end > a.startHour && start < a.endHour,
          );
          if (dupBlock || dupAsg) continue;
          const res = await fetch("/api/teacher_blocks", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title,
              dayOfWeek: day,
              startHour: start,
              endHour: end,
            }),
          });
          if (!res.ok) {
            toast("error", (await res.json().catch(() => ({}))).error || "No se pudo guardar");
            return false;
          }
          saved++;

          const overlapping = availabilities.filter(
            (a) => a.dayOfWeek === day && end > a.startHour && start < a.endHour,
          );
          for (const a of overlapping) {
            const pieces = carveAvailabilityAroundBlocked(
              [{ day, start: a.startHour, end: a.endHour }],
              [{ day, start, end }],
            );
            const replaced = await replaceAvailabilityPieces(a.id, pieces);
            if (!replaced.ok) {
              toast("error", replaced.error);
              return false;
            }
          }
        }
        if (saved === 0) {
          toast("error", "Ese horario ya está ocupado");
          return false;
        }
      }

      const parts: string[] = [];
      if (removed > 0) parts.push(removed === 1 ? "1 evento quitado" : `${removed} eventos quitados`);
      if (saved > 0) parts.push(saved === 1 ? "evento creado" : `${saved} eventos creados`);
      toast(
        "success",
        parts.length === 0
          ? "Cambios guardados"
          : parts.map((p, i) => (i === 0 ? p.charAt(0).toUpperCase() + p.slice(1) : p)).join(" y "),
      );
      invalidate("/api/teacher_blocks");
      invalidate("/api/availabilities");
      await load();
      return true;
    } finally {
      setBusy(false);
    }
  }

  async function removeBlock(id: number): Promise<boolean> {
    const res = await fetch(`/api/teacher_blocks?id=${id}`, { method: "DELETE" });
    if (!res.ok) {
      toast("error", "No se pudo quitar");
      return false;
    }
    toast("success", "Evento quitado");
    invalidate("/api/teacher_blocks");
    await load();
    return true;
  }

  async function confirmDeleteTb() {
    if (!confirmTb || deleting) return;
    setDeleting(true);
    await removeBlock(confirmTb.id);
    setDeleting(false);
    setConfirmTb(null);
  }

  useEffect(() => {
    const target = selectedCollectiveSession?.[0] ?? selectedAssignment;
    if (!target) return;
    setEditAsgDay(String(target.dayOfWeek));
    setEditAsgStart(String(target.startHour));
    setEditAsgEnd(String(target.endHour));
  }, [selectedAssignment, selectedCollectiveSession]);

  useEffect(() => {
    if (!editTarget || editAsgStart === "") return;
    if (editHourSets.endSet.size === 0) return;
    if (editHourSets.endSet.has(editAsgEnd) && Number(editAsgEnd) > Number(editAsgStart)) return;
    if (editDurationMin != null) {
      const full = String(endHourFromDuration(Number(editAsgStart), editDurationMin));
      if (editHourSets.endSet.has(full)) {
        setEditAsgEnd(full);
        return;
      }
    }
    const after = Array.from(editHourSets.endSet)
      .filter((x) => Number(x) > Number(editAsgStart))
      .sort((a, b) => Number(a) - Number(b));
    if (after.length > 0) setEditAsgEnd(after[after.length - 1]);
  }, [editAsgStart, editTarget, editHourSets.endSet, editAsgEnd, editDurationMin]);

  useEffect(() => {
    if (!editTarget || editHourSets.startSet.size === 0) return;
    if (!editHourSets.startSet.has(editAsgStart)) {
      setEditAsgStart(Array.from(editHourSets.startSet)[0]);
    }
  }, [editAsgDay, editTarget, editHourSets.startSet, editAsgStart]);

  async function saveEditAsg() {
    const target = selectedCollectiveSession?.[0] ?? selectedAssignment;
    if (!target || savingEdit) return;
    if (editHourSets.startSet.size === 0) {
      return toast("error", "No hay hueco libre para ese día");
    }
    const day = Number(editAsgDay);
    const start = Number(editAsgStart);
    const end = Number(editAsgEnd);

    const body: Record<string, number> = { id: target.id };
    if (day !== target.dayOfWeek) body.dayOfWeek = day;
    if (start !== target.startHour) body.startHour = start;
    if (end !== target.endHour) body.endHour = end;
    if (Object.keys(body).length === 1) {
      setSelectedAssignment(null);
      setSelectedCollectiveSession(null);
      return;
    }
    setSavingEdit(true);
    const res = await fetch("/api/assignments", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setSavingEdit(false);
    if (!res.ok) return toast("error", (await res.json().catch(() => ({}))).error || "No se pudo guardar");
    toast("success", selectedCollectiveSession ? "Sesión colectiva movida" : "Clase movida");
    setSelectedAssignment(null);
    setSelectedCollectiveSession(null);
    invalidate("/api/assignments");
    await load();
  }

  return (
    <div className="dashboard-stack">
      <PageHeader
        icon={Briefcase}
        title={loading ? <Skeleton className="inline-block h-7 w-40 align-middle" /> : (teacher?.name ?? "—")}
        description="Clases, disponibilidad y eventos."
        actions={
          <>
            <Button variant="outline" onClick={() => setManageOpen(true)}>
              <CalendarClock size={16} />
              <span className="sm:hidden">Horario</span>
              <span className="hidden sm:inline">Gestionar horario</span>
            </Button>
            {!loading && !teacher?.scheduleFixed && (
              <Button
                onClick={() => autoScheduleSubjects()}
                loading={busy}
                disabled={loading}
                title="Auto-agenda todas las asignaturas no fijadas"
              >
                <Sparkles size={16} />
                <span className="sm:hidden">Auto-agendar</span>
                <span className="hidden sm:inline">Auto-agendar todo</span>
              </Button>
            )}
          </>
        }
      />

      <AutoScheduleResultDialog
        result={autoResult}
        onClose={() => setAutoResult(null)}
        subjectColors={subjectColor}
      />

      {loading ? (
        <WeekGridSkeleton />
      ) : (
        <WeekGrid
          blocks={blocks}
          startH={SCHEDULE_DAY_START}
          endH={SCHEDULE_DAY_END}
          expandMobile
          allowFullscreen
          onBlockClick={(b) => {
            if (b.id >= 1000000) {
              const blk = teacherBlocks.find((x) => 1000000 + x.id === b.id);
              if (blk) setConfirmTb(blk);
              return;
            }
            const a = assignments.find((x) => x.id === b.id);
            if (!a) return;
            if (a.collectiveSessionId) {
              const group = assignments.filter((x) => x.collectiveSessionId === a.collectiveSessionId);
              setSelectedCollectiveSession(group);
              setSelectedAssignment(null);
            } else {
              setSelectedAssignment(a);
              setSelectedCollectiveSession(null);
            }
          }}
          showLegend
          legend={legend}
        />
      )}

      <AssignmentEditDialog
        selectedAssignment={selectedAssignment}
        selectedCollectiveSession={selectedCollectiveSession}
        durationMin={editDurationMin}
        editAsgDay={editAsgDay}
        editAsgStart={editAsgStart}
        editAsgEnd={editAsgEnd}
        editHourSets={editHourSets}
        savingEdit={savingEdit}
        onEditAsgDayChange={setEditAsgDay}
        onEditAsgStartChange={setEditAsgStart}
        onEditAsgEndChange={setEditAsgEnd}
        onClose={() => {
          setSelectedAssignment(null);
          setSelectedCollectiveSession(null);
        }}
        onSave={saveEditAsg}
        onRequestDelete={() => setConfirmDeleteAsg(true)}
      />

      <TeacherScheduleManageDialog
        open={manageOpen}
        onOpenChange={setManageOpen}
        availabilities={availabilities}
        teacherBlocks={teacherBlocks}
        assignments={assignments}
        saving={busy}
        onApplyAvailability={applyAvailabilityChanges}
        onApplyBlocks={applyBlockChanges}
      />

      <ConfirmDeleteDialogs
        confirmDeleteAsg={confirmDeleteAsg}
        selectedAssignment={selectedAssignment}
        selectedCollectiveSession={selectedCollectiveSession}
        confirmTb={confirmTb}
        deleting={deleting}
        onConfirmDeleteAsgOpenChange={setConfirmDeleteAsg}
        onConfirmTbOpenChange={(open) => { if (!open) setConfirmTb(null); }}
        onDeleteAssignment={deleteAssignment}
        onDeleteTeacherBlock={confirmDeleteTb}
      />
    </div>
  );
}
