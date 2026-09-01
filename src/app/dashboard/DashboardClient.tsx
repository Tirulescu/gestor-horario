"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Briefcase, Trash2, Plus, Save, X, Sparkles, Play, CalendarPlus,
} from "lucide-react";
import WeekGrid, { type WeekBlock } from "@/components/WeekGrid";
import AutoScheduleResultDialog, { type AutoScheduleResult } from "@/components/AutoScheduleResultDialog";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import { useToast } from "@/components/Toast";
import PageHeader from "@/components/PageHeader";
import { WeekGridSkeleton } from "@/components/skeletons";
import { Skeleton } from "@/components/ui/skeleton";
import { DAYS } from "@/lib/validate";
import { fmtHour, fmtRange, hourOptions, endHourFromDuration, fmtDurationMin, SCHEDULE_DAY_START, SCHEDULE_DAY_END } from "@/lib/hours";
import { invalidate, invalidateMany, put, warmData } from "@/lib/clientCache";

const COLORS = ["#2563eb", "#1d4ed8", "#0891b2", "#4f46e5", "#0284c7", "#7c3aed", "#0e7490", "#4338ca"];

interface Teacher { id: number; name: string; email?: string | null; scheduleFixed?: boolean; }
interface Subject {
  id: number; name: string; teacherId: number; defaultDurationMin: number;
  isCollective?: boolean; scheduleFixed?: boolean;
}
interface TeacherBlock { id: number; teacherId: number; title: string; dayOfWeek: number; startHour: number; endHour: number; }
interface Assignment {
  id: number; teacherId: number; subjectId: number; studentId: number;
  dayOfWeek: number; startHour: number; endHour: number; origin: string;
  collectiveSessionId?: string | null;
  student: { id: number; name: string };
  subject: { id: number; name: string; isCollective?: boolean };
}

export default function DashboardClient() {
  const toast = useToast();

  const [teacher, setTeacher] = useState<Teacher | null>(null);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [selectedAssignment, setSelectedAssignment] = useState<Assignment | null>(null);
  const [selectedCollectiveSession, setSelectedCollectiveSession] = useState<Assignment[] | null>(null);
  const [teacherBlocks, setTeacherBlocks] = useState<TeacherBlock[]>([]);
  const [tbOpen, setTbOpen] = useState(false);
  const [tbTitle, setTbTitle] = useState("");
  const [tbDay, setTbDay] = useState("0");
  const [tbStart, setTbStart] = useState("");
  const [tbEnd, setTbEnd] = useState("");
  const [confirmTb, setConfirmTb] = useState<TeacherBlock | null>(null);
  const [autoResult, setAutoResult] = useState<AutoScheduleResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const [avOpen, setAvOpen] = useState(false);
  const [aDay, setADay] = useState("0");
  const [aStart, setAStart] = useState("");
  const [aEnd, setAEnd] = useState("");

  const [editAsgDay, setEditAsgDay] = useState("0");
  const [editAsgStart, setEditAsgStart] = useState("");
  const [editAsgEnd, setEditAsgEnd] = useState("");

  const HOURS_START = hourOptions(8, 23);
  const HOURS_END = hourOptions(9, 24);

  function applyDashboardData(
    t: Teacher | null,
    subs: Subject[],
    asg: Assignment[],
    tb: TeacherBlock[],
  ) {
    setTeacher(t);
    setSubjects(subs);
    setAssignments(asg);
    setTeacherBlocks(tb);
  }

  function hydrateFromCache(): boolean {
    const teachers = warmData<Teacher[]>("/api/teachers");
    const subs = warmData<Subject[]>("/api/subjects");
    const asg = warmData<Assignment[]>("/api/assignments");
    const tb = warmData<TeacherBlock[]>("/api/teacher_blocks");
    if (!teachers || !subs || !asg || !tb) return false;
    applyDashboardData(teachers[0] ?? null, subs, asg, tb);
    return true;
  }

  async function load() {
    const hadCache = hydrateFromCache();
    if (hadCache) setLoading(false);
    try {
      const [teachers, subs, asg, tb] = await Promise.all([
        fetch("/api/teachers").then((r) => r.json()) as Promise<Teacher[]>,
        fetch("/api/subjects").then((r) => r.json()) as Promise<Subject[]>,
        fetch("/api/assignments").then((r) => r.json()) as Promise<Assignment[]>,
        fetch("/api/teacher_blocks").then((r) => r.json()) as Promise<TeacherBlock[]>,
      ]);
      applyDashboardData(teachers[0] ?? null, subs, asg, tb);
      put("/api/teachers", teachers);
      put("/api/subjects", subs);
      put("/api/assignments", asg);
      put("/api/teacher_blocks", tb);
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

  const blockBlocks: WeekBlock[] = teacherBlocks.map((b) => ({
    id: 1000000 + b.id,
    dayOfWeek: b.dayOfWeek,
    startHour: b.startHour,
    endHour: b.endHour,
    title: b.title,
    subtitle: "bloqueado",
    color: "#475569",
  }));

  const assignmentBlocks: WeekBlock[] = useMemo(() => {
    const collectiveGroups = new Map<string, Assignment[]>();
    const individual: Assignment[] = [];

    for (const a of assignments) {
      if (a.collectiveSessionId) {
        const g = collectiveGroups.get(a.collectiveSessionId) ?? [];
        g.push(a);
        collectiveGroups.set(a.collectiveSessionId, g);
      } else {
        individual.push(a);
      }
    }

    const blocks: WeekBlock[] = individual.map((a) => ({
      id: a.id,
      dayOfWeek: a.dayOfWeek,
      startHour: a.startHour,
      endHour: a.endHour,
      title: `${a.subject?.name ?? subjectNames[a.subjectId] ?? "Asignatura"} — ${a.student?.name ?? `#${a.studentId}`}`,
      subtitle: undefined,
      color: subjectColor[a.subjectId] ?? "#2563eb",
    }));

    for (const [, group] of collectiveGroups) {
      const first = group[0];
      const names = group.map((a) => a.student?.name ?? `#${a.studentId}`).join(", ");
      blocks.push({
        id: first.id,
        dayOfWeek: first.dayOfWeek,
        startHour: first.startHour,
        endHour: first.endHour,
        title: `${first.subject?.name ?? subjectNames[first.subjectId] ?? "Asignatura"} (colectiva)`,
        subtitle: `${group.length} alumno(s): ${names}`,
        color: subjectColor[first.subjectId] ?? "#2563eb",
      });
    }

    return blocks;
  }, [assignments, subjectColor, subjectNames]);

  const blocks: WeekBlock[] = [...blockBlocks, ...assignmentBlocks];
  const legend = subjects.map((s) => ({ label: s.name, color: subjectColor[s.id] ?? "#2563eb" }));

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
    if (!target) return;
    const res = await fetch(`/api/assignments?id=${target.id}`, { method: "DELETE" });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      toast("error", d.error || "Error al borrar");
    } else {
      toast("success", selectedCollectiveSession ? "Sesión colectiva borrada" : "Asignación borrada");
    }
    setSelectedAssignment(null);
    setSelectedCollectiveSession(null);
    await load();
  }

  async function submitAv(): Promise<boolean> {
    if (aStart === "" || aEnd === "") return false;
    if (!(Number(aEnd) > Number(aStart))) {
      toast("error", "La hora de fin debe ser posterior a la de inicio");
      return false;
    }
    const res = await fetch("/api/availabilities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dayOfWeek: Number(aDay), startHour: Number(aStart), endHour: Number(aEnd) }),
    });
    if (!res.ok) {
      toast("error", (await res.json().catch(() => ({}))).error || "No se pudo guardar");
      return false;
    }
    toast("success", "Disponibilidad añadida");
    setAvOpen(false);
    setAStart(""); setAEnd("");
    invalidate("/api/availabilities");
    await load();
    return true;
  }

  async function handleAvOpenChange(o: boolean) {
    if (!o) {
      if (aStart !== "" && aEnd !== "") await submitAv();
      else setAvOpen(false);
      return;
    }
    setAvOpen(true);
  }

  async function submitTb() {
    if (tbStart === "" || tbEnd === "") return toast("error", "Rellena las horas");
    if (!(Number(tbEnd) > Number(tbStart))) return toast("error", "La hora de fin debe ser posterior");
    const res = await fetch("/api/teacher_blocks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: tbTitle.trim() || "Bloqueado", dayOfWeek: Number(tbDay), startHour: Number(tbStart), endHour: Number(tbEnd) }),
    });
    if (!res.ok) return toast("error", (await res.json().catch(() => ({}))).error || "No se pudo guardar");
    toast("success", "Reserva agregada");
    setTbOpen(false);
    await load();
  }

  async function confirmDeleteTb() {
    if (!confirmTb) return;
    const res = await fetch(`/api/teacher_blocks?id=${confirmTb.id}`, { method: "DELETE" });
    setConfirmTb(null);
    if (!res.ok) return toast("error", "No se pudo quitar");
    toast("success", "Bloqueo quitado");
    await load();
  }

  useEffect(() => {
    const target = selectedCollectiveSession?.[0] ?? selectedAssignment;
    if (target) {
      setEditAsgDay(String(target.dayOfWeek));
      setEditAsgStart(String(target.startHour));
      if (selectedCollectiveSession) {
        const subj = subjects.find((s) => s.id === target.subjectId);
        const dur = subj?.defaultDurationMin ?? Math.round((target.endHour - target.startHour) * 60);
        setEditAsgEnd(String(endHourFromDuration(target.startHour, dur)));
      } else {
        setEditAsgEnd(String(target.endHour));
      }
    }
  }, [selectedAssignment, selectedCollectiveSession, subjects]);

  useEffect(() => {
    if (!selectedCollectiveSession?.[0]) return;
    const target = selectedCollectiveSession[0];
    const subj = subjects.find((s) => s.id === target.subjectId);
    if (!subj || editAsgStart === "") return;
    setEditAsgEnd(String(endHourFromDuration(Number(editAsgStart), subj.defaultDurationMin)));
  }, [editAsgStart, selectedCollectiveSession, subjects]);

  async function saveEditAsg() {
    const target = selectedCollectiveSession?.[0] ?? selectedAssignment;
    if (!target) return;
    const body: Record<string, number> = { id: target.id };
    const day = Number(editAsgDay);
    const start = Number(editAsgStart);
    const end = Number(editAsgEnd);
    if (day !== target.dayOfWeek) body.dayOfWeek = day;
    if (start !== target.startHour) body.startHour = start;
    if (end !== target.endHour) body.endHour = end;
    if (Object.keys(body).length === 1) {
      setSelectedAssignment(null);
      setSelectedCollectiveSession(null);
      return;
    }
    const res = await fetch("/api/assignments", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) return toast("error", (await res.json().catch(() => ({}))).error || "No se pudo guardar");
    toast("success", selectedCollectiveSession ? "Sesión colectiva movida" : "Clase movida");
    setSelectedAssignment(null);
    setSelectedCollectiveSession(null);
    await load();
  }

  return (
    <div className="space-y-5">
      <PageHeader
        icon={Briefcase}
        title={teacher?.name ?? <Skeleton className="inline-block h-7 w-40 align-middle" />}
        description="Tu horario semanal — clases, disponibilidad y reservas."
      />

      <AutoScheduleResultDialog
        result={autoResult}
        onClose={() => setAutoResult(null)}
        subjectColors={subjectColor}
      />

      <div className="flex gap-2 overflow-x-auto pb-1 mb-3 sm:flex-wrap sm:overflow-visible scrollbar-none [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <Button size="sm" variant="outline" className="shrink-0 sm:w-auto justify-center" onClick={() => { setADay("0"); setAStart(""); setAEnd(""); setAvOpen(true); }}>
          <Plus size={14} /> <span className="sm:hidden">Disponibilidad</span><span className="hidden sm:inline">Añadir disponibilidad</span>
        </Button>
        <Button size="sm" variant="outline" className="shrink-0 sm:w-auto justify-center" onClick={() => { setTbTitle(""); setTbDay("0"); setTbStart("16"); setTbEnd("17"); setTbOpen(true); }}>
          <CalendarPlus size={14} /> <span className="sm:hidden">Reserva</span><span className="hidden sm:inline">Agregar reserva de hora</span>
        </Button>
        {!teacher?.scheduleFixed && (
          <Button
            size="sm"
            className="shrink-0 sm:w-auto justify-center"
            onClick={() => autoScheduleSubjects()}
            disabled={busy || loading}
            title="Auto-agenda todas las asignaturas no fijadas"
          >
            {busy ? <><Play size={14} /> Ejecutando…</> : <><Sparkles size={14} /> <span className="sm:hidden">Auto-agendar</span><span className="hidden sm:inline">Auto-agendar todo</span></>}
          </Button>
        )}
      </div>

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

      <Dialog open={selectedAssignment != null || selectedCollectiveSession != null} onOpenChange={(o) => { if (!o) { setSelectedAssignment(null); setSelectedCollectiveSession(null); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{selectedCollectiveSession ? "Sesión colectiva" : "Detalle de asignación"}</DialogTitle>
          </DialogHeader>
          {(selectedAssignment || selectedCollectiveSession) && (() => {
            const target = selectedCollectiveSession?.[0] ?? selectedAssignment!;
            const subj = subjects.find((s) => s.id === target.subjectId);
            const collectiveDur = subj?.defaultDurationMin;
            return (
            <div className="space-y-3 text-sm">
              <dl className="space-y-2">
                <div className="flex justify-between gap-2"><dt className="text-gray-500 shrink-0">Asignatura</dt><dd className="font-medium text-right truncate max-w-[58%]">{target.subject?.name ?? `#${target.subjectId}`}</dd></div>
                {selectedCollectiveSession && collectiveDur != null && (
                  <div className="flex justify-between"><dt className="text-gray-500">Duración</dt><dd className="font-medium">{fmtDurationMin(collectiveDur)}</dd></div>
                )}
                {selectedCollectiveSession ? (
                  <div>
                    <dt className="text-gray-500 mb-1">Alumnos ({selectedCollectiveSession.length})</dt>
                    <dd className="flex flex-wrap gap-1">
                      {selectedCollectiveSession.map((a) => (
                        <Badge key={a.id}>{a.student?.name ?? `#${a.studentId}`}</Badge>
                      ))}
                    </dd>
                  </div>
                ) : (
                  <div className="flex justify-between gap-2"><dt className="text-gray-500 shrink-0">Alumno</dt><dd className="font-medium text-right truncate max-w-[58%]">{target.student?.name ?? `#${target.studentId}`}</dd></div>
                )}
                <div className="flex justify-between"><dt className="text-gray-500">Origen</dt><dd><Badge variant={target.origin === "auto" ? "success" : "gray"}>{target.origin}</Badge></dd></div>
              </dl>
              <div className="divider" />
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <Label htmlFor="tb-1">Día</Label>
                  <Select value={editAsgDay} onValueChange={setEditAsgDay}>
                    <SelectTrigger><SelectValue placeholder="Selecciona…" /></SelectTrigger>
                    <SelectContent>
                      {DAYS.map((d, i) => <SelectItem key={i} value={String(i)}>{d}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="tb-2">Hora de inicio</Label>
                  <Select value={editAsgStart} onValueChange={setEditAsgStart}>
                    <SelectTrigger><SelectValue placeholder="Selecciona…" /></SelectTrigger>
                    <SelectContent>
                      {HOURS_START.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="tb-3">Hora de fin</Label>
                  {selectedCollectiveSession ? (
                    <div className="flex h-9 items-center rounded-md border border-gray-200 bg-gray-50 px-3 text-sm tabular-nums">
                      {editAsgEnd !== "" ? fmtHour(editAsgEnd) : "—"}
                    </div>
                  ) : (
                    <Select value={editAsgEnd} onValueChange={setEditAsgEnd}>
                      <SelectTrigger><SelectValue placeholder="Selecciona…" /></SelectTrigger>
                      <SelectContent>
                        {HOURS_END.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              </div>
              {selectedCollectiveSession && (
                <p className="text-xs text-gray-500">La hora de fin se calcula automáticamente según la duración de la asignatura ({collectiveDur != null ? fmtDurationMin(collectiveDur) : "—"}). Al mover o borrar, se aplica a todos los alumnos.</p>
              )}
            </div>
            );
          })()}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setSelectedAssignment(null); setSelectedCollectiveSession(null); }}>Cerrar</Button>
            <Button onClick={saveEditAsg}><Save size={14} /> Guardar</Button>
            <Button variant="destructiveSolid" onClick={deleteAssignment}><Trash2 size={14} /> Borrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={avOpen} onOpenChange={handleAvOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Añadir disponibilidad</DialogTitle>
            <p className="text-sm text-gray-500">Al cerrar se guarda automáticamente si las horas están completas.</p>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <Label htmlFor="az-0">Día</Label>
              <Select value={aDay} onValueChange={setADay}>
                <SelectTrigger><SelectValue placeholder="Selecciona…" /></SelectTrigger>
                <SelectContent>
                  {DAYS.map((d, i) => <SelectItem key={i} value={String(i)}>{d}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="az-1">Hora de inicio</Label>
              <Select value={aStart} onValueChange={setAStart}>
                <SelectTrigger><SelectValue placeholder="Selecciona…" /></SelectTrigger>
                <SelectContent>
                  {HOURS_START.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="az-2">Hora de fin</Label>
              <Select value={aEnd} onValueChange={setAEnd}>
                <SelectTrigger><SelectValue placeholder="Selecciona…" /></SelectTrigger>
                <SelectContent>
                  {HOURS_END.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => handleAvOpenChange(false)}><Save size={14} /> Guardar y cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={tbOpen} onOpenChange={(o) => { if (!o) setTbOpen(false); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Agregar reserva de hora</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-gray-500">
              Reserva horas para otras cosas (clases particulares de otro tipo, reuniones, comidas…). El auto-agendado no pondrá clases ahí.
            </p>
            <div>
              <Label>¿Qué es? (opcional)</Label>
              <input className="input" type="text" value={tbTitle} onChange={(e) => setTbTitle(e.target.value)} placeholder="Ej: Reunión de departamento" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <Label>Día</Label>
                <Select value={tbDay} onValueChange={setTbDay}>
                  <SelectTrigger><SelectValue placeholder="Selecciona…" /></SelectTrigger>
                  <SelectContent>
                    {DAYS.map((d, i) => <SelectItem key={i} value={String(i)}>{d}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Hora de inicio</Label>
                <Select value={tbStart} onValueChange={setTbStart}>
                  <SelectTrigger><SelectValue placeholder="Selecciona…" /></SelectTrigger>
                  <SelectContent>
                    {HOURS_START.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Hora de fin</Label>
                <Select value={tbEnd} onValueChange={setTbEnd}>
                  <SelectTrigger><SelectValue placeholder="Selecciona…" /></SelectTrigger>
                  <SelectContent>
                    {HOURS_END.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTbOpen(false)}><X size={14} /> Cancelar</Button>
            <Button onClick={submitTb}><Save size={14} /> Guardar reserva</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmTb != null} onOpenChange={(o) => { if (!o) setConfirmTb(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Quitar bloqueo</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmTb ? `¿Quitar el bloqueo "${confirmTb.title}" del ${DAYS[confirmTb.dayOfWeek]} ${fmtRange(confirmTb.startHour, confirmTb.endHour)}? Esas horas volverán a estar disponibles para clases.` : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteTb}>Quitar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
