"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Plus, Save, Inbox, X, BookOpen, ChevronRight, ArrowLeft,
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
import { AnimatePresence, Reorder } from "motion/react";
import { useToast } from "@/components/Toast";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import { ChipGroupSkeleton, MemberCardSkeleton } from "@/components/skeletons";
import { warmData, put, invalidate, hasFresh, hasFreshAll, fetchApi, onCacheStale, queuePriorityWrite, clearPriorityWrites, flushPendingPriorityWrites } from "@/lib/clientCache";
import { hasRequestsCache } from "@/lib/pageBoot";
import { SCHEDULE_LOCK_CHANGED_EVENT } from "@/lib/useTeacherProfile";
import { DAYS } from "@/lib/validate";
import { fmtRange, SCHEDULE_HOURS_START, SCHEDULE_HOURS_END, fmtDurationMin, resolveMemberDurationMin, fmtSubjectDurationOptions, slotDurationMin } from "@/lib/hours";
import SubjectDurationBadges from "@/components/SubjectDurationBadges";
import { normalizeRanges, snapSlotHours, validateSlotRequest } from "@/lib/studentAvailability";

import type { Subject, SubjectStudent, SlotRequest, Availability, Student, ConfirmTarget } from "./types";
import { hourSetsForStudent as computeHourSets, pickEndForStart, resolveStartForDay, endOptions } from "./slotHourHelpers";
import { MemberCard } from "./MemberCard";

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

function getRequestsBoot() {
  const empty = {
    subjects: [] as Subject[],
    activeSubjectId: null as number | null,
    members: [] as SubjectStudent[],
    slotRequests: [] as SlotRequest[],
    allStudents: [] as Student[],
    availabilities: [] as Availability[],
    scheduleLocked: false,
    subjectDataReady: false,
  };
  if (typeof window === "undefined") return empty;
  const subs = warmData<Subject[]>("/api/subjects") ?? [];
  const teachers = warmData<{ scheduleFixed?: boolean }[]>("/api/teachers");
  const activeSubjectId = subs.length > 0 ? subs[0].id : null;
  const hydrated = activeSubjectId !== null ? hydrateSubjectData(activeSubjectId) : null;
  return {
    subjects: subs,
    activeSubjectId,
    members: hydrated?.members ?? [],
    slotRequests: hydrated?.slotRequests ?? [],
    allStudents: hydrated?.allStudents ?? [],
    availabilities: hydrated?.availabilities ?? [],
    scheduleLocked: Boolean(teachers?.[0]?.scheduleFixed),
    subjectDataReady: hydrated !== null,
  };
}

export default function RequestsClient() {
  const toast = useToast();
  const [boot] = useState(getRequestsBoot);

  const [subjects, setSubjects] = useState(boot.subjects);
  const [activeSubjectId, setActiveSubjectId] = useState<number | null>(boot.activeSubjectId);
  const [members, setMembers] = useState(boot.members);
  const [slotRequests, setSlotRequests] = useState(boot.slotRequests);
  const [availabilities, setAvailabilities] = useState(boot.availabilities);
  const [allStudents, setAllStudents] = useState(boot.allStudents);
  const [confirmTarget, setConfirmTarget] = useState<ConfirmTarget>(null);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [loadingSubject, setLoadingSubject] = useState(() => !boot.subjectDataReady && boot.activeSubjectId !== null);
  const [loadingSubjects, setLoadingSubjects] = useState(() => !hasRequestsCache() && boot.subjects.length === 0);
  const [scheduleLocked, setScheduleLocked] = useState(boot.scheduleLocked);

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

  const HOURS_START = SCHEDULE_HOURS_START;
  const HOURS_END = SCHEDULE_HOURS_END;

  function studentFor(id: number | null): Student | undefined {
    if (id == null) return undefined;
    return allStudents.find((x) => x.id === id);
  }

  function hourSetsForStudent(day: number, studentId: number | null, selectedStart?: string, durationMin?: number) {
    return computeHourSets(
      day,
      studentFor(studentId),
      availabilities,
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

  async function loadSubjects(opts: { force?: boolean } = {}) {
    const cached = warmData<Subject[]>("/api/subjects");
    const cachedTeachers = warmData<{ scheduleFixed?: boolean }[]>("/api/teachers");
    if (cachedTeachers) setScheduleLocked(Boolean(cachedTeachers[0]?.scheduleFixed));
    if (cached !== null) {
      setSubjects(cached);
      if (activeSubjectId === null && cached.length > 0) setActiveSubjectId(cached[0].id);
      setLoadingSubjects(false);
    } else {
      setLoadingSubjects(true);
    }

    if (!opts.force && hasFresh("/api/subjects") && hasFresh("/api/teachers")) {
      setLoadingSubjects(false);
      return;
    }

    try {
      const [subs, teachers] = await Promise.all([
        fetchApi<Subject[]>("/api/subjects"),
        fetchApi<{ scheduleFixed?: boolean }[]>("/api/teachers"),
      ]);
      if (subs) {
        setSubjects(subs);
        put("/api/subjects", subs);
        if (subs.length > 0 && activeSubjectId === null) setActiveSubjectId(subs[0].id);
      }
      if (teachers) {
        setScheduleLocked(Boolean(teachers[0]?.scheduleFixed));
        put("/api/teachers", teachers);
      }
    } finally {
      setLoadingSubjects(false);
    }
  }

  async function loadSubjectData(
    subjectId: number,
    opts: { silent?: boolean; force?: boolean } = {},
  ) {
    const { silent = false, force = false } = opts;
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

    const subjectKeys = [
      "/api/subject_students",
      "/api/slot_requests",
      "/api/students",
      ...(sub ? ["/api/availabilities"] : []),
    ] as const;

    if (!force && hydrated && hasFreshAll(subjectKeys)) {
      if (!silent) setLoadingSubject(false);
      return;
    }

    try {
      const [ssAll, srAll, st, av] = await Promise.all([
        fetchApi<SubjectStudent[]>("/api/subject_students"),
        fetchApi<SlotRequest[]>("/api/slot_requests"),
        fetchApi<Student[]>("/api/students"),
        sub ? fetchApi<Availability[]>("/api/availabilities") : Promise.resolve(null),
      ]);
      if (ssAll) {
        setMembers(ssAll.filter((x) => x.subjectId === subjectId));
        put("/api/subject_students", ssAll);
      }
      if (srAll) {
        setSlotRequests(srAll.filter((x) => x.subjectId === subjectId));
        put("/api/slot_requests", srAll);
      }
      if (st) {
        setAllStudents(st);
        put("/api/students", st);
      }
      if (av) {
        setAvailabilities(av);
        put("/api/availabilities", av);
      }
    } finally {
      if (!silent) setLoadingSubject(false);
    }
  }

  useLayoutEffect(() => {
    const cached = warmData<Subject[]>("/api/subjects");
    if (cached !== null) {
      setSubjects(cached);
      setLoadingSubjects(false);
    }
    const cachedTeachers = warmData<{ scheduleFixed?: boolean }[]>("/api/teachers");
    if (cachedTeachers) setScheduleLocked(Boolean(cachedTeachers[0]?.scheduleFixed));
    if (boot.subjectDataReady) setLoadingSubject(false);
  }, [boot.subjectDataReady]);

  useEffect(() => {
    void loadSubjects();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onLock = () => { void loadSubjects({ force: true }); };
    const offStale = onCacheStale(() => {
      void loadSubjects({ force: true });
      if (activeSubjectId !== null) void loadSubjectData(activeSubjectId, { force: true, silent: true });
    });
    window.addEventListener(SCHEDULE_LOCK_CHANGED_EVENT, onLock);
    return () => {
      window.removeEventListener(SCHEDULE_LOCK_CHANGED_EVENT, onLock);
      offStale();
    };
  }, [activeSubjectId]);

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
    if (activeSubjectId !== null) void loadSubjectData(activeSubjectId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSubjectId]);

  // Reordenar prioridad del alumno (subject_students) — swap con vecino
  async function moveMember(memberId: number, dir: "up" | "down") {
    // Optimista: swap local + cache
    const sorted = [...members].sort((a, b) => a.priority - b.priority || a.id - b.id);
    const idx = sorted.findIndex((m) => m.id === memberId);
    const swapIdx = dir === "up" ? idx - 1 : idx + 1;
    if (idx < 0 || swapIdx < 0 || swapIdx >= sorted.length) return;
    const priA = sorted[idx].priority;
    const priB = sorted[swapIdx].priority;
    const idA = sorted[idx].id;
    const idB = sorted[swapIdx].id;
    setMembers((cur) => cur.map((c) => {
      if (c.id === idA) return { ...c, priority: priB };
      if (c.id === idB) return { ...c, priority: priA };
      return c;
    }));
    const cached = warmData<SubjectStudent[]>("/api/subject_students");
    if (cached) {
      put("/api/subject_students", cached.map((c) => {
        if (c.id === idA) return { ...c, priority: priB };
        if (c.id === idB) return { ...c, priority: priA };
        return c;
      }));
    }
    setBusy(true);
    const res = await fetch("/api/subject_students", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: memberId, dir }),
    });
    setBusy(false);
    if (!res.ok) {
      toast("error", (await res.json().catch(() => ({}))).error || "No se pudo guardar");
    }
    // Refetch sin invalidate: no borra cache optimista
    const ssAll = await fetchApi<SubjectStudent[]>("/api/subject_students");
    if (ssAll) {
      setMembers(ssAll.filter((x) => x.subjectId === (activeSubjectId ?? 0)));
      put("/api/subject_students", ssAll);
    }
  }

  // Reordenar preferencia de posibilidad (slot_requests) — swap con vecino
  async function moveSlot(slotId: number, dir: "up" | "down") {
    // Optimista: swap local + cache
    const slot = slotRequests.find((r) => r.id === slotId);
    if (!slot) return;
    const group = slotRequests
      .filter((r) => r.studentId === slot.studentId && r.subjectId === slot.subjectId)
      .sort((a, b) => a.prefOrder - b.prefOrder || a.id - b.id);
    const idx = group.findIndex((r) => r.id === slotId);
    const swapIdx = dir === "up" ? idx - 1 : idx + 1;
    if (idx < 0 || swapIdx < 0 || swapIdx >= group.length) return;
    const orderA = group[idx].prefOrder;
    const orderB = group[swapIdx].prefOrder;
    const idA = group[idx].id;
    const idB = group[swapIdx].id;
    setSlotRequests((cur) => cur.map((r) => {
      if (r.id === idA) return { ...r, prefOrder: orderB };
      if (r.id === idB) return { ...r, prefOrder: orderA };
      return r;
    }));
    const cached = warmData<SlotRequest[]>("/api/slot_requests");
    if (cached) {
      put("/api/slot_requests", cached.map((c) => {
        if (c.id === idA) return { ...c, prefOrder: orderB };
        if (c.id === idB) return { ...c, prefOrder: orderA };
        return c;
      }));
    }
    setBusy(true);
    const res = await fetch("/api/slot_requests", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: slotId, dir }),
    });
    setBusy(false);
    if (!res.ok) {
      toast("error", (await res.json().catch(() => ({}))).error || "No se pudo guardar");
    }
    // Refetch sin invalidate
    const srAll = await fetchApi<SlotRequest[]>("/api/slot_requests");
    if (srAll) {
      setSlotRequests(srAll.filter((x) => x.subjectId === (activeSubjectId ?? 0)));
      put("/api/slot_requests", srAll);
    }
  }

  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncing = useRef(false);

  const memberSyncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleMemberReorder(next: SubjectStudent[]) {
    const updated = next.map((n, i) => {
      const base = members.find((c) => c.id === n.id);
      return base ? { ...base, priority: i + 1 } : { ...n, priority: i + 1 };
    });
    setMembers(updated);
    // Persistir en cache para navegación inmediata
    const cached = warmData<SubjectStudent[]>("/api/subject_students");
    if (cached) {
      const prioMap = new Map(updated.map((u) => [u.id, u.priority]));
      put("/api/subject_students", cached.map((c) => {
        const newPri = prioMap.get(c.id);
        return newPri != null ? { ...c, priority: newPri } : c;
      }));
    }
    for (let i = 0; i < next.length; i++) {
      if (next[i].priority !== i + 1) {
        queuePriorityWrite("/api/subject_students", next[i].id, i + 1);
      }
    }
    if (memberSyncTimer.current) clearTimeout(memberSyncTimer.current);
    memberSyncTimer.current = setTimeout(async () => {
      syncing.current = true;
      try {
        await flushPendingPriorityWrites();
      } finally {
        syncing.current = false;
      }
      const ssAll = await fetchApi<SubjectStudent[]>("/api/subject_students");
      if (ssAll) {
        setMembers(ssAll.filter((x) => x.subjectId === (activeSubjectId ?? 0)));
        put("/api/subject_students", ssAll);
      }
    }, 400);
  }

  function handleReorder(next: SlotRequest[], studentId: number, subjectId: number) {
    const prev = slotRequests
      .filter((x) => x.studentId === studentId && x.subjectId === subjectId)
      .sort((a, b) => a.prefOrder - b.prefOrder || a.id - b.id);
    const moved = prev.find((x, i) => next[i]?.id !== x.id);
    // optimista: renumerar en estado + cache al instante
    const orderMap = new Map(next.map((x, i) => [x.id, i + 1]));
    setSlotRequests((cur) =>
      cur.map((r) => {
        if (r.studentId !== studentId || r.subjectId !== subjectId) return r;
        const ni = orderMap.get(r.id);
        return ni != null ? { ...r, prefOrder: ni } : r;
      })
    );
    // Persistir en cache para navegación inmediata
    const cached = warmData<SlotRequest[]>("/api/slot_requests");
    if (cached) {
      put("/api/slot_requests", cached.map((c) => {
        const newOrder = orderMap.get(c.id);
        return newOrder != null ? { ...c, prefOrder: newOrder } : c;
      }));
    }
    if (!moved) return;
    const to = next.findIndex((x) => x.id === moved.id) + 1;
    if (to < 1) return;
    queuePriorityWrite("/api/slot_requests", moved.id, to);
    if (syncTimer.current) clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(() => {
      void (async () => {
        syncing.current = true;
        try {
          await flushPendingPriorityWrites();
        } finally {
          syncing.current = false;
        }
        const srAll = await fetchApi<SlotRequest[]>("/api/slot_requests");
        if (srAll) {
          setSlotRequests(srAll.filter((x) => x.subjectId === (activeSubjectId ?? 0)));
          put("/api/slot_requests", srAll);
        }
      })();
    }, 400);
  }

  async function deleteSlot() {
    if (!confirmTarget || confirmTarget.kind !== "slot" || deleting) return;
    setDeleting(true);
    const res = await fetch(`/api/slot_requests?id=${confirmTarget.id}`, { method: "DELETE" });
    setDeleting(false);
    setConfirmTarget(null);
    if (!res.ok) return toast("error", "No se pudo borrar");
    invalidate("/api/slot_requests"); toast("success", "Preferencia borrada");
    if (activeSubjectId !== null) await loadSubjectData(activeSubjectId, { force: true });
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

  function pickEnd(day: number, studentId: number | null, start: string, preferredEnd: string, maxDuration: number | null): string {
    const { endSet } = hourSetsForStudent(day, studentId, start, maxDuration ?? undefined);
    return pickEndForStart(endSet, start, preferredEnd, maxDuration);
  }

  function changeAddDay(v: string) {
    const day = Number(v);
    setAddDay(day);
    const { startSet } = hourSetsForStudent(day, addStudentId, addStart, addRequiredDuration ?? undefined);
    const newStart = resolveStartForDay(startSet, addStart);
    if (newStart !== addStart) setAddStart(newStart);
    if (newStart) setAddEnd(pickEnd(day, addStudentId, newStart, addEnd, addRequiredDuration));
  }
  function changeEditDay(v: string) {
    const day = Number(v);
    setEditDay(day);
    const { startSet } = hourSetsForStudent(day, editStudentId, editStart, editRequiredDuration ?? undefined);
    const newStart = resolveStartForDay(startSet, editStart);
    if (newStart !== editStart) setEditStart(newStart);
    if (newStart) setEditEnd(pickEnd(day, editStudentId, newStart, editEnd, editRequiredDuration));
  }

  function changeAddStart(v: string) {
    setAddStart(v);
    setAddEnd(pickEnd(Number(addDay), addStudentId, v, addEnd, addRequiredDuration));
  }

  function changeEditStart(v: string) {
    setEditStart(v);
    setEditEnd(pickEnd(Number(editDay), editStudentId, v, editEnd, editRequiredDuration));
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
    if (saving) return;
    if (!addStudentId) return toast("error", "Selecciona un alumno");
    if (addErr) return toast("error", addErr);
    if (!activeSubjectId) return;
    setSaving(true);
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
    setSaving(false);
    if (!res.ok) return toast("error", (await res.json().catch(() => ({}))).error || "No se pudo guardar");
    invalidate("/api/slot_requests"); toast("success", "Preferencia añadida");
    setAddOpen(false);
    await loadSubjectData(activeSubjectId, { force: true });
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
    if (editId == null || saving) return;
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
    setSaving(true);
    const res = await fetch("/api/slot_requests", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setSaving(false);
    if (!res.ok) return toast("error", (await res.json().catch(() => ({}))).error || "No se pudo guardar");
    invalidate("/api/slot_requests"); toast("success", "Preferencia actualizada");
    setEditOpen(false);
    if (activeSubjectId !== null) await loadSubjectData(activeSubjectId, { force: true });
  }

  const sortedMembers = useMemo(
    () => [...members].sort((a, b) => a.priority - b.priority || a.id - b.id),
    [members]
  );

  return (
    <div className="page-stack">
      <div>
        <Button asChild variant="outline">
          <Link href="/subjects"><ArrowLeft size={16} /> Asignaturas</Link>
        </Button>
      </div>
      <PageHeader
        icon={Inbox}
        title="Preferencia horaria"
        description={
          activeSubject
            ? `Preferencias de horario en ${activeSubject.name}.`
            : "Preferencias de horario y prioridades por asignatura."
        }
        actions={
          loadingSubjects ? undefined : subjects.length === 0 ? (
            <Button asChild>
              <Link href="/subjects">
                <Plus size={16} />
                <span className="hidden sm:inline">Nueva asignatura</span>
              </Link>
            </Button>
          ) : undefined
        }
      />

      <Card className="p-4 space-y-3">
        <div>
          <Label id="req-subject-label">Asignatura</Label>
          {loadingSubjects ? (
            <div className="mt-2">
              <ChipGroupSkeleton />
            </div>
          ) : subjects.length === 0 ? (
            <EmptyState
              icon={BookOpen}
              title="Sin asignaturas"
              description="Crea una asignatura antes de gestionar preferencias."
              actionLabel="Crear asignatura"
              actionHref="/subjects"
            />
          ) : (
            <div
              className="subject-chips-scroll mt-2"
              role="tablist"
              aria-labelledby="req-subject-label"
            >
              {subjects.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  role="tab"
                  aria-selected={activeSubjectId === s.id}
                  className={`chip shrink-0 ${activeSubjectId === s.id ? "chip-active" : ""}`}
                  onClick={() => setActiveSubjectId(s.id)}
                >
                  {s.name}
                  {s.isCollective ? " · Colectiva" : ""}
                </button>
              ))}
            </div>
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
      ) : scheduleLocked ? (
        <div className="space-y-4">
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
              readOnly
            />
          ))}
        </div>
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
        <EmptyState
          icon={Inbox}
          title="Sin alumnos inscritos"
          description={`Añade alumnos a ${activeSubject.name} para gestionar sus preferencias.`}
          actionLabel={scheduleLocked ? undefined : "Añadir alumnos"}
          actionHref={scheduleLocked ? undefined : `/subjects/${activeSubject.id}`}
        />
      )}

      {/* Dialog añadir solicitud */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Añadir preferencia horaria</DialogTitle>
            <DialogDescription>
              Alumno: <strong>{members.find((m) => m.studentId === addStudentId)?.student.name ?? "—"}</strong>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            {addRequiredDuration != null && (
              <p className="text-sm text-gray-700 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
                Total a cubrir: <strong>{fmtDurationMin(addRequiredDuration)}</strong>
                {activeSubject?.isCollective ? " (sesión colectiva)" : ""}.
                {" "}Puedes dividirla (p. ej. 2×30 min) con varias preferencias.
              </p>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
              <div>
                <Label htmlFor="a-end">Hora de fin</Label>
                <Select value={addEnd} onValueChange={setAddEnd} disabled={addHourSets.endSet.size === 0}>
                  <SelectTrigger><SelectValue placeholder="Selecciona…" /></SelectTrigger>
                  <SelectContent>
                    {endOptions(addHourSets.endSet).map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {addStart !== "" && addEnd !== "" && (
              <p className="text-sm text-gray-600">
                Franja: <strong>{DAYS[addDay]} {fmtRange(addStart, addEnd)}</strong>
                {" · "}
                <strong>{fmtDurationMin(slotDurationMin(Number(addStart), Number(addEnd)))}</strong>
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
            <Button variant="outline" onClick={() => setAddOpen(false)} disabled={saving}><X size={14} /> Cancelar</Button>
            <Button onClick={submitAdd} loading={saving}><Save size={14} /> Añadir</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Editar solicitud */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar preferencia</DialogTitle>
            <DialogDescription>Cambia día u hora.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {editRequiredDuration != null && (
              <p className="text-sm text-gray-700 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
                Total a cubrir: <strong>{fmtDurationMin(editRequiredDuration)}</strong>
                {activeSubject?.isCollective ? " (sesión colectiva)" : ""}.
                {" "}Puedes usar una franja más corta y completar con otra preferencia.
              </p>
            )}
            <div className="sm:col-span-3">
              <Label htmlFor="e-alumno">Alumno</Label>
              <Input value={editName ?? ""} readOnly />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
              <div>
                <Label htmlFor="e-end">Hora de fin</Label>
                <Select value={editEnd} onValueChange={setEditEnd} disabled={editHourSets.endSet.size === 0}>
                  <SelectTrigger><SelectValue placeholder="Selecciona…" /></SelectTrigger>
                  <SelectContent>
                    {endOptions(editHourSets.endSet).map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {editStart !== "" && editEnd !== "" && (
              <p className="text-sm text-gray-600">
                Franja: <strong>{DAYS[editDay]} {fmtRange(editStart, editEnd)}</strong>
                {" · "}
                <strong>{fmtDurationMin(slotDurationMin(Number(editStart), Number(editEnd)))}</strong>
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)} disabled={saving}><X size={14} /> Cancelar</Button>
            <Button onClick={saveEdit} loading={saving}><Save size={14} /> Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AlertDialog confirmar borrado */}
      <AlertDialog open={confirmTarget !== null} onOpenChange={(o) => { if (!o && !deleting) setConfirmTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar borrado</AlertDialogTitle>
            <AlertDialogDescription>{confirmTarget?.label}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              loading={deleting}
              onClick={(e) => {
                e.preventDefault();
                void deleteSlot();
              }}
            >
              Borrar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
