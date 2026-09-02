"use client";

import { warmData, put, invalidate } from "@/lib/clientCache";
import { useEffect, useLayoutEffect, useState } from "react";
import Link from "next/link";
import { Plus, Pencil, Trash2, Save, X, BookOpen, Clock, ChevronRight, Users } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/Toast";
import PageHeader from "@/components/PageHeader";
import { SubjectListSkeleton } from "@/components/skeletons";
import SubjectDurationBadges from "@/components/SubjectDurationBadges";
import { MIN_DURATION_MIN, DURATION_STEP_MIN } from "@/lib/hours";

interface Subject {
  id: number;
  name: string;
  teacherId: number;
  defaultDurationMin: number;
  isCollective?: boolean;
  subjectStudents?: { id: number; durationMin: number | null }[];
  subjectGradeDurations?: { id: number; durationMin: number }[];
}

export default function SubjectsPage() {
  const toast = useToast();
  const [subjects, setSubjects] = useState<Subject[] | null>(null);
  const [name, setName] = useState("");
  const [defaultDurationMin, setDefaultDurationMin] = useState("60");
  const [isCollective, setIsCollective] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [scheduleLocked, setScheduleLocked] = useState(false);

  async function load() {
    const cached = warmData<Subject[]>("/api/subjects");
    if (cached !== null) {
      setSubjects(cached);
    }
    const cachedTeachers = warmData<{ scheduleFixed?: boolean }[]>("/api/teachers");
    if (cachedTeachers) setScheduleLocked(Boolean(cachedTeachers[0]?.scheduleFixed));
    if (cached !== null) return;
    const [s, teachers] = await Promise.all([
      fetch("/api/subjects").then((r) => r.json()) as Promise<Subject[]>,
      fetch("/api/teachers").then((r) => r.json()) as Promise<{ scheduleFixed?: boolean }[]>,
    ]);
    setSubjects(s);
    setScheduleLocked(Boolean(teachers[0]?.scheduleFixed));
    put("/api/subjects", s);
    put("/api/teachers", teachers);
  }

  useLayoutEffect(() => {
    const cached = warmData<Subject[]>("/api/subjects");
    if (cached !== null) setSubjects(cached);
    const cachedTeachers = warmData<{ scheduleFixed?: boolean }[]>("/api/teachers");
    if (cachedTeachers) setScheduleLocked(Boolean(cachedTeachers[0]?.scheduleFixed));
  }, []);

  useEffect(() => { load(); }, []);

  const visibleSubjects = subjects ?? [];

  function openNew() {
    setEditingId(null);
    setName("");
    setDefaultDurationMin("60");
    setIsCollective(false);
    setFormOpen(true);
  }

  function openEdit(s: Subject) {
    setEditingId(s.id);
    setName(s.name);
    setDefaultDurationMin(String(s.defaultDurationMin));
    setIsCollective(Boolean(s.isCollective));
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setEditingId(null);
    setName("");
    setDefaultDurationMin("60");
    setIsCollective(false);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return toast("error", "Falta el nombre");
    if (editingId) {
      const original = subjects?.find((s) => s.id === editingId);
      if (
        original &&
        name === original.name &&
        Number(defaultDurationMin) === original.defaultDurationMin &&
        isCollective === Boolean(original.isCollective)
      ) {
        closeForm();
        return;
      }
    }
    setLoading(true);
    const payload = {
      name,
      defaultDurationMin: Number(defaultDurationMin),
      isCollective,
      ...(editingId ? { id: editingId } : {}),
    };
    const res = await fetch("/api/subjects", {
      method: editingId ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setLoading(false);
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))).error || "Error";
      toast("error", err);
      return;
    }
    toast("success", editingId ? "Asignatura actualizada" : "Asignatura creada");
    closeForm();
    invalidate("/api/subjects");
    await load();
  }

  async function confirmDelete() {
    if (confirmId === null || deleting) return;
    setDeleting(true);
    const res = await fetch(`/api/subjects?id=${confirmId}`, { method: "DELETE" });
    setDeleting(false);
    setConfirmId(null);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      toast("error", d.error || "Error al borrar");
    } else {
      invalidate("/api/subjects"); toast("success", "Asignatura borrada");
    }
    await load();
  }

  return (
    <div className="page-stack">
      <PageHeader
        icon={BookOpen}
        title="Asignaturas"
        description="Materias, duración y alumnos."
        actions={
          !scheduleLocked ? (
            <Button onClick={openNew}>
              <Plus size={16} />
              <span className="hidden sm:inline">Nueva asignatura</span>
            </Button>
          ) : undefined
        }
      />

      {subjects === null ? (
        <SubjectListSkeleton count={4} />
      ) : visibleSubjects.length === 0 ? (
        <div className="entity-card text-gray-400 text-sm">No hay asignaturas aún</div>
      ) : (
        <div className="entity-list">
          {visibleSubjects.map((s) => {
            const studentCount = s.subjectStudents?.length ?? 0;
            return (
              <article key={s.id} className="entity-card">
                <Link href={`/subjects/${s.id}`} className="entity-card-link">
                  <div className="entity-card-link-row">
                    <div className="entity-card-link-title">
                      <span className="entity-card-link-icon" aria-hidden>
                        <BookOpen size={18} />
                      </span>
                      <div className="min-w-0">
                        <h3 className="entity-card-title">{s.name}</h3>
                        <span className="entity-card-enter-hint mt-1">
                          Ver alumnos y horarios
                          <ChevronRight size={14} className="shrink-0" />
                        </span>
                      </div>
                    </div>
                    <ChevronRight size={20} className="shrink-0 text-gray-300 mt-1" aria-hidden />
                  </div>
                  <div className="entity-card-chips pl-[2.8rem]">
                    {s.isCollective ? (
                      <Badge variant="success">Colectiva</Badge>
                    ) : (
                      <Badge variant="gray">Individual</Badge>
                    )}
                    <SubjectDurationBadges
                      subject={s}
                      members={s.subjectStudents}
                      gradeDurations={s.subjectGradeDurations}
                    />
                    <Badge variant="default" className="font-normal gap-1">
                      <Users size={11} />
                      {studentCount} {studentCount === 1 ? "alumno" : "alumnos"}
                    </Badge>
                  </div>
                </Link>
                {!scheduleLocked && (
                  <div className="entity-card-footer">
                    <Button
                      size="iconSm"
                      variant="outline"
                      onClick={() => openEdit(s)}
                      aria-label={`Editar ${s.name}`}
                      title="Editar"
                    >
                      <Pencil size={14} />
                    </Button>
                    <Button
                      size="iconSm"
                      variant="destructive"
                      onClick={() => setConfirmId(s.id)}
                      aria-label={`Borrar ${s.name}`}
                    >
                      <Trash2 size={14} />
                    </Button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar asignatura" : "Nueva asignatura"}</DialogTitle>
          </DialogHeader>
          <form id="subject-form" onSubmit={submit} className="space-y-3">
            <div>
              <Label>Nombre</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div>
              <Label><Clock size={12} className="inline mr-1" /> Duración de la sesión (min)</Label>
              <Input className="w-32" type="number" min={MIN_DURATION_MIN} step={DURATION_STEP_MIN} value={defaultDurationMin} onChange={(e) => setDefaultDurationMin(e.target.value)} required />
              <p className="text-xs text-gray-500 mt-1">
                {isCollective
                  ? "Ej. 90 = 1 h 30 min."
                  : "Por defecto en cada clase. Ej. 90 = 1 h 30 min."}
              </p>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-lg border border-gray-100 px-3 py-2">
              <div>
                <Label htmlFor="is-collective" className="mb-0">Asignatura colectiva</Label>
                <p className="text-xs text-gray-500 mt-0.5">
                  Misma hora para todos los alumnos.
                </p>
              </div>
              <Switch id="is-collective" checked={isCollective} onCheckedChange={setIsCollective} />
            </div>
          </form>
          <DialogFooter>
            <Button variant="outline" type="button" onClick={closeForm} disabled={loading}><X size={14} /> Cancelar</Button>
            <Button type="submit" form="subject-form" loading={loading}><Save size={14} /> {editingId ? "Guardar" : "Crear"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmId !== null} onOpenChange={(o) => { if (!o && !deleting) setConfirmId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar borrado</AlertDialogTitle>
            <AlertDialogDescription>¿Borrar esta asignatura y sus datos?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              loading={deleting}
              onClick={(e) => {
                e.preventDefault();
                void confirmDelete();
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