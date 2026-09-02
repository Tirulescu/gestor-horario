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
import { warmData, put } from "@/lib/clientCache";

interface Teacher {
  id: number;
  name: string;
  email?: string | null;
  scheduleFixed: boolean;
}

export default function ProfileClient() {
  const toast = useToast();
  const [teacher, setTeacher] = useState<Teacher | null>(null);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);

  async function load() {
    const cached = warmData<Teacher[]>("/api/teachers");
    if (cached) {
      setTeacher(cached[0] ?? null);
      setReady(true);
    }
    const arr = await fetch("/api/teachers").then((r) => r.json()) as Teacher[];
    const t = arr[0] ?? null;
    setTeacher(t);
    if (arr.length > 0) put("/api/teachers", arr);
    setReady(true);
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
    put("/api/teachers", [updated]);
    toast("success", next ? "Horario fijado" : "Auto-agendar habilitado");
  }

  if (!ready) {
    return (
      <div className="page-stack max-w-2xl">
        <PageHeader
          icon={User}
          title="Mi perfil"
          description="Cuenta y preferencias de horario."
        />
        <CardSkeleton rows={2} />
        <CardSkeleton rows={2} />
      </div>
    );
  }

  if (!teacher) {
    return (
      <div className="page-stack max-w-2xl">
        <PageHeader
          icon={User}
          title="Mi perfil"
          description="Cuenta y preferencias de horario."
        />
        <Card className="p-5 text-sm text-gray-500">No se pudo cargar el perfil.</Card>
      </div>
    );
  }

  return (
    <div className="page-stack max-w-2xl">
      <PageHeader
        icon={User}
        title="Mi perfil"
        description="Cuenta y preferencias de horario."
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
              <Label htmlFor="schedule-fixed" className="text-base font-semibold cursor-pointer mb-0">
                Fijar horario
              </Label>
              {teacher.scheduleFixed && <Badge variant="warn">Activo</Badge>}
            </div>
            <p id="schedule-fixed-desc" className="text-sm text-gray-500 leading-relaxed">
              Bloquea el auto-agendado. Puedes seguir editando a mano.
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
