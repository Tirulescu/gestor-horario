"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Pencil, Trash2, Save, X, GraduationCap, Calendar, CalendarClock, Mail } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/Toast";
import PageHeader from "@/components/PageHeader";
import { TableCardSkeleton } from "@/components/skeletons";
import { warmData, put, invalidate, invalidateMany } from "@/lib/clientCache";
import { fmtDayRange } from "@/lib/hours";
import StudentScheduleViewDialog from "@/components/StudentScheduleViewDialog";
import StudentScheduleManageDialog from "@/components/StudentScheduleManageDialog";
import { firstAvailabilityBlockedConflict, type TimeRange } from "@/lib/studentAvailability";

interface Subject { id: number; name: string; defaultDurationMin: number; isCollective?: boolean; }
interface Student {
  id: number;
  name: string;
  email?: string | null;
  grade?: string | null;
  blockedRanges?: TimeRange[];
  availableRanges?: TimeRange[];
}
interface SSRow { id: number; subjectId: number; studentId: number; durationMin?: number | null; }
interface Availability { dayOfWeek: number; startHour: number; endHour: number; }

export default function StudentsClient() {
  const toast = useToast();
  const [students, setStudents] = useState<Student[] | null>(null);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [subjectLinks, setSubjectLinks] = useState<SSRow[]>([]);
  const [availabilities, setAvailabilities] = useState<Availability[]>([]);

  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<Student | null>(null);
  const [fName, setFName] = useState("");
  const [fGrade, setFGrade] = useState("");
  const [fEmail, setFEmail] = useState("");
  const [selSubjects, setSelSubjects] = useState<Set<number>>(new Set());
  const [initialSubjects, setInitialSubjects] = useState<Set<number>>(new Set());

  const [viewOpen, setViewOpen] = useState(false);
  const [viewStudent, setViewStudent] = useState<Student | null>(null);

  const [manageOpen, setManageOpen] = useState(false);
  const [manageStudentId, setManageStudentId] = useState<number | null>(null);

  const [confirmDel, setConfirmDel] = useState<Student | null>(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    const cachedStudents = warmData<Student[]>("/api/students");
    if (cachedStudents !== null) {
      setStudents(cachedStudents);
      setSubjects(warmData<Subject[]>("/api/subjects") ?? []);
      setSubjectLinks(warmData<SSRow[]>("/api/subject_students") ?? []);
      setAvailabilities(warmData<Availability[]>("/api/availabilities") ?? []);
    }
    const [st, su, ss, av] = await Promise.all([
      fetch("/api/students").then((r) => r.json()) as Promise<Student[]>,
      fetch("/api/subjects").then((r) => r.json()) as Promise<Subject[]>,
      fetch("/api/subject_students").then((r) => r.json()) as Promise<SSRow[]>,
      fetch("/api/availabilities").then((r) => r.json()) as Promise<Availability[]>,
    ]);
    setStudents(st);
    setSubjects(su);
    setSubjectLinks(ss);
    setAvailabilities(av);
    put("/api/students", st);
    put("/api/subjects", su);
    put("/api/subject_students", ss);
    put("/api/availabilities", av);
  }
  useEffect(() => { load(); }, []);

  const grades = useMemo(
    () => Array.from(new Set((students ?? []).map((s) => (s.grade ?? "").trim()).filter(Boolean))).sort(),
    [students]
  );

  function openNew() {
    setEditing(null);
    setFName(""); setFGrade(""); setFEmail("");
    setSelSubjects(new Set());
    setInitialSubjects(new Set());
    setEditOpen(true);
  }

  async function openEdit(s: Student) {
    setEditing(s);
    setFName(s.name); setFGrade(s.grade ?? ""); setFEmail(s.email ?? "");
    const rows = await fetch(`/api/subject_students?studentId=${s.id}`).then((r) => r.json()) as SSRow[];
    const subs = new Set(rows.map((r) => r.subjectId));
    setSelSubjects(subs);
    setInitialSubjects(subs);
    setEditOpen(true);
  }

  function openScheduleView(s: Student) {
    setViewStudent(s);
    setViewOpen(true);
  }

  function openScheduleManage(studentId: number | null = null) {
    if ((students ?? []).length === 0) return toast("error", "No hay alumnos todavía");
    setManageStudentId(studentId);
    setManageOpen(true);
  }

  function subjectsEqual(a: Set<number>, b: Set<number>) {
    if (a.size !== b.size) return false;
    for (const id of a) if (!b.has(id)) return false;
    return true;
  }

  function toggleSub(id: number) {
    setSelSubjects((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  async function updateStudentRanges(
    st: Student,
    patch: { availableRanges?: TimeRange[]; blockedRanges?: TimeRange[] }
  ): Promise<boolean> {
    const res = await fetch("/api/students", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: st.id,
        name: st.name,
        email: st.email ?? "",
        grade: st.grade ?? "",
        ...patch,
      }),
    });
    return res.ok;
  }

  async function saveAvailabilityBatch(targets: Student[], ranges: TimeRange[]) {
    for (const st of targets) {
      const cur = st.availableRanges ?? [];
      const toAdd = ranges.filter((r) => !cur.some((c) => c.day === r.day && c.start === r.start && c.end === r.end));
      const conflict = firstAvailabilityBlockedConflict(toAdd, st.blockedRanges ?? []);
      if (conflict) {
        return toast(
          "error",
          `La franja ${fmtDayRange(conflict.day, conflict.start, conflict.end)} choca con un bloqueo de ${st.name}`
        );
      }
    }
    setSaving(true);
    let touched = 0;
    for (const st of targets) {
      const cur = st.availableRanges ?? [];
      const toAdd = ranges.filter((r) => !cur.some((c) => c.day === r.day && c.start === r.start && c.end === r.end));
      if (toAdd.length === 0) continue;
      const res = await fetch("/api/students", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: st.id,
          name: st.name,
          email: st.email ?? "",
          grade: st.grade ?? "",
          availableRanges: [...cur, ...toAdd],
        }),
      });
      if (!res.ok) {
        setSaving(false);
        return toast("error", (await res.json().catch(() => ({}))).error || "No se pudo guardar");
      }
      touched++;
    }
    setSaving(false);
    if (touched === 0) return toast("error", "No se añadió ninguna franja nueva");
    toast("success", `Disponibilidad añadida a ${touched} alumno(s)`);
    invalidate("/api/students");
    await load();
  }

  async function saveBlockBatch(targets: Student[], days: number[], start: number, end: number) {
    setSaving(true);
    let touched = 0;
    for (const st of targets) {
      const cur = st.blockedRanges ?? [];
      const toAdd: TimeRange[] = [];
      for (const day of days) {
        const dup = cur.some((b) => b.day === day && end > b.start && start < b.end);
        if (!dup) toAdd.push({ day, start, end });
      }
      if (toAdd.length === 0) continue;
      const ok = await updateStudentRanges(st, { blockedRanges: [...cur, ...toAdd] });
      if (ok) touched++;
    }
    setSaving(false);
    if (touched === 0) return toast("error", "Esas horas ya estaban bloqueadas");
    toast("success", `Hora bloqueada para ${touched} alumno(s)`);
    invalidate("/api/students");
    await load();
  }

  async function removeAvailability(st: Student, range: TimeRange) {
    const nr = (st.availableRanges ?? []).filter(
      (r) => !(r.day === range.day && r.start === range.start && r.end === range.end)
    );
    const ok = await updateStudentRanges(st, { availableRanges: nr });
    if (!ok) return toast("error", "No se pudo quitar la franja");
    toast("success", "Franja quitada");
    invalidate("/api/students");
    await load();
  }

  async function removeBlock(st: Student, idx: number) {
    const nr = (st.blockedRanges ?? []).filter((_, i) => i !== idx);
    const ok = await updateStudentRanges(st, { blockedRanges: nr });
    if (!ok) return toast("error", "No se pudo quitar el bloqueo");
    toast("success", "Bloqueo quitado");
    invalidate("/api/students");
    await load();
  }

  async function saveEventBatch(
    targets: Student[],
    subjectId: number,
    days: number[],
    start: number,
    endForStudent: (student: Student) => number,
  ) {
    const subj = subjects.find((s) => s.id === subjectId);
    if (!subj) return toast("error", "Asignatura no encontrada");
    if (targets.length === 0) return toast("error", "No hay alumnos seleccionados");

    setSaving(true);
    let created = 0;
    for (const day of days) {
      const sessionId = subj.isCollective && targets.length > 1 ? crypto.randomUUID() : null;
      for (const st of targets) {
        const end = endForStudent(st);
        const res = await fetch("/api/assignments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            subjectId,
            studentId: st.id,
            dayOfWeek: day,
            startHour: start,
            endHour: end,
            collectiveSessionId: sessionId,
          }),
        });
        if (!res.ok) {
          setSaving(false);
          const d = await res.json().catch(() => ({}));
          return toast("error", d.error || `No se pudo crear la clase de ${st.name}`);
        }
        created++;
      }
    }
    setSaving(false);
    toast("success", created === 1 ? "Evento creado" : `${created} eventos creados`);
    invalidateMany(["/api/assignments", "/api/subject_students"]);
    await load();
  }

  async function saveStudent() {
    if (!fName.trim()) return toast("error", "Falta el nombre");
    if (
      editing &&
      fName.trim() === editing.name &&
      fGrade.trim() === (editing.grade ?? "") &&
      fEmail.trim() === (editing.email ?? "") &&
      subjectsEqual(selSubjects, initialSubjects)
    ) {
      setEditOpen(false);
      return;
    }
    setSaving(true);
    const payload: Record<string, unknown> = { name: fName.trim(), grade: fGrade.trim(), email: fEmail.trim() };
    if (editing) payload.id = editing.id;
    const res = await fetch("/api/students", {
      method: editing ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      setSaving(false);
      return toast("error", (await res.json().catch(() => ({}))).error || "Error");
    }
    const saved: Student = await res.json();
    const rows = await fetch(`/api/subject_students?studentId=${saved.id}`).then((r) => r.json()) as SSRow[];
    for (const sub of subjects) {
      const row = rows.find((r) => r.subjectId === sub.id);
      const want = selSubjects.has(sub.id);
      if (want && !row) {
        const linkRes = await fetch("/api/subject_students", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ subjectId: sub.id, studentId: saved.id }),
        });
        if (!linkRes.ok) {
          setSaving(false);
          return toast("error", (await linkRes.json().catch(() => ({}))).error || `No se pudo añadir a ${sub.name}`);
        }
      } else if (!want && row) {
        const delRes = await fetch(`/api/subject_students?id=${row.id}`, { method: "DELETE" });
        if (!delRes.ok) {
          setSaving(false);
          return toast("error", (await delRes.json().catch(() => ({}))).error || `No se pudo quitar de ${sub.name}`);
        }
      }
    }
    setSaving(false);
    setEditOpen(false);
    toast("success", editing ? "Alumno actualizado" : "Alumno creado");
    invalidateMany(["/api/students", "/api/subject_students", "/api/subjects"]);
    await load();
  }

  async function doDelete() {
    if (!confirmDel) return;
    const res = await fetch(`/api/students?id=${confirmDel.id}`, { method: "DELETE" });
    setConfirmDel(null);
    if (!res.ok) return toast("error", "No se pudo borrar");
    invalidate("/api/students"); invalidate("/api/subject_students"); toast("success", "Alumno borrado");
    await load();
  }

  const viewStudentFresh = viewStudent
    ? (students ?? []).find((s) => s.id === viewStudent.id) ?? viewStudent
    : null;

  return (
    <div className="space-y-4">
      <PageHeader
        icon={GraduationCap}
        title="Alumnos"
        description="Datos de alumnos, horarios y restricciones."
        actions={
          <>
            <Button variant="outline" onClick={() => openScheduleManage()}>
              <CalendarClock size={16} />
              <span className="sm:hidden">Horario</span>
              <span className="hidden sm:inline">Gestionar horario</span>
            </Button>
            <Button onClick={openNew}>
              <Plus size={16} />
              <span className="hidden sm:inline">Nuevo alumno</span>
            </Button>
          </>
        }
      />

      {students === null ? (
        <TableCardSkeleton rows={5} />
      ) : students.length === 0 ? (
        <div className="entity-card text-gray-400 text-sm">No hay alumnos aún</div>
      ) : (
        <div className="entity-list entity-list-stacked">
          {students.map((s) => (
            <article key={s.id} className="entity-card">
              <div className="entity-card-header">
                <div className="min-w-0 flex-1">
                  <h3 className="entity-card-title">{s.name}</h3>
                  <div className="entity-card-meta">
                    {s.grade ? (
                      <Badge variant="gray" className="font-normal">{s.grade}</Badge>
                    ) : (
                      <span className="text-xs text-gray-400">Sin curso</span>
                    )}
                    {s.email ? (
                      <span className="inline-flex items-center gap-1 text-xs text-gray-500 min-w-0">
                        <Mail size={12} className="shrink-0" />
                        <span className="truncate">{s.email}</span>
                      </span>
                    ) : null}
                  </div>
                </div>
                <div className="entity-card-actions">
                  <Button size="iconSm" variant="outline" onClick={() => openScheduleView(s)} aria-label="Ver calendario" title="Ver calendario">
                    <Calendar size={14} />
                  </Button>
                  <Button size="iconSm" variant="outline" onClick={() => openEdit(s)} aria-label="Editar datos" title="Editar datos">
                    <Pencil size={14} />
                  </Button>
                  <Button size="iconSm" variant="destructive" onClick={() => setConfirmDel(s)} aria-label="Borrar">
                    <Trash2 size={14} />
                  </Button>
                </div>
              </div>

              <div className="entity-card-section">
                <div className="entity-card-label">Asignaturas</div>
                <div className="entity-card-chips">
                  <StudentSubjects studentId={s.id} subjects={subjects} links={subjectLinks} />
                </div>
              </div>

              <div className="entity-card-section">
                <div className="entity-card-label">Disponibilidad</div>
                <div className="entity-card-chips">
                  {(s.availableRanges ?? []).length === 0 ? (
                    <span className="text-gray-400 text-xs">Sin definir</span>
                  ) : (
                    (s.availableRanges ?? []).map((b, i) => (
                      <Badge key={i} variant="success" className="font-normal whitespace-normal text-left leading-snug">
                        {fmtDayRange(b.day, b.start, b.end)}
                      </Badge>
                    ))
                  )}
                </div>
              </div>

              <div className="entity-card-section">
                <div className="entity-card-label">Horas bloqueadas</div>
                <div className="entity-card-chips">
                  {(s.blockedRanges ?? []).length === 0 ? (
                    <span className="text-gray-400 text-xs">Ninguna</span>
                  ) : (
                    (s.blockedRanges ?? []).map((b, i) => (
                      <Badge key={i} variant="danger" className="font-normal whitespace-normal text-left leading-snug">
                        {fmtDayRange(b.day, b.start, b.end)}
                      </Badge>
                    ))
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      <Dialog open={editOpen} onOpenChange={(o) => { if (!o) setEditOpen(false); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Editar alumno" : "Nuevo alumno"}</DialogTitle>
            {!editing && (
              <DialogDescription>Datos del alumno y en qué asignaturas entra.</DialogDescription>
            )}
          </DialogHeader>
          <div className="space-y-3 overflow-y-auto" style={{ maxHeight: "60dvh" }}>
            <div>
              <Label htmlFor="f-name">Nombre del alumno</Label>
              <Input id="f-name" value={fName} onChange={(e) => setFName(e.target.value)} placeholder="Ej: María Fernández (flauta)" required />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label htmlFor="f-grade">Curso</Label>
                <Input id="f-grade" value={fGrade} onChange={(e) => setFGrade(e.target.value)} placeholder="Ej: 2º Grado Profesional" list="grades-list" />
                <datalist id="grades-list">{grades.map((g) => <option key={g} value={g} />)}</datalist>
              </div>
              <div>
                <Label htmlFor="f-email">Email (opcional)</Label>
                <Input id="f-email" type="text" value={fEmail} onChange={(e) => setFEmail(e.target.value)} placeholder="nombre@ejemplo.com" />
              </div>
            </div>
            <div>
              <Label htmlFor="f-subjects">Asignaturas en las que está matriculado</Label>
              {subjects.length === 0 ? (
                <p className="text-xs text-gray-500">Aún no hay asignaturas.</p>
              ) : (
                <div className="space-y-1.5 mt-1">
                  {subjects.map((sub) => (
                    <label key={sub.id} className="flex items-center gap-2.5 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-blue-600"
                        checked={selSubjects.has(sub.id)}
                        onChange={() => toggleSub(sub.id)}
                      />
                      <span className="font-medium">{sub.name}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" type="button" onClick={() => setEditOpen(false)}><X size={14} /> Cancelar</Button>
            <Button onClick={saveStudent} disabled={saving}><Save size={14} /> {editing ? "Guardar" : "Crear"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <StudentScheduleViewDialog
        open={viewOpen}
        onOpenChange={setViewOpen}
        student={viewStudentFresh}
        subjects={subjects}
      />

      <StudentScheduleManageDialog
        open={manageOpen}
        onOpenChange={setManageOpen}
        students={students ?? []}
        grades={grades}
        subjects={subjects}
        subjectLinks={subjectLinks}
        availabilities={availabilities}
        initialStudentId={manageStudentId}
        saving={saving}
        onSaveAvailability={saveAvailabilityBatch}
        onSaveBlock={saveBlockBatch}
        onSaveEvent={saveEventBatch}
        onRemoveAvailability={removeAvailability}
        onRemoveBlock={removeBlock}
      />

      <AlertDialog open={confirmDel !== null} onOpenChange={(o) => { if (!o) setConfirmDel(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar borrado</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Borrar a <strong>{confirmDel?.name}</strong>? Se borran también sus solicitudes, inscripciones y clases.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={doDelete}>Borrar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function StudentSubjects({
  studentId,
  subjects,
  links,
}: {
  studentId: number;
  subjects: Subject[];
  links: SSRow[];
}) {
  const rows = links.filter((x) => x.studentId === studentId);
  if (rows.length === 0) return <Badge variant="gray">Sin asignaturas</Badge>;
  return (
    <>
      {rows.map((r) => (
        <Badge key={r.id} className="font-normal whitespace-normal text-left leading-snug">
          {subjects.find((x) => x.id === r.subjectId)?.name ?? `#${r.subjectId}`}
        </Badge>
      ))}
    </>
  );
}
