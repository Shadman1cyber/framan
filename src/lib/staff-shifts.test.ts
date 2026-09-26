import { describe, expect, it } from "vitest";
import { staffCreateSchema, staffUpdateSchema } from "@/lib/staff-api";
import {
  addDaysToDateKey,
  isValidDateKey,
  resolveStaffShift,
  rotationSlotForDate,
  type StaffShiftRotation,
} from "@/lib/staff-shifts";

const rotation: StaffShiftRotation = {
  isEnabled: true,
  startDate: "2026-09-20",
  slots: [
    { position: 2, label: "استراحت", shiftStart: null, shiftEnd: null },
    { position: 0, label: "صبح", shiftStart: "08:00", shiftEnd: "16:00" },
    { position: 1, label: "عصر", shiftStart: "16:00", shiftEnd: "00:00" },
  ],
};

describe("staff date keys", () => {
  it("validates real Gregorian dates", () => {
    expect(isValidDateKey("2026-09-24")).toBe(true);
    expect(isValidDateKey("2026-02-30")).toBe(false);
    expect(isValidDateKey("2026-9-4")).toBe(false);
  });

  it("adds days without local timezone drift", () => {
    expect(addDaysToDateKey("2026-09-30", 1)).toBe("2026-10-01");
    expect(addDaysToDateKey("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("staff shift rotation", () => {
  it("uses each ordered slot and repeats the cycle", () => {
    expect(rotationSlotForDate(rotation, "2026-09-20")?.label).toBe("صبح");
    expect(rotationSlotForDate(rotation, "2026-09-21")?.label).toBe("عصر");
    expect(rotationSlotForDate(rotation, "2026-09-22")?.label).toBe("استراحت");
    expect(rotationSlotForDate(rotation, "2026-09-23")?.label).toBe("صبح");
  });

  it("resolves a day off with no scheduled hours", () => {
    expect(resolveStaffShift("09:00", "18:00", rotation, "2026-09-22")).toEqual({
      shiftStart: null,
      shiftEnd: null,
      label: "استراحت",
      isDayOff: true,
      isRotating: true,
    });
  });

  it("uses fixed hours before the cycle or while disabled", () => {
    expect(resolveStaffShift("09:00", "18:00", rotation, "2026-09-19").label).toBe("ساعت ثابت");
    expect(resolveStaffShift("09:00", "18:00", { ...rotation, isEnabled: false }, "2026-09-20").label).toBe("ساعت ثابت");
  });
});

describe("staff API validation", () => {
  const slots = [
    { position: 0, label: "صبح", shiftStart: "08:00", shiftEnd: "16:00" },
    { position: 1, label: "عصر", shiftStart: "16:00", shiftEnd: "00:00" },
  ];

  it("accepts editable staff fields and a rotation", () => {
    expect(staffCreateSchema.safeParse({
      name: "  سارا احمدی  ",
      role: "WAITER",
      task: "سالن",
      shiftStart: "09:00",
      shiftEnd: "17:00",
      rotation: { isEnabled: true, startDate: "2026-09-24", slots },
    }).success).toBe(true);
  });

  it("rejects partial or duplicate rotation time definitions", () => {
    expect(staffUpdateSchema.safeParse({
      shiftStart: "09:00",
      shiftEnd: null,
    }).success).toBe(false);
    expect(staffUpdateSchema.safeParse({
      rotation: {
        isEnabled: true,
        startDate: "2026-09-24",
        slots: [slots[0], { ...slots[0], label: "تکراری" }],
      },
    }).success).toBe(false);
    expect(staffUpdateSchema.safeParse({
      rotation: {
        isEnabled: true,
        startDate: "2026-09-24",
        slots: [slots[0], { ...slots[1], position: 2 }],
      },
    }).success).toBe(false);
  });
});
