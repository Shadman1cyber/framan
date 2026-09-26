export type StaffShiftSlot = {
  id?: string;
  position: number;
  label: string;
  shiftStart: string | null;
  shiftEnd: string | null;
};

export type StaffShiftRotation = {
  isEnabled: boolean;
  startDate: string;
  slots: StaffShiftSlot[];
};

export type ResolvedStaffShift = {
  shiftStart: string | null;
  shiftEnd: string | null;
  label: string;
  isDayOff: boolean;
  isRotating: boolean;
};

const DAY_MS = 86_400_000;

export function isValidDateKey(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function addDaysToDateKey(value: string, days: number): string {
  if (!isValidDateKey(value)) return value;
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function rotationSlotForDate(
  rotation: StaffShiftRotation | null | undefined,
  date: string,
): StaffShiftSlot | null {
  if (!rotation?.isEnabled || !isValidDateKey(rotation.startDate) || !isValidDateKey(date)) return null;
  if (date < rotation.startDate || rotation.slots.length === 0) return null;
  const start = Date.parse(`${rotation.startDate}T00:00:00Z`);
  const current = Date.parse(`${date}T00:00:00Z`);
  const index = Math.floor((current - start) / DAY_MS) % rotation.slots.length;
  return [...rotation.slots]
    .sort((a, b) => a.position - b.position)
    .find((slot) => slot.position === index) ?? null;
}

export function resolveStaffShift(
  baseStart: string | null | undefined,
  baseEnd: string | null | undefined,
  rotation: StaffShiftRotation | null | undefined,
  date: string,
): ResolvedStaffShift {
  const slot = rotationSlotForDate(rotation, date);
  if (!slot) {
    return {
      shiftStart: baseStart ?? null,
      shiftEnd: baseEnd ?? null,
      label: "ساعت ثابت",
      isDayOff: false,
      isRotating: false,
    };
  }
  const isDayOff = !slot.shiftStart || !slot.shiftEnd;
  return {
    shiftStart: isDayOff ? null : slot.shiftStart,
    shiftEnd: isDayOff ? null : slot.shiftEnd,
    label: slot.label,
    isDayOff,
    isRotating: true,
  };
}
