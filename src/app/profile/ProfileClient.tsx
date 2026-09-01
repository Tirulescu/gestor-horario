"use client";

import { useEffect, useState } from "react";
import { User, Lock } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/Toast";
import { CardSkeleton } from "@/components/skeletons";
import { invalidate } from "@/lib/clientCache";

interface Teacher {
  id: number;
  name: string;
  email?: string | null;
  scheduleFixed: boolean;
}

export default function ProfileClient() {
  const toast = useToast();
  const [teacher, setTeacher] = useState<Teacher | null>(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    const t = await fetch("/api/teachers").then((r) => r.json()).then((arr: Teacher[]) => arr[0] ?? null);
    setTeacher(t);
  }

  useEffect(() => { load(); }, []);

  async function toggleScheduleFixed(next: boolean) {
    if (!teacher) return;
    setSaving(true);
    setTeacher((cur) => (cur ? { ...cur, scheduleFixed: next } : cur));
    const res = await fetch("/api/teachers", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: teacher.id, scheduleFixed: next }),
    });
    setSaving(false);
    if (!res.ok) {
      setTeacher((cur) => (cur ? { ...cur, scheduleFixed: !next } : cur));
      return toast("error", (await res.json().catch(() => ({}))).error || "No se pudo guardar");
    }
    const updated: Teacher = await res.json();
    setTeacher(updated);
    invalidate("/api/teachers");
    toast("success", next ? "Horario fijado" : "Auto-agendar habilitado");
  }

  if (!teacher) {
    return (
      <div className="max-w-2xl space-y-5">
        <PageHeader
          icon={User}
          title="Mi perfil"
          description="Datos de tu cuenta y preferencias de horario."
        />
        <CardSkeleton rows={2} />
        <CardSkeleton rows={2} />
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-2xl">
      <PageHeader
        icon={User}
        title="Mi perfil"
        description="Datos de tu cuenta y preferencias de horario."
      />

      <Card className="p-5 space-y-4">
        <h2 className="font-semibold text-sm text-gray-900">Datos personales</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label className="text-gray-500">Nombre</Label>
            <p className="text-sm font-medium mt-1">{teacher.name}</p>
          </div>
          <div>
            <Label className="text-gray-500">Correo</Label>
            <p className="text-sm font-medium mt-1">{teacher.email || "—"}</p>
          </div>
        </div>
        <p className="text-xs text-gray-500">Los datos provienen de tu cuenta de Google al iniciar sesión.</p>
      </Card>

      <Card className="p-5 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1 flex-1">
            <div className="flex items-center gap-2">
              <Lock size={16} className="text-amber-600" />
              <Label htmlFor="schedule-fixed" className="text-base font-semibold cursor-pointer">
                Fijar horario
              </Label>
              {teacher.scheduleFixed && <Badge variant="warn">Activo</Badge>}
            </div>
            <p id="schedule-fixed-desc" className="text-sm text-gray-500 leading-relaxed">
              Impide que el auto-agendado modifique tu horario. Las clases manuales y reservas siguen editables.
            </p>
          </div>
          <Switch
            id="schedule-fixed"
            checked={teacher.scheduleFixed}
            onCheckedChange={toggleScheduleFixed}
            disabled={saving}
            aria-describedby="schedule-fixed-desc"
          />
        </div>
      </Card>
    </div>
  );
}
