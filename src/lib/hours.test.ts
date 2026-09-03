import { describe, expect, it } from "vitest";
import {
  durationPartOptions,
  endHourFromDuration,
  endIfAfterStart,
  SCHEDULE_HOURS_END,
  SCHEDULE_HOURS_START,
} from "./hours";

describe("endIfAfterStart", () => {
  it("conserva el fin si es posterior", () => {
    expect(endIfAfterStart("16", "18")).toBe("18");
    expect(endIfAfterStart("16.5", "17")).toBe("17");
  });

  it("vacía el fin si queda igual o anterior al inicio", () => {
    expect(endIfAfterStart("18", "18")).toBe("");
    expect(endIfAfterStart("19", "18")).toBe("");
    expect(endIfAfterStart("", "18")).toBe("");
    expect(endIfAfterStart("16", "")).toBe("");
  });
});

describe("opciones de hora del calendario", () => {
  it("inicio cubre 7:00–23:00 en pasos de 30 min", () => {
    expect(SCHEDULE_HOURS_START[0]).toEqual({ value: "7", label: "07:00" });
    expect(SCHEDULE_HOURS_START.at(-1)).toEqual({ value: "23", label: "23:00" });
    expect(SCHEDULE_HOURS_START.some((o) => o.value === "16.5")).toBe(true);
  });

  it("fin cubre 7:30–24:00 y no incluye 7:00", () => {
    expect(SCHEDULE_HOURS_END[0]).toEqual({ value: "7.5", label: "07:30" });
    expect(SCHEDULE_HOURS_END.at(-1)).toEqual({ value: "24", label: "24:00" });
    expect(SCHEDULE_HOURS_END.some((o) => o.value === "7")).toBe(false);
  });
});

describe("partes de duración", () => {
  it("60 min admite 30 y 60", () => {
    expect(durationPartOptions(60)).toEqual([30, 60]);
    expect(endHourFromDuration(16, 30)).toBe(16.5);
    expect(endHourFromDuration(16, 60)).toBe(17);
  });
});
