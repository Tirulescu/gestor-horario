import assert from "node:assert/strict";
import { endHourFromDuration, fmtRange } from "../src/lib/hours";
import { slotWithinAvailable } from "../src/lib/studentAvailability";
import {
  findBestCollectiveSlot,
  prefScoreForSlot,
  PREF_AVAILABLE,
  PREF_NO_MATCH,
  type CollectiveMember,
} from "../src/lib/collectiveSchedule";
import type { Interval } from "../src/lib/scheduleIntervals";

function makeCanAttend(
  availableByStudent: Record<number, { day: number; start: number; end: number }[]>,
  blockedByStudent: Record<number, { day: number; start: number; end: number }[]> = {},
) {
  return (studentId: number, day: number, start: number, end: number) => {
    const available = availableByStudent[studentId] ?? [];
    const blocked = blockedByStudent[studentId] ?? [];
    if (!slotWithinAvailable(day, start, end, available)) return false;
    if (blocked.some((b) => b.day === day && b.end > start && b.start < end)) return false;
    return true;
  };
}

function member(id: number, priority = 1): CollectiveMember {
  return { studentId: id, studentName: `Alumno ${id}`, priority, requests: [] };
}

// Duración exacta: 90 min desde 10:00 → 11:30
assert.equal(endHourFromDuration(10, 90), 11.5);
assert.equal(fmtRange(10, endHourFromDuration(10, 90)), "10:00–11:30");
console.log("✓ respeta duración exacta de 90 min (1h 30)");

// 45 min no se redondea a 60
assert.equal(endHourFromDuration(10, 45), 10.75);
assert.equal(fmtRange(10, endHourFromDuration(10, 45)), "10:00–10:45");
console.log("✓ respeta duración exacta de 45 min");

// Profesor: Lunes 9-18. 5 alumnos. 3 disponibles 10-14, 2 disponibles 15-18. Duración 90 min.
{
  const members = [1, 2, 3, 4, 5].map((id) => member(id));
  const teacherFree: Record<number, Interval[]> = { 0: [{ start: 9, end: 18 }] };
  const canAttend = makeCanAttend({
    1: [{ day: 0, start: 10, end: 14 }],
    2: [{ day: 0, start: 10, end: 14 }],
    3: [{ day: 0, start: 10, end: 14 }],
    4: [{ day: 0, start: 15, end: 18 }],
    5: [{ day: 0, start: 15, end: 18 }],
  });

  const result = findBestCollectiveSlot(members, 90, teacherFree, canAttend);
  assert.equal(result.fitting.length, 3, "debe elegir el hueco con 3 alumnos, no 2");
  assert.equal(result.slot?.start, 10);
  assert.equal(result.slot?.end, 11.5);
  assert.equal(fmtRange(result.slot!.start, result.slot!.end), "10:00–11:30");
  console.log("✓ maximiza alumnos con sesión de 1h30");
}

// Sin restricción positiva: todos pueden en cualquier hueco del profesor
{
  const members = [1, 2, 3, 4].map((id) => member(id));
  const teacherFree: Record<number, Interval[]> = { 0: [{ start: 10, end: 14 }] };
  const canAttend = makeCanAttend({});

  const result = findBestCollectiveSlot(members, 90, teacherFree, canAttend);
  assert.equal(result.fitting.length, 4);
  assert.equal(result.slot?.end, 11.5);
  console.log("✓ mete a todos con la duración configurada");
}

// Hueco demasiado corto para la duración de la asignatura
{
  const members = [1, 2].map((id) => member(id));
  const teacherFree: Record<number, Interval[]> = { 0: [{ start: 10, end: 11 }] };
  const canAttend = makeCanAttend({});

  const result = findBestCollectiveSlot(members, 90, teacherFree, canAttend);
  assert.equal(result.slot, null);
  console.log("✓ no coloca si el hueco del profesor es menor que la duración de la asignatura");
}

// Duración personalizada 120 min
{
  const members = [1, 2].map((id) => member(id));
  const teacherFree: Record<number, Interval[]> = { 0: [{ start: 9, end: 14 }] };
  const canAttend = makeCanAttend({});

  const result = findBestCollectiveSlot(members, 120, teacherFree, canAttend);
  assert.equal(result.slot?.start, 9);
  assert.equal(result.slot?.end, 11);
  assert.equal(fmtRange(result.slot!.start, result.slot!.end), "09:00–11:00");
  console.log("✓ respeta duración de 120 min configurada en la asignatura");
}

// Sin solicitudes que encajen: usa disponibilidad del alumno como opción implícita
{
  const requests = [{ dayOfWeek: 0, startHour: 8, endHour: 9, prefOrder: 1 }];
  const available = [{ day: 0, start: 10, end: 14 }];
  assert.equal(prefScoreForSlot(requests, 0, 10, 11.5, available), PREF_AVAILABLE);
  assert.equal(prefScoreForSlot(requests, 0, 15, 16.5, available), PREF_NO_MATCH);
  console.log("✓ usa disponibilidad del alumno cuando no hay solicitud que encaje");
}

// Colectiva: prefiere hueco alineado con disponibilidad frente a uno fuera de ella
{
  const members: CollectiveMember[] = [
    {
      studentId: 1,
      studentName: "A1",
      priority: 1,
      requests: [{ dayOfWeek: 0, startHour: 8, endHour: 9, prefOrder: 1 }],
      availableRanges: [{ day: 0, start: 10, end: 14 }],
    },
    {
      studentId: 2,
      studentName: "A2",
      priority: 1,
      requests: [],
      availableRanges: [{ day: 0, start: 10, end: 14 }],
    },
  ];
  const teacherFree: Record<number, Interval[]> = { 0: [{ start: 9, end: 18 }] };
  const canAttend = makeCanAttend({
    1: [{ day: 0, start: 10, end: 14 }],
    2: [{ day: 0, start: 10, end: 14 }],
  });

  const result = findBestCollectiveSlot(members, 90, teacherFree, canAttend);
  assert.equal(result.fitting.length, 2);
  assert.equal(result.slot?.start, 10);
  assert.equal(result.slot?.end, 11.5);
  console.log("✓ colectiva elige hueco dentro de la disponibilidad compartida");
}

// Ante todo: el hueco donde caben más alumnos, aunque el de prioridad 1 no pueda
{
  const members: CollectiveMember[] = [
    member(1, 1),
    member(2, 5),
    member(3, 5),
    member(4, 5),
  ];
  const teacherFree: Record<number, Interval[]> = { 0: [{ start: 9, end: 18 }] };
  const canAttend = makeCanAttend({
    1: [{ day: 0, start: 15, end: 18 }],
    2: [{ day: 0, start: 10, end: 14 }],
    3: [{ day: 0, start: 10, end: 14 }],
    4: [{ day: 0, start: 10, end: 14 }],
  });

  const result = findBestCollectiveSlot(members, 90, teacherFree, canAttend);
  assert.equal(result.fitting.length, 3, "debe elegir el hueco con 3 alumnos, no el de prioridad 1 solo");
  assert.equal(result.slot?.start, 10);
  console.log("✓ colectiva prioriza el mayor número de alumnos disponibles");
}

// A igualdad de asistencia, gana el hueco que cubre mejor a los de mayor prioridad
{
  const members: CollectiveMember[] = [
    member(1, 1),
    member(2, 2),
    member(3, 5),
    member(4, 5),
  ];
  const teacherFree: Record<number, Interval[]> = { 0: [{ start: 9, end: 18 }] };
  const canAttend = makeCanAttend({
    1: [{ day: 0, start: 10, end: 12 }],
    2: [{ day: 0, start: 10, end: 12 }],
    3: [{ day: 0, start: 15, end: 18 }],
    4: [{ day: 0, start: 15, end: 18 }],
  });

  const result = findBestCollectiveSlot(members, 90, teacherFree, canAttend);
  assert.equal(result.fitting.length, 2);
  assert.equal(result.slot?.start, 10);
  assert.ok(result.fitting.some((m) => m.studentId === 1));
  console.log("✓ a igualdad de alumnos, prefiere el hueco con mayor prioridad");
}

// A igualdad de asistencia y prioridad, gana el que mejor casa con solicitudes
{
  const members: CollectiveMember[] = [
    {
      studentId: 1,
      studentName: "A1",
      priority: 1,
      requests: [{ dayOfWeek: 0, startHour: 15, endHour: 17, prefOrder: 1 }],
      availableRanges: [{ day: 0, start: 10, end: 18 }],
    },
    {
      studentId: 2,
      studentName: "A2",
      priority: 1,
      requests: [{ dayOfWeek: 0, startHour: 15, endHour: 17, prefOrder: 1 }],
      availableRanges: [{ day: 0, start: 10, end: 18 }],
    },
  ];
  const teacherFree: Record<number, Interval[]> = { 0: [{ start: 10, end: 18 }] };
  const canAttend = makeCanAttend({
    1: [{ day: 0, start: 10, end: 18 }],
    2: [{ day: 0, start: 10, end: 18 }],
  });

  const result = findBestCollectiveSlot(members, 90, teacherFree, canAttend);
  assert.equal(result.fitting.length, 2);
  assert.equal(result.slot?.start, 15);
  console.log("✓ a igualdad de alumnos y prioridad, prefiere el hueco de las solicitudes");
}

console.log("\nTodos los tests de duración y asignaturas colectivas pasaron.");
