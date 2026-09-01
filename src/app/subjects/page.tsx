"use client";

import { warmData, put, invalidate } from "@/lib/clientCache";
import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Plus, Pencil, Trash2, Save, X, BookOpen, Clock, ExternalLink } from "lucide-react";
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
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/Toast";
import PageHeader from "@/components/PageHeader";
import { TableCardSkeleton } from "@/components/skeletons";

interface Subject {
  id: number;
  name: string;
  teacherId: number;
  defaultDurationMin: number;
  isCollective?: boolean;
  teacher?: { name: string };
  subjectStudents?: { id: number }[];
}

export default function SubjectsPageWrapper() {
  return (
    <Suspense fallback={<TableCardSkeleton rows={4} />}>
      <SubjectsPage />
    </Suspense>
  );
}

function SubjectsPage() {
  const toast = useToast();
  const [subjects, setSubjects] = useState<Subject[] | null>(null);
  const [name, setName] = useState("");
  const [defaultDurationMin, setDefaultDurationMin] = useState("60");
  const [isCollective, setIsCollective] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [confirmId, setConfirmId] = useState<number | null>(null);

  async function load(force = false) {
    if (!force) {
      const cs = warmData<Subject[]>("/api/subjects");
      if (cs !== null) {
        setSubjects(cs);
        return;
      }
    }
    const s = await fetch("/api/subjects").then((r) => r.json());
    setSubjects(s);
    put("/api/subjects", s);
  }

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
    await load(true);
  }

  async function confirmDelete() {
    if (confirmId === null) return;
    const res = await fetch(`/api/subjects?id=${confirmId}`, { method: "DELETE" });
    setConfirmId(null);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      toast("error", d.error || "Error al borrar");
    } else {
      invalidate("/api/subjects"); toast("success", "Asignatura borrada");
    }
    await load(true);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        icon={BookOpen}
        title="Asignaturas"
        description="Organiza tus materias, duración de sesiones y alumnos inscritos."
        actions={
          <Button onClick={openNew}>
            <Plus size={16} />
            <span className="hidden sm:inline">Nueva asignatura</span>
          </Button>
        }
      />

      {subjects === null ? (
        <TableCardSkeleton rows={4} />
      ) : (
      <Card className="p-5 overflow-x-auto">
        {visibleSubjects.length === 0 ? (
          <div className="text-gray-400 text-sm">No hay asignaturas aún</div>
        ) : (
          <table className="w-full text-sm rtable">
            <thead>
              <tr className="text-left border-b border-gray-100">
                <th className="py-2 pr-4 font-medium text-gray-600">Nombre</th>
                <th className="py-2 pr-4 font-medium text-gray-600">Tipo</th>
                <th className="py-2 pr-4 font-medium text-gray-600">Duración</th>
                <th className="py-2 pr-4 font-medium text-gray-600">Alumnos</th>
                <th className="py-2 font-medium text-gray-600 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {visibleSubjects.map((s) => (
                <tr key={s.id} className="border-b border-gray-50">
                  <td className="py-2 pr-4" data-label="Nombre">
                    <Button asChild variant="outline" size="xs">
                      <Link href={`/subjects/${s.id}`}>{s.name} <ExternalLink /></Link>
                    </Button>
                  </td>
                  <td className="py-2 pr-4" data-label="Tipo">
                    {s.isCollective ? <Badge variant="success">Colectiva</Badge> : <Badge variant="gray">Individual</Badge>}
                  </td>
                  <td className="py-2 pr-4" data-label="Duración">{s.defaultDurationMin} min</td>
                  <td className="py-2 pr-4" data-label="Alumnos">{s.subjectStudents?.length ?? 0}</td>
                  <td className="py-2" data-actions>
                    <div className="flex gap-1.5 justify-end">
                      <Button size="iconSm" variant="outline" onClick={() => openEdit(s)} aria-label="Editar"><Pencil size={14} /></Button>
                      <Button size="iconSm" variant="destructive" onClick={() => setConfirmId(s.id)} aria-label="Borrar"><Trash2 size={14} /></Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
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
              <Input className="w-32" type="number" min={5} step={5} value={defaultDurationMin} onChange={(e) => setDefaultDurationMin(e.target.value)} required />
              <p className="text-xs text-gray-500 mt-1">
                {isCollective
                  ? "Duración exacta de la clase colectiva (ej. 90 = 1 h 30 min)."
                  : "Duración por defecto de cada clase individual (ej. 90 = 1 h 30 min)."}
              </p>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-lg border border-gray-100 px-3 py-2">
              <div>
                <Label htmlFor="is-collective">Asignatura colectiva</Label>
                <p className="text-xs text-gray-500 mt-0.5">
                  Todos los alumnos comparten una misma hora. El auto-agendado elige el hueco con más alumnos posibles.
                </p>
              </div>
              <Switch id="is-collective" checked={isCollective} onCheckedChange={setIsCollective} />
            </div>
          </form>
          <DialogFooter>
            <Button variant="outline" type="button" onClick={closeForm}><X size={14} /> Cancelar</Button>
            <Button type="submit" form="subject-form" disabled={loading}><Save size={14} /> {editingId ? "Guardar" : "Crear"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmId !== null} onOpenChange={(o) => { if (!o) setConfirmId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar borrado</AlertDialogTitle>
            <AlertDialogDescription>¿Seguro que quieres borrar esta asignatura? Se borrarán en cascada alumnos inscritos, posibilidades y asignaciones.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Borrar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}