"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowUp, ArrowDown, Trash2, Plus, Save, Inbox, X, BookOpen, Pencil, ChevronRight,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AnimatePresence, Reorder, useDragControls } from "motion/react";
import { DragHandle } from "@/components/DragHandle";
import { useToast } from "@/components/Toast";
import PageHeader from "@/components/PageHeader";
import { ChipGroupSkeleton, MemberCardSkeleton } from "@/components/skeletons";
import { warmData, put, invalidate } from "@/lib/clientCache";
import { DAYS } from "@/lib/validate";
import { fmtHour, fmtRange, hourOptions, endHourFromDuration, fmtDurationMin, resolveMemberDurationMin, fmtSubjectDurationOptions } from "@/lib/hours";
import SubjectDurationBadges from "@/components/SubjectDurationBadges";
import { getSlotHourSets, normalizeRanges, snapSlotHours, validateSlotRequest, type TimeRange } from "@/lib/studentAvailability";
import { COPY } from "@/lib/copy";

interface Subject {
  id: number; name: string; teacherId: number; defaultDurationMin: number; isCollective?: boolean;
  subjectStudents?: { id: number; durationMin: number | null }[];
  subjectGradeDurations?: { id: number; durationMin: number }[];
}
interface SubjectStudent {
  id: number; subjectId: number; studentId: number;
  durationMin: number | null; priority: number; slotsRequired: number;
  student: { id: number; name: string };
}
interface SlotRequest {
  id: number; studentId: number; subjectId: number;
  dayOfWeek: number; startHour: number; endHour: number;
  prefOrder: number; status: string;
}
interface Availability { id: number; dayOfWeek: number; startHour: number; endHour: number; }
interface Student { id: number; name: string; availableRanges?: TimeRange[]; blockedRanges?: TimeRange[]; }

type ConfirmTarget =
  | { kind: "slot"; id: number; label: string }
  | null;

function SlotRow({ r, ri, total, busy, moveSlot, openEdit, setConfirmTarget, m }: {
  r: SlotRequest; ri: number; total: number; busy: boolean;
  moveSlot: (id: number, dir: "up" | "down") => void;
  openEdit: (r: SlotRequest) => void;
  setConfirmTarget: (t: { kind: "slot"; id: number; label: string }) => void;
  m: SubjectStudent;
}) {
  const controls = useDragControls();
  return (
    <Reorder.Item
      value={r}
      layout
      dragListener={false}
      dragControls={controls}
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -8 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
      whileDrag={{ scale: 1.02, boxShadow: "0 8px 24px rgb(0 0 0 / 0.12)", zIndex: 20 }}
      className="flex items-center gap-2 text-sm bg-gray-50 rounded-lg px-2 py-2"
    >
      <DragHandle controls={controls} size={14} />
      <div className="flex items-center gap-0.5 shrink-0">
        <Button size="iconSm" variant="ghost" onClick={() => moveSlot(r.id, "up")} disabled={busy || ri === 0} aria-label="Subir preferencia"><ArrowUp size={12} /></Button>
        <Button size="iconSm" variant="ghost" onClick={() => moveSlot(r.id, "down")} disabled={busy || ri === total - 1} aria-label="Bajar preferencia"><ArrowDown size={12} /></Button>
      </div>
      <span className="min-w-0 flex-1 text-sm leading-snug tabular-nums">
        <span className="font-medium text-gray-900">{DAYS[r.dayOfWeek]}</span>
        {" "}
        <span className="text-gray-600 whitespace-nowrap">{fmtRange(r.startHour, r.endHour)}</span>
      </span>
      <div className="flex items-center gap-1 shrink-0 ml-auto">
        <Button size="iconSm" variant="outline" onClick={() => openEdit(r)} aria-label="Editar solicitud"><Pencil size={12} /></Button>
        <Button size="iconSm" variant="destructive" onClick={() => setConfirmTarget({ kind: "slot", id: r.id, label: `¿Borrar solicitud ${DAYS[r.dayOfWeek]} ${fmtRange(r.startHour, r.endHour)} de ${m.student.name}?` })} aria-label="Borrar"><Trash2 size={12} /></Button>
      </div>
    </Reorder.Item>
  );
}

function MemberCard({ m, mi, total, reqs, busy, moveMember, moveSlot, handleReorder, openAdd, openEdit, setConfirmTarget }: {
  m: SubjectStudent; mi: number; total: number; reqs: SlotRequest[];
  busy: boolean; moveMember: (id: number, dir: "up" | "down") => void;
  moveSlot: (id: number, dir: "up" | "down") => void;
  handleReorder: (next: SlotRequest[], studentId: number, subjectId: number) => void;
  openAdd: (studentId: number) => void; openEdit: (r: SlotRequest) => void;
  setConfirmTarget: (t: { kind: "slot"; id: number; label: string }) => void;
}) {
  const controls = useDragControls();
  const fulfilled = reqs.length >= m.slotsRequired;
  return (
    <Reorder.Item
      value={m}
      layout
      dragListener={false}
      dragControls={controls}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
      whileDrag={{ scale: 1.01, boxShadow: "0 12px 32px rgb(0 0 0 / 0.14)", zIndex: 20 }}
    >
      <Card className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <DragHandle controls={controls} />
            <div className="inline-flex items-center gap-1">
              <Button size="iconSm" variant="ghost" onClick={() => moveMember(m.id, "up")} disabled={busy || mi === 0} aria-label="Subir prioridad"><ArrowUp size={14} /></Button>
              <Button size="iconSm" variant="ghost" onClick={() => moveMember(m.id, "down")} disabled={busy || mi === total - 1} aria-label="Bajar prioridad"><ArrowDown size={14} /></Button>
            </div>
            <span className="font-semibold text-gray-900">{m.student.name}</span>
            <Badge variant={fulfilled ? "success" : "warn"}>
              {COPY.slotsProgress(reqs.length, m.slotsRequired)}
            </Badge>
            {m.durationMin != null && <Badge variant="gray">{m.durationMin} min</Badge>}
          </div>
          <Button size="sm" variant="outline" className="w-full sm:w-auto shrink-0" onClick={() => openAdd(m.studentId)}>
            <Plus size={14} /> <span className="sm:hidden">Añadir</span><span className="hidden sm:inline">Añadir solicitud</span>
          </Button>
        </div>
        <Separator />
        {reqs.length === 0 ? (
          <p className="text-sm text-gray-400">Sin solicitudes de horario</p>
        ) : (
          <Reorder.Group
            axis="y"
            values={reqs}
            onReorder={(next) => handleReorder(next, m.studentId, m.subjectId)}
            layoutScroll
            className="space-y-1.5 reorder-group"
          >
            <AnimatePresence initial={false}>
              {reqs.map((r, ri) => (
                <SlotRow
                  key={r.id}
                  r={r}
                  ri={ri}
                  total={reqs.length}
                  busy={busy}
                  moveSlot={moveSlot}
                  openEdit={openEdit}
                  setConfirmTarget={setConfirmTarget}
                  m={m}
                />
              ))}
            </AnimatePresence>
          </Reorder.Group>
        )}
      </Card>
    </Reorder.Item>
  );
}

function hydrateSubjectData(subjectId: number) {
  const cSS = warmData<SubjectStudent[]>("/api/subject_students");
  const cSR = warmData<SlotRequest[]>("/api/slot_requests");
  const cST = warmData<Student[]>("/api/students");
  const cAV = warmData<Availability[]>("/api/availabilities");
  if (cSS === null || cSR === null || cST === null || cAV === null) return null;
  return {
    members: cSS.filter((x) => x.subjectId === subjectId),
    slotRequests: cSR.filter((x) => x.subjectId === subjectId),
    allStudents: cST,
    availabilities: cAV,
  };
}

export default function RequestsClient() {
  const toast = useToast();

  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [activeSubjectId, setActiveSubjectId] = useState<number | null>(null);
  const [members, setMembers] = useState<SubjectStudent[]>([]);
  const [slotRequests, setSlotRequests] = useState<SlotRequest[]>([]);
  const [availabilities, setAvailabilities] = useState<Availability[]>([]);
  const [allStudents, setAllStudents] = useState<Student[]>([]);
  const [confirmTarget, setConfirmTarget] = useState<ConfirmTarget>(null);
  const [busy, setBusy] = useState(false);
  const [loadingSubject, setLoadingSubject] = useState(false);
  const [loadingSubjects, setLoadingSubjects] = useState(true);

  // Add-solicitud dialog state
  const [addOpen, setAddOpen] = useState(false);
  const [addStudentId, setAddStudentId] = useState<number | null>(null);
  const [addDay, setAddDay] = useState<number>(0);
  const [addStart, setAddStart] = useState("");
  const [addEnd, setAddEnd] = useState("");

  // Edit-solicitud dialog state
  const [editOpen, setEditOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [editDay, setEditDay] = useState<number>(0);
  const [editStart, setEditStart] = useState("");
  const [editName, setEditName] = useState<string | null>(null);
  const [editEnd, setEditEnd] = useState("");

  const HOURS_START = hourOptions(8, 23);
  const HOURS_END = hourOptions(9, 24);

  function studentFor(id: number | null): Student | undefined {
    if (id == null) return undefined;
    return allStudents.find((x) => x.id === id);
  }

  function hourSetsForStudent(day: number, studentId: number | null, selectedStart?: string, durationMin?: number) {
    const st = studentFor(studentId);
    return getSlotHourSets(
      day,
      availabilities,
      normalizeRanges(st?.availableRanges),
      normalizeRanges(st?.blockedRanges),
      HOURS_START,
      HOURS_END,
      selectedStart,
      durationMin,
    );
  }

  const addMember = useMemo(
    () => (addStudentId != null ? members.find((m) => m.studentId === addStudentId) ?? null : null),
    [addStudentId, members],
  );
  const addRequiredDuration = useMemo(() => {
    const sub = subjects.find((s) => s.id === activeSubjectId) ?? null;
    return sub ? resolveMemberDurationMin(sub, addMember) : null;
  }, [subjects, activeSubjectId, addMember]);

  const addHourSets = useMemo(
    () => hourSetsForStudent(Number(addDay), addStudentId, addStart, addRequiredDuration ?? undefined),
    [availabilities, addDay, addStudentId, addStart, addRequiredDuration, allStudents]
  );
  const editStudentId = useMemo(
    () => (editId != null ? slotRequests.find((x) => x.id === editId)?.studentId ?? null : null),
    [editId, slotRequests]
  );
  const editMember = useMemo(
    () => (editStudentId != null ? members.find((m) => m.studentId === editStudentId) ?? null : null),
    [editStudentId, members],
  );
  const editRequiredDuration = useMemo(() => {
    const sub = subjects.find((s) => s.id === activeSubjectId) ?? null;
    return sub ? resolveMemberDurationMin(sub, editMember) : null;
  }, [subjects, activeSubjectId, editMember]);
  const editHourSets = useMemo(
    () => hourSetsForStudent(Number(editDay), editStudentId, editStart, editRequiredDuration ?? undefined),
    [availabilities, editDay, editStudentId, editStart, editRequiredDuration, allStudents]
  );

  function hourItem(o: { value: string; label: string }, allowed: Set<string>) {
    if (!allowed.has(o.value)) return null; // sin disponibilidad: ni aparece
    return (
      <SelectItem key={o.value} value={o.value}>
        {o.label}
      </SelectItem>
    );
  }

  async function loadSubjects() {
    const cached = warmData<Subject[]>("/api/subjects");
    if (cached !== null && cached.length > 0) {
      setSubjects(cached);
      if (activeSubjectId === null) setActiveSubjectId(cached[0].id);
      setLoadingSubjects(false);
    } else {
      setLoadingSubjects(true);
    }
    try {
      const subs = await fetch("/api/subjects").then((r) => r.json()) as Subject[];
      setSubjects(subs);
      put("/api/subjects", subs);
      if (subs.length > 0 && activeSubjectId === null) setActiveSubjectId(subs[0].id);
    } finally {
      setLoadingSubjects(false);
    }
  }

  async function loadSubjectData(subjectId: number, opts: { silent?: boolean } = {}) {
    const { silent = false } = opts;
    const sub = subjects.find((s) => s.id === subjectId);
    const hydrated = hydrateSubjectData(subjectId);
    if (hydrated) {
      setMembers(hydrated.members);
      setSlotRequests(hydrated.slotRequests);
      setAllStudents(hydrated.allStudents);
      setAvailabilities(hydrated.availabilities);
      if (!silent) setLoadingSubject(false);
    } else if (!silent) {
      setLoadingSubject(true);
    }
    try {
      const [ssAll, srAll, st, av] = await Promise.all([
        fetch("/api/subject_students").then((r) => r.json()) as Promise<SubjectStudent[]>,
        fetch("/api/slot_requests").then((r) => r.json()) as Promise<SlotRequest[]>,
        fetch("/api/students").then((r) => r.json()) as Promise<Student[]>,
        sub ? fetch("/api/availabilities").then((r) => r.json()) as Promise<Availability[]> : Promise.resolve([] as Availability[]),
      ]);
      setMembers(ssAll.filter((x) => x.subjectId === subjectId));
      setSlotRequests(srAll.filter((x) => x.subjectId === subjectId));
      setAllStudents(st);
      setAvailabilities(av);
      put("/api/subject_students", ssAll);
      put("/api/slot_requests", srAll);
      put("/api/students", st);
      if (sub) put("/api/availabilities", av);
    } finally {
      if (!silent) setLoadingSubject(false);
    }
  }

  useEffect(() => {
    void loadSubjects();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const requestsByStudent = useMemo(() => {
    const m: Record<number, SlotRequest[]> = {};
    for (const r of slotRequests) {
      (m[r.studentId] ??= []).push(r);
    }
    for (const k of Object.keys(m)) {
      m[Number(k)].sort((a, b) => a.prefOrder - b.prefOrder || a.id - b.id);
    }
    return m;
  }, [slotRequests]);

  const activeSubject = subjects.find((s) => s.id === activeSubjectId) ?? null;

  useEffect(() => {
    if (activeSubjectId !== null) loadSubjectData(activeSubjectId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSubjectId]);

  // Reordenar prioridad del alumno (subject_students) — swap con vecino
  async function moveMember(memberId: number, dir: "up" | "down") {
    setBusy(true);
    const res = await fetch("/api/subject_students", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: memberId, dir }),
    });
    setBusy(false);
    if (!res.ok) return toast("error", (await res.json().catch(() => ({}))).error || "No se pudo guardar");
    invalidate("/api/subject_students");
    if (activeSubjectId !== null) await loadSubjectData(activeSubjectId, { silent: true });
  }

  // Reordenar preferencia de posibilidad (slot_requests) — swap con vecino
  async function moveSlot(slotId: number, dir: "up" | "down") {
    setBusy(true);
    const res = await fetch("/api/slot_requests", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: slotId, dir }),
    });
    setBusy(false);
    if (!res.ok) return toast("error", (await res.json().catch(() => ({}))).error || "No se pudo guardar");
    invalidate("/api/slot_requests");
    if (activeSubjectId !== null) await loadSubjectData(activeSubjectId, { silent: true });
  }

  const pendingSync = useRef<{ id: number; to: number }[]>([]);
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const memberSyncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleMemberReorder(next: SubjectStudent[]) {
    setMembers((cur) =>
      next.map((n) => {
        const base = cur.find((c) => c.id === n.id);
        return base ? { ...base, priority: next.findIndex((x) => x.id === n.id) + 1 } : n;
      })
    );
    if (memberSyncTimer.current) clearTimeout(memberSyncTimer.current);
    memberSyncTimer.current = setTimeout(async () => {
      for (let i = 0; i < next.length; i++) {
        if (next[i].priority !== i + 1) {
          await fetch("/api/subject_students", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: next[i].id, to: i + 1 }),
          });
        }
      }
      invalidate("/api/subject_students");
      if (activeSubjectId !== null) await loadSubjectData(activeSubjectId, { silent: true });
    }, 400);
  }

  function handleReorder(next: SlotRequest[], studentId: number, subjectId: number) {
    const prev = slotRequests
      .filter((x) => x.studentId === studentId && x.subjectId === subjectId)
      .sort((a, b) => a.prefOrder - b.prefOrder || a.id - b.id);
    const moved = prev.find((x, i) => next[i]?.id !== x.id);
    // optimista: renumerar en estado al instante
    setSlotRequests((cur) =>
      cur.map((r) => {
        if (r.studentId !== studentId || r.subjectId !== subjectId) return r;
        const ni = next.findIndex((x) => x.id === r.id);
        return ni >= 0 ? { ...r, prefOrder: ni + 1 } : r;
      })
    );
    if (!moved) return;
    const to = next.findIndex((x) => x.id === moved.id) + 1;
    if (to < 1) return;
    pendingSync.current = pendingSync.current.filter((p) => p.id !== moved.id);
    pendingSync.current.push({ id: moved.id, to });
    if (syncTimer.current) clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(() => {
      const items = [...pendingSync.current];
      pendingSync.current = [];
      void (async () => {
        for (const p of items) {
          await fetch("/api/slot_requests", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: p.id, to: p.to }),
          });
        }
        invalidate("/api/slot_requests");
        if (activeSubjectId !== null) await loadSubjectData(activeSubjectId, { silent: true });
      })();
    }, 400);
  }

  async function deleteSlot() {
    if (!confirmTarget || confirmTarget.kind !== "slot") return;
    const res = await fetch(`/api/slot_requests?id=${confirmTarget.id}`, { method: "DELETE" });
    setConfirmTarget(null);
    if (!res.ok) return toast("error", "No se pudo borrar");
    invalidate("/api/slot_requests"); toast("success", "Solicitud borrada");
    if (activeSubjectId !== null) await loadSubjectData(activeSubjectId);
  }

  function openAdd(studentId: number) {
    setAddStudentId(studentId);
    setAddDay(0);
    setAddStart("");
    setAddEnd("");
    setAddOpen(true);
  }

  useEffect(() => {
    if (!addOpen || addStudentId == null) return;
    const st = studentFor(addStudentId);
    const snapped = snapSlotHours(
      Number(addDay),
      availabilities,
      normalizeRanges(st?.availableRanges),
      normalizeRanges(st?.blockedRanges),
      HOURS_START,
      HOURS_END,
      addStart,
      addEnd,
      addRequiredDuration ?? undefined,
    );
    if (snapped.start !== addStart) setAddStart(snapped.start);
    if (snapped.end !== addEnd) setAddEnd(snapped.end);
  }, [addOpen, addStudentId, addDay, availabilities, allStudents, addRequiredDuration]);

  useEffect(() => {
    if (!editOpen || editStudentId == null) return;
    const st = studentFor(editStudentId);
    const snapped = snapSlotHours(
      Number(editDay),
      availabilities,
      normalizeRanges(st?.availableRanges),
      normalizeRanges(st?.blockedRanges),
      HOURS_START,
      HOURS_END,
      editStart,
      editEnd,
      editRequiredDuration ?? undefined,
    );
    if (snapped.start !== editStart) setEditStart(snapped.start);
    if (snapped.end !== editEnd) setEditEnd(snapped.end);
  }, [editOpen, editStudentId, editDay, availabilities, allStudents, editRequiredDuration]);

  useEffect(() => {
    if (!addOpen || addRequiredDuration == null || addStart === "") return;
    const end = String(endHourFromDuration(Number(addStart), addRequiredDuration));
    if (end !== addEnd) setAddEnd(end);
  }, [addOpen, addStart, addRequiredDuration]);

  useEffect(() => {
    if (!editOpen || editRequiredDuration == null || editStart === "") return;
    const end = String(endHourFromDuration(Number(editStart), editRequiredDuration));
    if (end !== editEnd) setEditEnd(end);
  }, [editOpen, editStart, editRequiredDuration]);

  function changeAddDay(v: string) {
    setAddDay(Number(v));
    const { startSet } = hourSetsForStudent(Number(v), addStudentId, addStart, addRequiredDuration ?? undefined);
    if (!startSet.has(addStart) && startSet.size > 0) {
      const newStart = Array.from(startSet)[0];
      setAddStart(newStart);
      if (addRequiredDuration != null) {
        setAddEnd(String(endHourFromDuration(Number(newStart), addRequiredDuration)));
      }
    }
  }
  function changeEditDay(v: string) {
    setEditDay(Number(v));
    const { startSet } = hourSetsForStudent(Number(v), editStudentId, editStart, editRequiredDuration ?? undefined);
    if (!startSet.has(editStart) && startSet.size > 0) {
      const newStart = Array.from(startSet)[0];
      setEditStart(newStart);
      if (editRequiredDuration != null) {
        setEditEnd(String(endHourFromDuration(Number(newStart), editRequiredDuration)));
      }
    }
  }

  function changeAddStart(v: string) {
    setAddStart(v);
    if (addRequiredDuration != null) {
      setAddEnd(String(endHourFromDuration(Number(v), addRequiredDuration)));
    }
  }

  function changeEditStart(v: string) {
    setEditStart(v);
    if (editRequiredDuration != null) {
      setEditEnd(String(endHourFromDuration(Number(v), editRequiredDuration)));
    }
  }

  function addIssue(): string {
    if (addStart === "" || addEnd === "") return "";
    const st = studentFor(addStudentId);
    return validateSlotRequest({
      day: Number(addDay),
      start: Number(addStart),
      end: Number(addEnd),
      teacherAvails: availabilities,
      studentAvailable: normalizeRanges(st?.availableRanges),
      studentBlocked: normalizeRanges(st?.blockedRanges),
      requiredDurationMin: addRequiredDuration ?? undefined,
    }) ?? "";
  }
  const addErr = addIssue();

  async function submitAdd() {
    if (!addStudentId) return toast("error", "Selecciona un alumno");
    if (addErr) return toast("error", addErr);
    if (!activeSubjectId) return;
    const res = await fetch("/api/slot_requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        studentId: addStudentId,
        subjectId: activeSubjectId,
        dayOfWeek: Number(addDay),
        startHour: Number(addStart),
        endHour: Number(addEnd),
      }),
    });
    if (!res.ok) return toast("error", (await res.json().catch(() => ({}))).error || "No se pudo guardar");
    invalidate("/api/slot_requests"); toast("success", "Solicitud añadida");
    setAddOpen(false);
    await loadSubjectData(activeSubjectId);
  }

  function openEdit(r: SlotRequest) {
    setEditId(r.id);
    setEditDay(r.dayOfWeek);
    setEditStart(String(r.startHour));
    setEditEnd(String(r.endHour));
    setEditOpen(true);
  setEditName(allStudents.find((x) => x.id === r.studentId)?.name ?? `#${r.studentId}`);
  }

  async function saveEdit() {
    if (editId == null) return;
    const row = slotRequests.find((x) => x.id === editId);
    const st = row ? studentFor(row.studentId) : undefined;
    const day = Number(editDay);
    const start = Number(editStart);
    const end = Number(editEnd);
    const err = validateSlotRequest({
      day,
      start,
      end,
      teacherAvails: availabilities,
      studentAvailable: normalizeRanges(st?.availableRanges),
      studentBlocked: normalizeRanges(st?.blockedRanges),
      requiredDurationMin: editRequiredDuration ?? undefined,
    });
    if (err) return toast("error", err);
    const body: Record<string, number> = { id: editId };
    if (row && day !== row.dayOfWeek) body.dayOfWeek = day;
    if (row && start !== row.startHour) body.startHour = start;
    if (row && end !== row.endHour) body.endHour = end;
    if (Object.keys(body).length === 1) {
      setEditOpen(false);
      return;
    }
    const res = await fetch("/api/slot_requests", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) return toast("error", (await res.json().catch(() => ({}))).error || "No se pudo guardar");
    invalidate("/api/slot_requests"); toast("success", "Solicitud actualizada");
    setEditOpen(false);
    if (activeSubjectId !== null) await loadSubjectData(activeSubjectId);
  }

  const sortedMembers = useMemo(
    () => [...members].sort((a, b) => a.priority - b.priority || a.id - b.id),
    [members]
  );

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Inbox}
        title="Solicitudes de horario"
        description={
          activeSubject
            ? `Preferencias de horario en ${activeSubject.name}.`
            : "Elige una asignatura para gestionar las solicitudes de cada alumno."
        }
        actions={
          loadingSubjects ? undefined : subjects.length === 0 ? (
            <Button asChild>
              <Link href="/subjects">
                <Plus size={16} />
                <span className="hidden sm:inline">Nueva asignatura</span>
              </Link>
            </Button>
          ) : activeSubject ? (
            <Button variant="outline" asChild>
              <Link href={`/subjects/${activeSubject.id}`}>
                <BookOpen size={16} />
                <span className="sm:hidden">Asignatura</span>
                <span className="hidden sm:inline">Ver asignatura</span>
                <ChevronRight size={16} className="opacity-60" />
              </Link>
            </Button>
          ) : undefined
        }
      />

      <Card className="p-4 space-y-3">
        <div>
          <Label htmlFor="req-subject">Asignatura</Label>
          {loadingSubjects ? (
            <div className="mt-2">
              <ChipGroupSkeleton />
            </div>
          ) : subjects.length === 0 ? (
            <p className="text-sm text-gray-500 mt-2">Crea una asignatura para empezar a recoger solicitudes.</p>
          ) : (
            <Select
              value={activeSubjectId != null ? String(activeSubjectId) : ""}
              onValueChange={(v) => setActiveSubjectId(Number(v))}
            >
              <SelectTrigger id="req-subject" className="mt-1">
                <SelectValue placeholder="Selecciona una asignatura…" />
              </SelectTrigger>
              <SelectContent>
                {subjects.map((s) => (
                  <SelectItem key={s.id} value={String(s.id)}>
                    {s.name}
                    {s.isCollective ? " · Colectiva" : ""}
                    {` · ${fmtSubjectDurationOptions(s, s.subjectStudents, s.subjectGradeDurations)}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        {activeSubject && (
          <div className="flex flex-wrap items-center gap-2">
            {activeSubject.isCollective ? (
              <Badge variant="success">Colectiva</Badge>
            ) : (
              <Badge variant="gray">Individual</Badge>
            )}
            <SubjectDurationBadges
              subject={activeSubject}
              members={sortedMembers}
              gradeDurations={activeSubject.subjectGradeDurations}
            />
            <Badge variant="default" className="font-normal">
              {sortedMembers.length} {sortedMembers.length === 1 ? "alumno" : "alumnos"}
            </Badge>
          </div>
        )}
      </Card>

      {/* Cards por alumno (arrastrables SOLO desde el grip) */}
      {activeSubject && loadingSubject ? (
        <MemberCardSkeleton count={2} />
      ) : (
      <Reorder.Group axis="y" values={sortedMembers} onReorder={handleMemberReorder} layoutScroll className="space-y-4 reorder-group">
        <AnimatePresence initial={false}>
          {sortedMembers.map((m, mi) => (
            <MemberCard
              key={m.id}
              m={m}
              mi={mi}
              total={sortedMembers.length}
              reqs={requestsByStudent[m.studentId] ?? []}
              busy={busy}
              moveMember={moveMember}
              moveSlot={moveSlot}
              handleReorder={handleReorder}
              openAdd={openAdd}
              openEdit={openEdit}
              setConfirmTarget={setConfirmTarget}
            />
          ))}
        </AnimatePresence>
      </Reorder.Group>
      )}

      {activeSubject && !loadingSubject && sortedMembers.length === 0 && (
        <Card className="p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <p className="text-sm text-gray-500">Sin alumnos inscritos en esta asignatura.</p>
          <Button asChild>
            <Link href={`/subjects/${activeSubject.id}`}>
              <Plus size={16} /> Añadir alumnos
            </Link>
          </Button>
        </Card>
      )}

      {/* Dialog añadir solicitud */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Añadir solicitud de horario</DialogTitle>
            <DialogDescription>
              Alumno: <strong>{members.find((m) => m.studentId === addStudentId)?.student.name ?? "—"}</strong>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            {addRequiredDuration != null && (
              <p className="text-sm text-gray-700 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
                Duración de la clase: <strong>{fmtDurationMin(addRequiredDuration)}</strong>
                {activeSubject?.isCollective ? " (sesión colectiva)" : ""}
              </p>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label htmlFor="a-day">Día</Label>
                <Select value={String(addDay)} onValueChange={changeAddDay}>
                  <SelectTrigger><SelectValue placeholder="Selecciona…" /></SelectTrigger>
                  <SelectContent>
                    {DAYS.map((d, i) => <SelectItem key={i} value={String(i)}>{d}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="a-start">Hora de inicio</Label>
                <Select value={addStart} onValueChange={changeAddStart}>
                  <SelectTrigger><SelectValue placeholder="Selecciona…" /></SelectTrigger>
                  <SelectContent>
                    {HOURS_START.map((o) => hourItem(o, addHourSets.startSet))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {addStart !== "" && addEnd !== "" && (
              <p className="text-sm text-gray-600">
                Franja: <strong>{DAYS[addDay]} {fmtRange(addStart, addEnd)}</strong>
              </p>
            )}
            
            {addHourSets.ranges.length === 0 && (
              <p className="text-sm text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                No hay horas compatibles (profesor + alumno). Revisa la disponibilidad del alumno en Alumnos.
              </p>
            )}
            {addErr && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{addErr}</p>}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}><X size={14} /> Cancelar</Button>
            <Button onClick={submitAdd}><Save size={14} /> Añadir</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Editar solicitud */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar solicitud</DialogTitle>
            <DialogDescription>Cambia el día o la hora. Para cambiar el orden, usa las flechas o arrastra en la lista.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {editRequiredDuration != null && (
              <p className="text-sm text-gray-700 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
                Duración de la clase: <strong>{fmtDurationMin(editRequiredDuration)}</strong>
                {activeSubject?.isCollective ? " (sesión colectiva)" : ""}
              </p>
            )}
            <div className="sm:col-span-3">
              <Label htmlFor="e-alumno">Alumno</Label>
              <Input value={editName ?? ""} readOnly />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label htmlFor="e-day">Día</Label>
                <Select value={String(editDay)} onValueChange={changeEditDay}>
                  <SelectTrigger><SelectValue placeholder="Selecciona…" /></SelectTrigger>
                  <SelectContent>
                    {DAYS.map((d, i) => <SelectItem key={i} value={String(i)}>{d}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="e-start">Hora de inicio</Label>
                <Select value={editStart} onValueChange={changeEditStart}>
                  <SelectTrigger><SelectValue placeholder="Selecciona…" /></SelectTrigger>
                  <SelectContent>
                    {HOURS_START.map((o) => hourItem(o, editHourSets.startSet))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {editStart !== "" && editEnd !== "" && (
              <p className="text-sm text-gray-600">
                Franja: <strong>{DAYS[editDay]} {fmtRange(editStart, editEnd)}</strong>
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}><X size={14} /> Cancelar</Button>
            <Button onClick={saveEdit}><Save size={14} /> Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AlertDialog confirmar borrado */}
      <AlertDialog open={confirmTarget !== null} onOpenChange={(o) => { if (!o) setConfirmTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar borrado</AlertDialogTitle>
            <AlertDialogDescription>{confirmTarget?.label}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={deleteSlot}>Borrar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}