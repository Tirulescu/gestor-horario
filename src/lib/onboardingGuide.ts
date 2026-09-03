import { warmData } from "./clientCache";

export const ONBOARDING_DISMISS_KEY = "onboarding-dismissed-v1";

export interface OnboardingData {
  subjectsCount: number;
  studentsCount: number;
  availabilitiesCount: number;
  incompleteRequests: number;
  assignmentsCount: number;
}

export interface GuideStep {
  id: string;
  label: string;
  tip: string;
  done: boolean;
  href?: string;
  hrefLabel?: string;
}

export function isOnboardingDismissed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(ONBOARDING_DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

export function dismissOnboarding(): void {
  try {
    localStorage.setItem(ONBOARDING_DISMISS_KEY, "1");
  } catch {}
}

export function resetOnboardingDismiss(): void {
  try {
    localStorage.removeItem(ONBOARDING_DISMISS_KEY);
  } catch {}
}

export function countIncompleteSlotRequests(
  members: { studentId: number; subjectId: number; slotsRequired?: number }[],
  slotRequests: { studentId: number; subjectId: number }[],
): number {
  let incomplete = 0;
  for (const m of members) {
    const required = m.slotsRequired ?? 1;
    const reqs = slotRequests.filter(
      (r) => r.studentId === m.studentId && r.subjectId === m.subjectId,
    ).length;
    if (reqs < required) incomplete++;
  }
  return incomplete;
}

export const EMPTY_ONBOARDING_DATA: OnboardingData = {
  subjectsCount: 0,
  studentsCount: 0,
  availabilitiesCount: 0,
  incompleteRequests: 0,
  assignmentsCount: 0,
};

export function readOnboardingDataFromCache(): OnboardingData {
  if (typeof window === "undefined") return EMPTY_ONBOARDING_DATA;
  const subjects = warmData<{ id: number }[]>("/api/subjects") ?? [];
  const students = warmData<{ id: number }[]>("/api/students") ?? [];
  const availabilities = warmData<unknown[]>("/api/availabilities") ?? [];
  const members = warmData<{ studentId: number; subjectId: number; slotsRequired?: number }[]>(
    "/api/subject_students",
  ) ?? [];
  const slotRequests = warmData<{ studentId: number; subjectId: number }[]>(
    "/api/slot_requests",
  ) ?? [];
  const assignments = warmData<unknown[]>("/api/assignments") ?? [];
  return {
    subjectsCount: subjects.length,
    studentsCount: students.length,
    availabilitiesCount: availabilities.length,
    incompleteRequests: countIncompleteSlotRequests(members, slotRequests),
    assignmentsCount: assignments.length,
  };
}

export function hasOnboardingCache(): boolean {
  if (typeof window === "undefined") return false;
  return (
    warmData("/api/subjects") !== null
    || warmData("/api/students") !== null
    || warmData("/api/assignments") !== null
  );
}

export function buildGuideSteps(data: OnboardingData): GuideStep[] {
  const requestsDone =
    data.incompleteRequests === 0 && data.studentsCount > 0 && data.subjectsCount > 0;

  return [
    {
      id: "subjects",
      label: "Crear al menos una asignatura",
      tip: "Define cada materia que impartes: duración de clase, si es colectiva y un color para identificarla en el calendario.",
      done: data.subjectsCount > 0,
      href: "/subjects",
      hrefLabel: "Ir a asignaturas",
    },
    {
      id: "students",
      label: "Añadir alumnos",
      tip: "Registra a tus alumnos e inscríbelos en tus asignaturas. En Editar cambias datos, matrícula, disponibilidad y las franjas ya creadas. Con Añadir al horario creas clases (tuyas o de otras del centro) y bloqueos (actividades fuera del centro).",
      done: data.studentsCount > 0,
      href: "/students",
      hrefLabel: "Ir a alumnos",
    },
    {
      id: "availability",
      label: "Definir tu disponibilidad semanal",
      tip: "Marca las franjas en las que puedes dar clase. El auto-agendado solo usará esas horas.",
      done: data.availabilitiesCount > 0,
      href: "/dashboard",
      hrefLabel: "Ir a mi horario",
    },
    {
      id: "requests",
      label: data.incompleteRequests > 0
        ? `Completar preferencias (${data.incompleteRequests} pendiente${data.incompleteRequests !== 1 ? "s" : ""})`
        : "Completar preferencias horarias",
      tip: "Cada alumno elige sus preferencias de día y hora por asignatura. Cuanto más completas, mejor encaja el horario.",
      done: requestsDone,
      href: "/requests",
      hrefLabel: "Ir a preferencias",
    },
    {
      id: "schedule",
      label: "Auto-agendar clases",
      tip: "Genera un borrador respetando disponibilidad y preferencias. Revísalo y aplícalo cuando esté bien.",
      done: data.assignmentsCount > 0,
      href: "/dashboard",
      hrefLabel: "Auto-agendar",
    },
  ];
}
