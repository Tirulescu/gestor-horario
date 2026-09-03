import { describe, expect, it } from "vitest";
import { SCHEDULE_HOURS_END, SCHEDULE_HOURS_START } from "./hours";
import {
  carveAvailabilityAroundBlocked,
  getFreeHourSetsForDays,
  getSlotHourSets,
  snapSlotHours,
} from "./studentAvailability";

const teacher = [{ dayOfWeek: 0, startHour: 16, endHour: 20 }];

describe("getSlotHourSets con duración máxima", () => {
  it("el fin solo ofrece partes de 30 min hasta el máximo", () => {
    const { startSet, endSet } = getSlotHourSets(
      0,
      teacher,
      [],
      [],
      SCHEDULE_HOURS_START,
      SCHEDULE_HOURS_END,
      "16",
      60,
    );
    expect(startSet.has("16")).toBe(true);
    expect([...endSet].sort((a, b) => Number(a) - Number(b))).toEqual(["16.5", "17"]);
  });

  it("no deja empezar donde no cabe ni 30 min", () => {
    const { startSet } = getSlotHourSets(
      0,
      [{ dayOfWeek: 0, startHour: 16, endHour: 16.5 }],
      [],
      [],
      SCHEDULE_HOURS_START,
      SCHEDULE_HOURS_END,
      undefined,
      60,
    );
    expect(startSet.has("16")).toBe(true);
    expect(startSet.has("16.5")).toBe(false);
  });
});

describe("getFreeHourSetsForDays", () => {
  it("resta bloqueos y cruza varios días", () => {
    const blocked = [
      { day: 0, start: 10, end: 12 },
      { day: 1, start: 11, end: 13 },
    ];
    const { startSet, endSet } = getFreeHourSetsForDays(
      [0, 1],
      blocked,
      SCHEDULE_HOURS_START,
      SCHEDULE_HOURS_END,
      "9",
    );
    expect(startSet.has("9")).toBe(true);
    expect(startSet.has("11")).toBe(false);
    expect(endSet.has("10")).toBe(true);
    expect(endSet.has("11")).toBe(false);
  });
});

describe("snapSlotHours", () => {
  it("conserva inicio y fin si siguen siendo válidos", () => {
    const snapped = snapSlotHours(
      0,
      teacher,
      [],
      [],
      SCHEDULE_HOURS_START,
      SCHEDULE_HOURS_END,
      "16.5",
      "17.5",
      60,
    );
    expect(snapped).toEqual({ start: "16.5", end: "17.5" });
  });

  it("si el inicio está vacío, toma el primero y el fin de duración completa", () => {
    const snapped = snapSlotHours(
      0,
      teacher,
      [],
      [],
      SCHEDULE_HOURS_START,
      SCHEDULE_HOURS_END,
      "",
      "",
      60,
    );
    expect(snapped.start).toBe("16");
    expect(snapped.end).toBe("17");
  });
});

describe("carveAvailabilityAroundBlocked", () => {
  it("recorta alrededor de un bloqueo y ignora otras asignaturas", () => {
    const available = [{ day: 0, start: 10, end: 14 }];
    expect(
      carveAvailabilityAroundBlocked(available, [
        { day: 0, start: 12, end: 13, kind: "block" },
      ]),
    ).toEqual([
      { day: 0, start: 10, end: 12 },
      { day: 0, start: 13, end: 14 },
    ]);
    expect(
      carveAvailabilityAroundBlocked(available, [
        { day: 0, start: 12, end: 13, kind: "class", title: "Orquesta" },
      ]),
    ).toEqual([{ day: 0, start: 10, end: 14 }]);
  });
});
