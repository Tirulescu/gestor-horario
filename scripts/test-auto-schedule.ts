import assert from "node:assert/strict";
import { mergeIntervals, occupy, splitFree } from "../src/lib/scheduleIntervals";
import { placeIndividualSlot, placeSplitParts, unassignedReason } from "../src/lib/schedulePlacement";
import {
  carveAvailabilityAroundBlocked,
  slotOverlapsBlocked,
  slotWithinAvailable,
  type TimeRange,
} from "../src/lib/studentAvailability";
import { isValidDurationMin, sessionPartsOptions } from "../src/lib/hours";

function canPlaceStudent(
  available: TimeRange[],
  blocked: TimeRange[],
  busy: { day: number; start: number; end: number }[] = [],
) {
  return (day: number, start: number, end: number) => {
    if (!slotWithinAvailable(day, start, end, available)) return false;
    if (slotOverlapsBlocked(day, start, end, blocked)) return false;
    return !busy.some((s) => s.day === day && s.end > start && s.start < end);
  };
}

{
  const merged = mergeIntervals([
    { start: 9, end: 12 },
    { start: 12, end: 15 },
    { start: 16, end: 18 },
  ]);
  assert.deepEqual(merged, [
    { start: 9, end: 15 },
    { start: 16, end: 18 },
  ]);
  console.log("✓ fusiona franjas contiguas del profesor");
}

{
  const free = splitFree([{ start: 9, end: 18 }], { start: 12, end: 13 });
  assert.deepEqual(free, [
    { start: 9, end: 12 },
    { start: 13, end: 18 },
  ]);
  const current: Record<number, { start: number; end: number }[]> = { 0: [{ start: 9, end: 18 }] };
  occupy(current, 0, { start: 12, end: 13 });
  occupy(current, 0, { start: 16, end: 17 });
  assert.deepEqual(current[0], [
    { start: 9, end: 12 },
    { start: 13, end: 16 },
    { start: 17, end: 18 },
  ]);
  console.log("✓ ocupar un hueco no deja solapes en el calendario del profesor");
}

{
  const available: TimeRange[] = [{ day: 0, start: 16, end: 20 }];
  const placed = placeIndividualSlot({
    durationMin: 60,
    requests: [{ dayOfWeek: 0, startHour: 16, endHour: 18, prefOrder: 1 }],
    currentFree: { 0: [{ start: 16, end: 20 }] },
    studentAvailable: available,
    canPlace: canPlaceStudent(available, [], [{ day: 0, start: 16, end: 16.5 }]),
  });
  assert.equal(placed?.day, 0);
  assert.equal(placed?.start, 16.5);
  assert.equal(placed?.end, 17.5);
  assert.equal(placed?.prefOrder, 1);
  console.log("✓ si el inicio de la solicitud está ocupado, prueba el resto de la ventana");
}

{
  const available: TimeRange[] = [{ day: 0, start: 16, end: 19 }];
  const placed = placeIndividualSlot({
    durationMin: 60,
    requests: [
      { dayOfWeek: 0, startHour: 16, endHour: 17, prefOrder: 1 },
      { dayOfWeek: 0, startHour: 18, endHour: 19, prefOrder: 2 },
    ],
    currentFree: { 0: [{ start: 16, end: 19 }] },
    studentAvailable: available,
    canPlace: canPlaceStudent(available, [], [{ day: 0, start: 16, end: 17 }]),
  });
  assert.equal(placed?.start, 18);
  assert.equal(placed?.prefOrder, 2);
  console.log("✓ respeta el orden de las solicitudes del alumno");
}

{
  const available: TimeRange[] = [{ day: 0, start: 10, end: 12 }];
  const placed = placeIndividualSlot({
    durationMin: 60,
    requests: [],
    currentFree: { 0: [{ start: 9, end: 18 }] },
    studentAvailable: available,
    canPlace: canPlaceStudent(available, []),
  });
  assert.equal(placed?.start, 10);
  assert.equal(placed?.end, 11);
  assert.equal(placed?.prefOrder, null);
  console.log("✓ sin solicitudes, coloca solo dentro de la disponibilidad del alumno");
}

{
  const available: TimeRange[] = [{ day: 0, start: 10, end: 12 }];
  const placed = placeIndividualSlot({
    durationMin: 60,
    requests: [{ dayOfWeek: 0, startHour: 16, endHour: 17, prefOrder: 1 }],
    currentFree: { 0: [{ start: 9, end: 18 }] },
    studentAvailable: available,
    canPlace: canPlaceStudent(available, []),
  });
  assert.equal(placed?.start, 10);
  assert.equal(placed?.prefOrder, 0);
  console.log("✓ si la solicitud no cabe, cae a un hueco disponible (no a uno ocupado/fuera)");
}

{
  const available: TimeRange[] = [{ day: 0, start: 10, end: 12 }];
  const placed = placeIndividualSlot({
    durationMin: 60,
    requests: [],
    currentFree: { 0: [{ start: 16, end: 20 }] },
    studentAvailable: available,
    canPlace: canPlaceStudent(available, []),
  });
  assert.equal(placed, null);
  console.log("✓ no coloca fuera de la disponibilidad del alumno");
}

{
  const available: TimeRange[] = [];
  const blocked: TimeRange[] = [{ day: 0, start: 16, end: 17 }];
  const placed = placeIndividualSlot({
    durationMin: 60,
    requests: [{ dayOfWeek: 0, startHour: 16, endHour: 18, prefOrder: 1 }],
    currentFree: { 0: [{ start: 16, end: 20 }] },
    studentAvailable: available,
    canPlace: canPlaceStudent(available, blocked),
  });
  assert.equal(placed?.start, 17);
  assert.equal(placed?.prefOrder, 1);
  console.log("✓ no pisa un bloqueo/evento del alumno; usa el resto de la solicitud");
}

{
  const teacherFree: Record<number, { start: number; end: number }[]> = {
    0: [{ start: 16, end: 19 }],
  };
  occupy(teacherFree, 0, { start: 16, end: 17 });
  const event = { start: 17, end: 18 };
  occupy(teacherFree, 0, event);
  const available: TimeRange[] = [];
  const placed = placeIndividualSlot({
    durationMin: 60,
    requests: [],
    currentFree: teacherFree,
    studentAvailable: available,
    canPlace: canPlaceStudent(available, []),
  });
  assert.equal(placed?.start, 18);
  console.log("✓ no pisa una reserva/evento del profesor");
}

{
  // Escenario Tamara reducido: 11h del profe, 11 alumnos, 3 opciones cada uno.
  // slotsRequired NO debe generar 3 clases: 1 sesión por alumno, P1 se lleva su 1ª opción.
  type Student = {
    name: string;
    priority: number;
    requests: { dayOfWeek: number; startHour: number; endHour: number; prefOrder: number }[];
  };
  const students: Student[] = [
    { name: "Diego", priority: 1, requests: [{ dayOfWeek: 0, startHour: 16, endHour: 18, prefOrder: 1 }, { dayOfWeek: 1, startHour: 16, endHour: 18, prefOrder: 2 }, { dayOfWeek: 2, startHour: 16, endHour: 18, prefOrder: 3 }] },
    { name: "María", priority: 2, requests: [{ dayOfWeek: 2, startHour: 16, endHour: 18, prefOrder: 1 }, { dayOfWeek: 0, startHour: 16, endHour: 18, prefOrder: 2 }, { dayOfWeek: 1, startHour: 17, endHour: 19, prefOrder: 3 }] },
    { name: "Javier", priority: 3, requests: [{ dayOfWeek: 1, startHour: 16, endHour: 18, prefOrder: 1 }, { dayOfWeek: 0, startHour: 16, endHour: 18, prefOrder: 2 }, { dayOfWeek: 2, startHour: 16, endHour: 18, prefOrder: 3 }] },
  ];
  const currentFree: Record<number, { start: number; end: number }[]> = {
    0: [{ start: 16, end: 19 }],
    1: [{ start: 16, end: 20 }],
    2: [{ start: 16, end: 20 }],
  };
  const busy: { day: number; start: number; end: number }[] = [];
  const placed = students
    .sort((a, b) => a.priority - b.priority)
    .map((st) => {
      const slot = placeIndividualSlot({
        durationMin: 60,
        requests: st.requests,
        currentFree,
        studentAvailable: [],
        canPlace: (day, start, end) =>
          !busy.some((s) => s.day === day && s.end > start && s.start < end),
      });
      assert.ok(slot, `${st.name} debía colocarse`);
      busy.push({ day: slot!.day, start: slot!.start, end: slot!.end });
      occupy(currentFree, slot!.day, { start: slot!.start, end: slot!.end });
      return { name: st.name, ...slot! };
    });

  assert.equal(placed.length, 3);
  assert.equal(placed[0]!.name, "Diego");
  assert.equal(placed[0]!.day, 0);
  assert.equal(placed[0]!.start, 16);
  assert.equal(placed[0]!.prefOrder, 1);
  assert.equal(placed[1]!.name, "María");
  assert.equal(placed[1]!.day, 2);
  assert.equal(placed[1]!.start, 16);
  assert.equal(placed[1]!.prefOrder, 1);
  assert.equal(placed[2]!.name, "Javier");
  assert.equal(placed[2]!.day, 1);
  assert.equal(placed[2]!.start, 16);
  assert.equal(placed[2]!.prefOrder, 1);
  for (let i = 0; i < placed.length; i++) {
    for (let j = i + 1; j < placed.length; j++) {
      const a = placed[i]!;
      const b = placed[j]!;
      const overlap = a.day === b.day && a.end > b.start && a.start < b.end;
      assert.equal(overlap, false, `${a.name} pisa a ${b.name}`);
    }
  }
  console.log("✓ greedy por prioridad: 1 clase cada uno, 1ª opción si está libre, sin solapes");
}

{
  assert.equal(
    unassignedReason({ teacherHasAvailability: false, studentAvailable: [] }),
    "sin disponibilidad del profesor",
  );
  assert.equal(
    unassignedReason({
      teacherHasAvailability: true,
      studentAvailable: [{ day: 0, start: 10, end: 12 }],
    }),
    "sin hueco libre dentro de su disponibilidad",
  );
  console.log("✓ motivos de no colocación distinguen disponibilidad");
}

{
  const available: TimeRange[] = [
    { day: 0, start: 10, end: 12 },
    { day: 1, start: 16, end: 18 },
  ];
  const placed = placeSplitParts({
    parts: 2,
    partDurationMin: 30,
    requests: [
      { dayOfWeek: 0, startHour: 10, endHour: 10.5, prefOrder: 1 },
      { dayOfWeek: 1, startHour: 16, endHour: 16.5, prefOrder: 2 },
    ],
    currentFree: {
      0: [{ start: 10, end: 12 }],
      1: [{ start: 16, end: 18 }],
    },
    studentAvailable: available,
    canPlace: canPlaceStudent(available, []),
    separateParts: true,
  });
  assert.equal(placed.length, 2);
  assert.equal(placed[0]!.start, 10);
  assert.equal(placed[0]!.end, 10.5);
  assert.equal(placed[1]!.start, 16);
  assert.equal(placed[1]!.end, 16.5);
  console.log("✓ 2×30 min en días distintos cubren una asignatura de 60");
}

{
  const available: TimeRange[] = [{ day: 0, start: 10, end: 14 }];
  const placed = placeSplitParts({
    parts: 2,
    partDurationMin: 30,
    requests: [],
    currentFree: { 0: [{ start: 10, end: 14 }] },
    studentAvailable: available,
    canPlace: canPlaceStudent(available, []),
    separateParts: true,
  });
  assert.equal(placed.length, 2);
  assert.equal(placed[0]!.start, 10);
  assert.equal(placed[0]!.end, 10.5);
  // La segunda no puede ir pegada (10:30); debe saltar a 11:00
  assert.equal(placed[1]!.start, 11);
  assert.equal(placed[1]!.end, 11.5);
  console.log("✓ las medias horas no se colocan contiguas");
}

{
  const carved = carveAvailabilityAroundBlocked(
    [{ day: 0, start: 10, end: 14 }],
    [{ day: 0, start: 12, end: 13 }],
  );
  assert.deepEqual(carved, [
    { day: 0, start: 10, end: 12 },
    { day: 0, start: 13, end: 14 },
  ]);
  const none = carveAvailabilityAroundBlocked(
    [{ day: 0, start: 12, end: 13 }],
    [{ day: 0, start: 12, end: 13 }],
  );
  assert.deepEqual(none, []);
  console.log("✓ disponibilidad se divide alrededor de un bloqueo");
}

{
  assert.equal(isValidDurationMin(45), false);
  assert.equal(isValidDurationMin(90), true);
  assert.deepEqual(sessionPartsOptions(90), [3]);
  assert.deepEqual(sessionPartsOptions(120), [4]);
  assert.deepEqual(sessionPartsOptions(60), [2]);
  console.log("✓ duraciones múltiplo de 30 y partes que cubren el total");
}

console.log("\nTodos los tests de colocación individual pasaron.");
