"use client";

import { useCallback, useEffect, useState } from "react";
import {
  clearAllCache,
  fetchApi,
  onCacheStale,
  put,
  warmData,
} from "@/lib/clientCache";

export const SCHEDULE_LOCK_CHANGED_EVENT = "schedule-lock-changed";

export interface TeacherProfile {
  id: number;
  name: string;
  email?: string | null;
  scheduleFixed: boolean;
  hideWeekends: boolean;
}

function isTeacherArray(data: unknown): data is TeacherProfile[] {
  return Array.isArray(data) && data.every(
    (row) => typeof row === "object" && row !== null && typeof (row as TeacherProfile).id === "number",
  );
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
    const data = await fetchApi<TeacherProfile[]>("/api/teachers");
    if (!data || !isTeacherArray(data)) {
      if (data === null) setTeacher(null);
      setLoading(false);
      return;
    }
    setTeacher(data[0] ?? null);
    if (data.length > 0) put("/api/teachers", data);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
    const onChange = () => { void load(); };
    window.addEventListener(SCHEDULE_LOCK_CHANGED_EVENT, onChange);
    const offStale = onCacheStale(() => { void load(); });
    return () => {
      window.removeEventListener(SCHEDULE_LOCK_CHANGED_EVENT, onChange);
      offStale();
    };
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
      if (res.status === 401) clearAllCache();
      return false;
    }
    const updated: TeacherProfile = await res.json();
    setTeacher(updated);
    put("/api/teachers", [updated]);
    window.dispatchEvent(new Event(SCHEDULE_LOCK_CHANGED_EVENT));
    return true;
  }, [teacher, saving]);

  return {
    teacher,
    scheduleFixed: Boolean(teacher?.scheduleFixed),
    hideWeekends: teacher?.hideWeekends ?? true,
    loading,
    saving,
    reload: load,
    toggleScheduleFixed,
  };
}

/** Lectura ligera de la preferencia hideWeekends desde la caché del profesor. */
export function useHideWeekends(): boolean {
  const cached = warmData<TeacherProfile[]>("/api/teachers");
  const teacher = Array.isArray(cached) ? cached[0] : null;
  return teacher?.hideWeekends ?? true;
}
