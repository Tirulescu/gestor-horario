"use client";

import { useCallback, useEffect, useState } from "react";
import { invalidate, invalidateMany, put, warmData, WARM_ENDPOINTS } from "@/lib/clientCache";

export const SCHEDULE_LOCK_CHANGED_EVENT = "schedule-lock-changed";

export interface TeacherProfile {
  id: number;
  name: string;
  email?: string | null;
  scheduleFixed: boolean;
}

function isTeacherArray(data: unknown): data is TeacherProfile[] {
  return Array.isArray(data) && data.every(
    (row) => typeof row === "object" && row !== null && typeof (row as TeacherProfile).id === "number",
  );
}

function clearPoisonedTeacherCache() {
  invalidate("/api/teachers");
  invalidateMany([...WARM_ENDPOINTS]);
}

export function useTeacherProfile() {
  const [teacher, setTeacher] = useState<TeacherProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const cached = warmData<TeacherProfile[]>("/api/teachers");
    if (isTeacherArray(cached) && cached[0]) {
      setTeacher(cached[0]);
      setLoading(false);
    }
    try {
      const res = await fetch("/api/teachers", { credentials: "same-origin" });
      const data: unknown = await res.json();
      if (!res.ok || !isTeacherArray(data)) {
        if (res.status === 401) clearPoisonedTeacherCache();
        setTeacher(null);
        return;
      }
      const t = data[0] ?? null;
      setTeacher(t);
      if (data.length > 0) put("/api/teachers", data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const onChange = () => { void load(); };
    window.addEventListener(SCHEDULE_LOCK_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(SCHEDULE_LOCK_CHANGED_EVENT, onChange);
  }, [load]);

  const toggleScheduleFixed = useCallback(async (next: boolean): Promise<boolean> => {
    if (!teacher || saving) return false;
    setSaving(true);
    setTeacher((cur) => (cur ? { ...cur, scheduleFixed: next } : cur));
    const res = await fetch("/api/teachers", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ id: teacher.id, scheduleFixed: next }),
    });
    setSaving(false);
    if (!res.ok) {
      setTeacher((cur) => (cur ? { ...cur, scheduleFixed: !next } : cur));
      return false;
    }
    const updated: TeacherProfile = await res.json();
    setTeacher(updated);
    put("/api/teachers", [updated]);
    invalidate("/api/teachers");
    window.dispatchEvent(new Event(SCHEDULE_LOCK_CHANGED_EVENT));
    return true;
  }, [teacher, saving]);

  return {
    teacher,
    scheduleFixed: Boolean(teacher?.scheduleFixed),
    loading,
    saving,
    reload: load,
    toggleScheduleFixed,
  };
}
