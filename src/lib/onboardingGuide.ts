import { warmData } from "./clientCache";

const ONBOARDING_DISMISS_KEY = "onboarding-dismissed-v1";

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

const EMPTY_ONBOARDING_DATA: OnboardingData = {
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
      tip: "Define cada materia que impartes: duración, si es colectiva y un color. En su ficha inscribes alumnos (duración y opciones de horario por alumno o curso) y puedes fijar esa asignatura para que el auto-agendado no la mueva.",
      done: data.subjectsCount > 0,
      href: "/subjects",
      hrefLabel: "Ir a asignaturas",
    },
    {
      id: "students",
      label: "Añadir alumnos",
      tip: "Registra a tus alumnos e inscríbelos en tus asignaturas. En Editar cambias datos, matrícula, su disponibilidad y las franjas ya creadas. Con Añadir al horario también puedes dejar constancia de lo que ya tienen ocupado: «Otra asignatura» para materias del conservatorio que no impartes (orquesta, lenguaje…) y «Bloqueo» para actividades fuera del centro (extraescolares, ensayos…). Así el horario las respeta sin intentar colocarlas por ti.",
      done: data.studentsCount > 0,
      href: "/students",
      hrefLabel: "Ir a alumnos",
    },
    {
      id: "availability",
      label: "Definir tu disponibilidad semanal",
      tip: "En Mi horario, usa Añadir al calendario para marcar cuándo das clase y tus propios bloqueos. Preferencias y auto-agendado se apoyan en esa disponibilidad; las ocupaciones del alumno (otras asignaturas del conservatorio o actividades externas) se anotan a mano y pueden quedar fuera de ella. Desde este perfil puedes ocultar el fin de semana.",
      done: data.availabilitiesCount > 0,
      href: "/dashboard",
      hrefLabel: "Ir a mi horario",
    },
    {
      id: "requests",
      label: data.incompleteRequests > 0
        ? `Completar preferencias (${data.incompleteRequests} pendiente${data.incompleteRequests !== 1 ? "s" : ""})`
        : "Completar preferencias horarias",
      tip: "Tú anotas, por asignatura, las franjas que encajan con cada alumno. Solo aparecen horas compatibles con tu disponibilidad y la del alumno, descontando lo que ya tengan ocupado. Puedes partir la duración en varias preferencias. Las otras asignaturas del conservatorio y los bloqueos externos no piden preferencias: ya están fijadas a mano.",
      done: requestsDone,
      href: "/requests",
      hrefLabel: "Ir a preferencias",
    },
    {
      id: "schedule",
      label: "Auto-agendar clases",
      tip: "Genera un borrador de tus clases respetando disponibilidad, preferencias y lo que el alumno ya tenga ocupado en el conservatorio o fuera. Revísalo y aplícalo. Esas otras ocupaciones se mantienen como las dejaste. Si fijas el horario aquí o en una asignatura, no se recalcula.",
      done: data.assignmentsCount > 0,
      href: "/dashboard",
      hrefLabel: "Auto-agendar",
    },
  ];
}
