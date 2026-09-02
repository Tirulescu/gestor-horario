/** Tipos compartidos del resultado de auto-agendado (cliente y servidor). */

export interface AutoScheduleAssigned {
  studentId: number;
  studentName: string;
  subjectId: number;
  subjectName: string;
  day: number;
  startHour: number;
  endHour: number;
  /** opción interna del alumno cumplida: 1 = su favorita, null = no petición, 0 = fallback */
  prefOrder: number | null;
  isCollective?: boolean;
  collectiveSessionId?: string | null;
}

export interface AutoScheduleUnassigned {
  studentId: number;
  studentName: string;
  subjectId: number;
  subjectName: string;
  reason: string;
}

export interface AutoScheduleResult {
  assigned: AutoScheduleAssigned[];
  unassigned: AutoScheduleUnassigned[];
  skipped?: { subjectId: number; subjectName: string; reason: string }[];
}
