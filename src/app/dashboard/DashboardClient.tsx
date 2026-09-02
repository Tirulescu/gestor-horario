"use client";

import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import {
  CalendarDays, Sparkles, CalendarClock,
} from "lucide-react";
import WeekGrid, { type WeekBlock } from "@/components/WeekGrid";
import AutoScheduleResultDialog, { type AutoScheduleResult } from "@/components/AutoScheduleResultDialog";
import OnboardingChecklist, { countIncompleteSlotRequests } from "@/components/OnboardingChecklist";
import TodayAgenda, { countTodaySessions } from "@/components/TodayAgenda";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/Toast";
import PageHeader from "@/components/PageHeader";
import { WeekGridSkeleton } from "@/components/skeletons";
import { Skeleton } from "@/components/ui/skeleton";
import { buildSubjectColorMap } from "@/lib/subjectColors";
import { SCHEDULE_LOCK_CHANGED_EVENT } from "@/lib/useTeacherProfile";
import { SCHEDULE_DAY_START, SCHEDULE_DAY_END, endHourFromDuration, resolveMemberDurationMin } from "@/lib/hours";
import { carveAvailabilityAroundBlocked, getFreeHourSetsForDays, normalizeRanges, type TimeRange } from "@/lib/studentAvailability";
import { persistAvailabilityAdds, replaceAvailabilityPieces } from "@/lib/availabilityMutations";
import TeacherScheduleManageDialog from "@/components/TeacherScheduleManageDialog";
import {
  DASHBOARD_ENDPOINTS,
  hasFreshAll,
  invalidate,
  invalidateMany,
  needsRefresh,
  put,
  warmData,
} from "@/lib/clientCache";
import { dashboardBootPending } from "@/lib/pageBoot";
import {
  HOURS_START, HOURS_END,
  type Teacher, type Subject, type TeacherBlock, type Availability,
  type Student, type SubjectStudent, type Assignment,
} from "./types";
import { buildTeacherBlockBlocks, buildAssignmentBlocks } from "./buildWeekBlocks";
import AssignmentEditDialog from "./AssignmentEditDialog";
import ConfirmDeleteDialogs from "./ConfirmDeleteDialogs";

interface SlotRequestRow {
  studentId: number;
  subjectId: number;
}

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

function getInitialDashboardState() {
  const empty = {
    teacher: null as Teacher | null,
    subjects: [] as Subject[],
    assignments: [] as Assignment[],
    teacherBlocks: [] as TeacherBlock[],
    availabilities: [] as Availability[],
    students: [] as Student[],
    subjectStudents: [] as SubjectStudent[],
    slotRequests: [] as SlotRequestRow[],
  };
  if (typeof window === "undefined") return empty;
  const cached = readDashboardCache();
  if (!cached) return empty;
  return {
    ...cached,
    students: warmData<Student[]>("/api/students") ?? [],
    subjectStudents: warmData<SubjectStudent[]>("/api/subject_students") ?? [],
    slotRequests: warmData<SlotRequestRow[]>("/api/slot_requests") ?? [],
  };
}

export default function DashboardClient() {
  const toast = useToast();
  const [initial] = useState(getInitialDashboardState);

  const [teacher, setTeacher] = useState(initial.teacher);
  const [subjects, setSubjects] = useState(initial.subjects);
  const [assignments, setAssignments] = useState(initial.assignments);
  const [selectedAssignment, setSelectedAssignment] = useState<Assignment | null>(null);
  const [selectedCollectiveSession, setSelectedCollectiveSession] = useState<Assignment[] | null>(null);
  const [teacherBlocks, setTeacherBlocks] = useState(initial.teacherBlocks);
  const [availabilities, setAvailabilities] = useState(initial.availabilities);
  const [students, setStudents] = useState(initial.students);
  const [subjectStudents, setSubjectStudents] = useState(initial.subjectStudents);
  const [slotRequests, setSlotRequests] = useState(initial.slotRequests);
  const [confirmTb, setConfirmTb] = useState<TeacherBlock | null>(null);
  const [confirmDeleteAsg, setConfirmDeleteAsg] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [autoResult, setAutoResult] = useState<AutoScheduleResult | null>(null);
  const [autoResultMode, setAutoResultMode] = useState<"preview" | "applied">("preview");
  const [pendingAutoSubjectIds, setPendingAutoSubjectIds] = useState<number[] | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [loading, setLoading] = useState(dashboardBootPending);

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
    const sts = warmData<Student[]>("/api/students");
    const ss = warmData<SubjectStudent[]>("/api/subject_students");
    const sr = warmData<SlotRequestRow[]>("/api/slot_requests");
    if (sts) setStudents(sts);
    if (ss) setSubjectStudents(ss);
    if (sr) setSlotRequests(sr);
    return true;
  }

  async function load(opts: { force?: boolean } = {}) {
    const hadCache = hydrateFromCache();
    if (hadCache) setLoading(false);

    if (!opts.force && hasFreshAll(DASHBOARD_ENDPOINTS)) {
      setLoading(false);
      return;
    }

    try {
      const [teachers, subs, asg, tb, av, sts, ss, sr] = await Promise.all([
        fetch("/api/teachers").then((r) => r.json()) as Promise<Teacher[]>,
        fetch("/api/subjects").then((r) => r.json()) as Promise<Subject[]>,
        fetch("/api/assignments").then((r) => r.json()) as Promise<Assignment[]>,
        fetch("/api/teacher_blocks").then((r) => r.json()) as Promise<TeacherBlock[]>,
        fetch("/api/availabilities").then((r) => r.json()) as Promise<Availability[]>,
        fetch("/api/students").then((r) => r.json()) as Promise<Student[]>,
        fetch("/api/subject_students").then((r) => r.json()) as Promise<SubjectStudent[]>,
        fetch("/api/slot_requests").then((r) => r.json()) as Promise<SlotRequestRow[]>,
      ]);
      setTeacher(teachers[0] ?? null);
      setSubjects(subs);
      setAssignments(asg);
      setTeacherBlocks(tb);
      setAvailabilities(av);
      setStudents(sts);
      setSubjectStudents(ss);
      setSlotRequests(sr);
      put("/api/teachers", teachers);
      put("/api/subjects", subs);
      put("/api/assignments", asg);
      put("/api/teacher_blocks", tb);
      put("/api/availabilities", av);
      put("/api/students", sts);
      put("/api/subject_students", ss);
      put("/api/slot_requests", sr);
    } finally {
      setLoading(false);
    }
  }

  useLayoutEffect(() => {
    if (hydrateFromCache()) setLoading(false);
  }, []);

  useEffect(() => { void load(); }, []);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (needsRefresh(DASHBOARD_ENDPOINTS)) void load({ force: true });
    };
    const onLockChange = () => { void load({ force: true }); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener(SCHEDULE_LOCK_CHANGED_EVENT, onLockChange);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener(SCHEDULE_LOCK_CHANGED_EVENT, onLockChange);
    };
  }, []);

  const subjectColor: Record<number, string> = useMemo(
    () => buildSubjectColorMap(subjects),
    [subjects],
  );

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

  const scheduleLocked = Boolean(teacher?.scheduleFixed);

  const incompleteRequests = useMemo(
    () => countIncompleteSlotRequests(subjectStudents, slotRequests),
    [subjectStudents, slotRequests],
  );

  async function runAutoSchedule(subjectIds?: number[], apply = false) {
    setBusy(true);
    const ids = subjectIds ?? pendingAutoSubjectIds;
    if (!apply) setPendingAutoSubjectIds(subjectIds);

    const res = await fetch("/api/auto_schedule", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...(ids?.length ? { subjectIds: ids } : {}),
        ...(!apply ? { simulate: true } : {}),
      }),
    });
    setBusy(false);
    if (!res.ok) return toast("error", (await res.json().catch(() => ({}))).error || "No se pudo auto-agendar");
    const data: AutoScheduleResult = await res.json();
    setAutoResult(data);
    if (!apply) {
      setAutoResultMode("preview");
      return;
    }
    setAutoResultMode("applied");
    setPendingAutoSubjectIds(undefined);
    const skipped = data.skipped?.length ?? 0;
    toast("success", `Horario actualizado: ${data.assigned.length} colocados, ${data.unassigned.length} sin colocar${skipped ? `, ${skipped} omitidas` : ""}`);
    invalidateMany(["/api/assignments", "/api/subject_students"]);
    await load({ force: true });
  }

  async function autoScheduleSubjects(subjectIds?: number[]) {
    await runAutoSchedule(subjectIds, false);
  }

  async function applyPreviewedSchedule() {
    await runAutoSchedule(undefined, true);
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
    await load({ force: true });
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
      await load({ force: true });
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
      await load({ force: true });
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
    await load({ force: true });
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
    await load({ force: true });
  }

  function headerDescription() {
    if (loading) {
      return <Skeleton className="h-4 w-52 max-w-full" aria-hidden />;
    }
    if (!teacher) return "—";
    const todayCount = countTodaySessions(assignments);
    return `${teacher.name} · ${todayCount} clase${todayCount !== 1 ? "s" : ""} hoy`;
  }

  function headerActions() {
    if (scheduleLocked) return undefined;
    return (
      <>
        <Button
          variant="outline"
          onClick={() => setManageOpen(true)}
          disabled={loading}
        >
          <CalendarClock size={16} />
          <span className="sm:hidden">Horario</span>
          <span className="hidden sm:inline">Gestionar horario</span>
        </Button>
        <Button
          onClick={() => autoScheduleSubjects()}
          loading={busy}
          disabled={loading || busy}
          title="Calcula el horario y te deja revisarlo antes de aplicarlo"
        >
          <Sparkles size={16} />
          <span className="sm:hidden">Auto-agendar</span>
          <span className="hidden sm:inline">Auto-agendar todo</span>
        </Button>
      </>
    );
  }

  return (
    <div className="dashboard-stack">
      <PageHeader
        icon={CalendarDays}
        title="Mi horario"
        description={headerDescription()}
        actions={headerActions()}
      />

      {!loading && !scheduleLocked && (
        <OnboardingChecklist
          data={{
            subjectsCount: subjects.length,
            studentsCount: students.length,
            availabilitiesCount: availabilities.length,
            incompleteRequests,
            assignmentsCount: assignments.length,
          }}
          onOpenAvailability={() => setManageOpen(true)}
          onAutoSchedule={() => autoScheduleSubjects()}
        />
      )}

      {!loading && scheduleLocked && (
        <TodayAgenda
          assignments={assignments}
          subjects={subjects}
          students={students.map((s) => ({ id: s.id, name: s.name }))}
        />
      )}

      <AutoScheduleResultDialog
        result={autoResult}
        onClose={() => setAutoResult(null)}
        subjectColors={subjectColor}
        mode={autoResultMode}
        onApply={autoResultMode === "preview" ? applyPreviewedSchedule : undefined}
        applying={busy}
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
          onBlockClick={
            scheduleLocked
              ? undefined
              : (b) => {
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
                }
          }
          showLegend
          legend={legend}
        />
      )}

      {!scheduleLocked && (
        <>
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
        </>
      )}
    </div>
  );
}
