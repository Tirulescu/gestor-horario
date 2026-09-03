"use client";

import { useEffect, useState } from "react";
import { User, Lock, CalendarOff } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/Toast";
import SetupGuidePanel from "@/components/SetupGuidePanel";
import InstallAppCard from "@/components/InstallAppCard";
import { warmData, put, fetchApi } from "@/lib/clientCache";
import { SCHEDULE_LOCK_CHANGED_EVENT } from "@/lib/useTeacherProfile";

interface Teacher {
  id: number;
  name: string;
  email?: string | null;
  scheduleFixed: boolean;
  hideWeekends: boolean;
}

function readTeacherFromCache(): Teacher | null {
  const cached = warmData<Teacher[]>("/api/teachers");
  return cached?.[0] ?? null;
}

export default function ProfileClient() {
  const toast = useToast();
  const [teacher, setTeacher] = useState<Teacher | null>(readTeacherFromCache);
  const [profilePending, setProfilePending] = useState(() => readTeacherFromCache() === null);
  const [saving, setSaving] = useState(false);

  async function load() {
    const cached = warmData<Teacher[]>("/api/teachers");
    if (cached) {
      setTeacher(cached[0] ?? null);
      setProfilePending(false);
    }
    try {
      const arr = await fetchApi<Teacher[]>("/api/teachers");
      const t = arr?.[0] ?? null;
      setTeacher(t);
      if (arr && arr.length > 0) put("/api/teachers", arr);
    } finally {
      setProfilePending(false);
    }
  }

  useEffect(() => { void load(); }, []);

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
    window.dispatchEvent(new Event(SCHEDULE_LOCK_CHANGED_EVENT));
    toast("success", next ? "Horario fijado" : "Auto-agendar habilitado");
  }

  async function toggleHideWeekends(next: boolean) {
    if (!teacher) return;
    setSaving(true);
    setTeacher((cur) => (cur ? { ...cur, hideWeekends: next } : cur));
    const res = await fetch("/api/teachers", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: teacher.id, hideWeekends: next }),
    });
    setSaving(false);
    if (!res.ok) {
      setTeacher((cur) => (cur ? { ...cur, hideWeekends: !next } : cur));
      return toast("error", (await res.json().catch(() => ({}))).error || "No se pudo guardar");
    }
    const updated: Teacher = await res.json();
    setTeacher(updated);
    put("/api/teachers", [updated]);
    window.dispatchEvent(new Event(SCHEDULE_LOCK_CHANGED_EVENT));
    toast("success", next ? "Fines de semana ocultos" : "Fines de semana visibles");
  }

  return (
    <div className="page-stack max-w-2xl">
      <PageHeader
        icon={User}
        title="Mi perfil"
        description="Cuenta y preferencias de horario."
      />

      <InstallAppCard />

      <SetupGuidePanel />

      <Card className={`p-5 space-y-4 ${profilePending ? "profile-card-pending" : ""}`}>
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1 flex-1">
            <div className="flex items-center gap-2">
              <Lock size={16} className="text-amber-600" />
              <Label htmlFor="schedule-fixed" className="text-base font-semibold cursor-pointer mb-0">
                Fijar horario
              </Label>
              {teacher?.scheduleFixed && <Badge variant="warn">Activo</Badge>}
            </div>
            <p id="schedule-fixed-desc" className="text-sm text-gray-500 leading-relaxed">
              Bloquea el auto-agendado y toda edición del plan (horarios, alumnos, asignaturas y preferencias horarias). Solo podrás consultar el detalle.
            </p>
          </div>
          <Switch
            id="schedule-fixed"
            checked={teacher?.scheduleFixed ?? false}
            onCheckedChange={toggleScheduleFixed}
            disabled={profilePending || !teacher || saving}
            aria-describedby="schedule-fixed-desc"
          />
        </div>
      </Card>

      <Card className={`p-5 space-y-4 ${profilePending ? "profile-card-pending" : ""}`}>
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1 flex-1">
            <div className="flex items-center gap-2">
              <CalendarOff size={16} className="text-indigo-600" />
              <Label htmlFor="hide-weekends" className="text-base font-semibold cursor-pointer mb-0">
                Ocultar fines de semana
              </Label>
              {teacher?.hideWeekends && <Badge>Activo</Badge>}
            </div>
            <p id="hide-weekends-desc" className="text-sm text-gray-500 leading-relaxed">
              Oculta el sábado y el domingo en todos los calendarios semanales.
            </p>
          </div>
          <Switch
            id="hide-weekends"
            checked={teacher?.hideWeekends ?? true}
            onCheckedChange={toggleHideWeekends}
            disabled={profilePending || !teacher || saving}
            aria-describedby="hide-weekends-desc"
          />
        </div>
      </Card>
    </div>
  );
}
