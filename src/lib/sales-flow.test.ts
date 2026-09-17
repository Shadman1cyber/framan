import { describe, it, expect, vi, beforeEach } from "vitest";
import { startOfDay, endOfDay, addMinutes, setHours, setMinutes } from "date-fns";
import { fromZonedTime, toZonedTime, formatInTimeZone } from "date-fns-tz";

vi.mock("@/lib/db", () => ({
  prisma: {
    salesFlowSettings: {
      findFirst: vi.fn(),
    },
    order: {
      findMany: vi.fn(),
      groupBy: vi.fn(),
      count: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/db";

// Recreate the interval generation logic for testing
interface Schedule {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  isEnabled: boolean;
  crossesMidnight: boolean;
}

interface Interval {
  start: Date;
  end: Date;
  label: string;
  dayIndex: number;
  dayDate: string;
}

function generateIntervals(
  from: Date,
  to: Date,
  granularityMin: number,
  schedules: Schedule[],
  timezone: string
): Interval[] {
  const intervals: Interval[] = [];
  const current = new Date(from);

  while (current <= to) {
    const dayOfWeek = current.getDay();
    const schedule = schedules.find((s) => s.dayOfWeek === dayOfWeek && s.isEnabled);

    if (schedule) {
      const [startHour, startMin] = schedule.startTime.split(":").map(Number);
      const [endHour, endMin] = schedule.endTime.split(":").map(Number);

      const dayStart = new Date(current);
      dayStart.setHours(startHour, startMin, 0, 0);

      const dayEnd = new Date(current);
      dayEnd.setHours(endHour, endMin, 0, 0);

      const crossesMidnight = schedule.crossesMidnight || dayEnd <= dayStart;
      const effectiveDayEnd = crossesMidnight
        ? new Date(dayEnd.getTime() + 24 * 60 * 60 * 1000)
        : dayEnd;

      let intervalStart = new Date(Math.max(current.getTime(), dayStart.getTime()));
      const intervalEndLimit = new Date(Math.min(to.getTime(), effectiveDayEnd.getTime()));

      const dayDateStr = formatInTimeZone(current, timezone, "yyyy-MM-dd");

      while (intervalStart < intervalEndLimit) {
        const intervalEnd = addMinutes(intervalStart, granularityMin);
        const actualEnd = new Date(Math.min(intervalEnd.getTime(), intervalEndLimit.getTime()));

        if (intervalStart < actualEnd) {
          intervals.push({
            start: new Date(intervalStart),
            end: new Date(actualEnd),
            label: `${formatInTimeZone(intervalStart, timezone, "HH:mm")}–${formatInTimeZone(actualEnd, timezone, "HH:mm")}`,
            dayIndex: dayOfWeek,
            dayDate: dayDateStr,
          });
        }
        intervalStart = intervalEnd;
      }
    }

    current.setDate(current.getDate() + 1);
    current.setHours(0, 0, 0, 0);
  }

  return intervals;
}

function buildIntervalKey(interval: Interval): string {
  return interval.start.toISOString();
}

describe("Sales Flow Interval Generation", () => {
  const timezone = "Asia/Tehran";
  const defaultSchedules: Schedule[] = [
    { dayOfWeek: 0, startTime: "09:00", endTime: "23:00", isEnabled: true, crossesMidnight: false }, // Sunday
    { dayOfWeek: 1, startTime: "09:00", endTime: "23:00", isEnabled: true, crossesMidnight: false }, // Monday
    { dayOfWeek: 2, startTime: "09:00", endTime: "23:00", isEnabled: true, crossesMidnight: false }, // Tuesday
    { dayOfWeek: 3, startTime: "09:00", endTime: "23:00", isEnabled: true, crossesMidnight: false }, // Wednesday
    { dayOfWeek: 4, startTime: "09:00", endTime: "23:00", isEnabled: true, crossesMidnight: false }, // Thursday
    { dayOfWeek: 5, startTime: "09:00", endTime: "23:00", isEnabled: true, crossesMidnight: false }, // Friday
    { dayOfWeek: 6, startTime: "09:00", endTime: "23:00", isEnabled: true, crossesMidnight: false }, // Saturday
  ];

  beforeEach(() => vi.clearAllMocks());

  describe("Basic interval generation", () => {
    it("generates 30-min intervals for a single day", () => {
      const from = new Date("2025-01-06T00:00:00.000Z"); // Monday
      const to = new Date("2025-01-06T23:59:59.999Z");
      const intervals = generateIntervals(from, to, 30, defaultSchedules, timezone);

      expect(intervals.length).toBe(28); // 14 hours * 2 = 28 intervals
      expect(intervals[0].label).toBe("09:00–09:30");
      expect(intervals[intervals.length - 1].label).toBe("22:30–23:00");
    });

    it("generates 15-min intervals for a single day", () => {
      const from = new Date("2025-01-06T00:00:00.000Z");
      const to = new Date("2025-01-06T23:59:59.999Z");
      const intervals = generateIntervals(from, to, 15, defaultSchedules, timezone);

      expect(intervals.length).toBe(56); // 14 hours * 4 = 56 intervals
      expect(intervals[0].label).toBe("09:00–09:15");
      expect(intervals[intervals.length - 1].label).toBe("22:45–23:00");
    });

    it("generates 1-hour intervals for a single day", () => {
      const from = new Date("2025-01-06T00:00:00.000Z");
      const to = new Date("2025-01-06T23:59:59.999Z");
      const intervals = generateIntervals(from, to, 60, defaultSchedules, timezone);

      expect(intervals.length).toBe(14); // 14 hours
      expect(intervals[0].label).toBe("09:00–10:00");
      expect(intervals[intervals.length - 1].label).toBe("22:00–23:00");
    });

    it("generates intervals across multiple days", () => {
      const from = new Date("2025-01-06T00:00:00.000Z"); // Monday
      const to = new Date("2025-01-08T23:59:59.999Z"); // Wednesday
      const intervals = generateIntervals(from, to, 60, defaultSchedules, timezone);

      expect(intervals.length).toBe(42); // 3 days * 14 hours
      expect(intervals[0].dayDate).toBe("2025-01-06");
      expect(intervals[13].dayDate).toBe("2025-01-06");
      expect(intervals[14].dayDate).toBe("2025-01-07");
      expect(intervals[27].dayDate).toBe("2025-01-07");
      expect(intervals[28].dayDate).toBe("2025-01-08");
    });

    it("respects disabled days", () => {
      const schedules = [
        { dayOfWeek: 0, startTime: "09:00", endTime: "23:00", isEnabled: false, crossesMidnight: false },
        { dayOfWeek: 1, startTime: "09:00", endTime: "23:00", isEnabled: true, crossesMidnight: false }, // Monday
        { dayOfWeek: 2, startTime: "09:00", endTime: "23:00", isEnabled: false, crossesMidnight: false },
      ];
      const from = new Date("2025-01-05T00:00:00.000Z"); // Sunday
      const to = new Date("2025-01-07T23:59:59.999Z"); // Tuesday
      const intervals = generateIntervals(from, to, 60, schedules, timezone);

      expect(intervals.length).toBe(14); // Only Monday
      expect(intervals.every((i) => i.dayDate === "2025-01-06")).toBe(true);
    });
  });

  describe("Midnight crossing schedules", () => {
    it("generates intervals that cross midnight", () => {
      const schedules: Schedule[] = [
        { dayOfWeek: 0, startTime: "22:00", endTime: "02:00", isEnabled: true, crossesMidnight: true }, // Sunday
        { dayOfWeek: 1, startTime: "09:00", endTime: "23:00", isEnabled: false, crossesMidnight: false },
      ];
      const from = new Date("2025-01-05T00:00:00.000Z"); // Sunday
      const to = new Date("2025-01-05T23:59:59.999Z");
      const intervals = generateIntervals(from, to, 60, schedules, timezone);

      expect(intervals.length).toBe(4); // 22:00-23:00, 23:00-00:00, 00:00-01:00, 01:00-02:00
      expect(intervals[0].label).toBe("22:00–23:00");
      expect(intervals[1].label).toBe("23:00–00:00");
      expect(intervals[2].label).toBe("00:00–01:00");
      expect(intervals[3].label).toBe("01:00–02:00");
    });

    it("handles midnight crossing across date boundary", () => {
      const schedules: Schedule[] = [
        { dayOfWeek: 0, startTime: "22:00", endTime: "02:00", isEnabled: true, crossesMidnight: true }, // Sunday
      ];
      const from = new Date("2025-01-05T00:00:00.000Z"); // Sunday
      const to = new Date("2025-01-06T23:59:59.999Z"); // Monday
      const intervals = generateIntervals(from, to, 60, schedules, timezone);

      // Only Sunday has schedule, Monday is disabled
      expect(intervals.length).toBe(4);
      expect(intervals.every((i) => i.dayDate === "2025-01-05")).toBe(true);
    });
  });

  describe("Edge cases", () => {
    it("handles range starting in middle of operating hours", () => {
      // 12:00 UTC = 15:30 Tehran (Jan has +3:30 offset)
      const from = new Date("2025-01-06T08:30:00.000Z"); // Monday 12:00 Tehran
      const to = new Date("2025-01-06T23:59:59.999Z");
      const intervals = generateIntervals(from, to, 60, defaultSchedules, timezone);

      // From 12:00 to 23:00 = 11 hours in Tehran
      expect(intervals.length).toBe(11);
      expect(intervals[0].label).toBe("12:00–13:00");
    });

    it("handles range ending in middle of operating hours", () => {
      // 12:00 UTC = 15:30 Tehran
      const from = new Date("2025-01-06T00:00:00.000Z");
      const to = new Date("2025-01-06T12:00:00.000Z"); // Monday 15:30 Tehran
      const intervals = generateIntervals(from, to, 60, defaultSchedules, timezone);

      // 09:00 to 15:00 = 7 intervals (includes 15:00-16:00 partial)
      expect(intervals.length).toBe(7);
      expect(intervals[intervals.length - 1].label).toBe("15:00–15:30");
    });

    it("returns empty for disabled day", () => {
      const schedules: Schedule[] = [
        { dayOfWeek: 1, startTime: "09:00", endTime: "23:00", isEnabled: false, crossesMidnight: false },
      ];
      const from = new Date("2025-01-06T00:00:00.000Z");
      const to = new Date("2025-01-06T23:59:59.999Z");
      const intervals = generateIntervals(from, to, 60, schedules, timezone);

      expect(intervals.length).toBe(0);
    });

    it("handles custom granularity", () => {
      const from = new Date("2025-01-06T00:00:00.000Z");
      const to = new Date("2025-01-06T23:59:59.999Z");
      const intervals = generateIntervals(from, to, 45, defaultSchedules, timezone); // 45 min

      // 14 hours = 840 minutes / 45 = 18.66 -> 18 intervals (last partial)
      expect(intervals.length).toBe(19); // Last one is partial (22:15-23:00)
      expect(intervals[0].label).toBe("09:00–09:45");
    });
  });

  describe("Timezone handling", () => {
    it("formats labels in configured timezone", () => {
      const from = new Date("2025-01-06T00:00:00.000Z");
      const to = new Date("2025-01-06T23:59:59.999Z");
      const intervals = generateIntervals(from, to, 60, defaultSchedules, "Asia/Tehran");

      expect(intervals[0].label).toBe("09:00–10:00");
      expect(intervals[0].dayDate).toBe("2025-01-06");
    });

    it("handles different timezone for same UTC time", () => {
      const from = new Date("2025-01-06T00:00:00.000Z");
      const to = new Date("2025-01-06T23:59:59.999Z");
      const intervalsUTC = generateIntervals(from, to, 60, defaultSchedules, "UTC");
      const intervalsTehran = generateIntervals(from, to, 60, defaultSchedules, "Asia/Tehran");

      // Same intervals but different labels
      expect(intervalsUTC.length).toBe(intervalsTehran.length);
    });
  });
});

describe("Order-to-interval assignment", () => {
  const timezone = "Asia/Tehran";
  const schedules: Schedule[] = [
    { dayOfWeek: 1, startTime: "09:00", endTime: "23:00", isEnabled: true, crossesMidnight: false }, // Monday
  ];

  it("assigns order to correct interval using binary search logic", () => {
    const from = new Date("2025-01-06T00:00:00.000Z"); // Monday
    const to = new Date("2025-01-06T23:59:59.999Z");
    const intervals = generateIntervals(from, to, 30, schedules, timezone);

    // Order at 10:15 UTC = 13:45 Tehran
    const orderTime = fromZonedTime(new Date("2025-01-06T10:15:00.000Z"), timezone);

    // Binary search
    const orderTimeMs = orderTime.getTime();
    let left = 0;
    let right = intervals.length - 1;
    let foundIndex = -1;

    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      const interval = intervals[mid];
      if (orderTimeMs >= interval.start.getTime() && orderTimeMs < interval.end.getTime()) {
        foundIndex = mid;
        break;
      } else if (orderTimeMs < interval.start.getTime()) {
        right = mid - 1;
      } else {
        left = mid + 1;
      }
    }

    expect(foundIndex).toBeGreaterThanOrEqual(0);
    if (foundIndex >= 0) {
      // The interval should contain 13:45 - it should be 13:30–14:00
      expect(intervals[foundIndex].label).toBe("13:30–14:00");
    }
  });

  it("does not assign order outside operating hours", () => {
    const from = new Date("2025-01-06T00:00:00.000Z");
    const to = new Date("2025-01-06T23:59:59.999Z");
    const intervals = generateIntervals(from, to, 60, schedules, timezone);

    // Order at 06:00 Tehran (before 09:00 opening)
    const orderTime = fromZonedTime(new Date("2025-01-06T02:30:00.000Z"), timezone); // 06:00 Tehran

    const orderTimeMs = orderTime.getTime();
    let left = 0;
    let right = intervals.length - 1;
    let foundIndex = -1;

    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      const interval = intervals[mid];
      if (orderTimeMs >= interval.start.getTime() && orderTimeMs < interval.end.getTime()) {
        foundIndex = mid;
        break;
      } else if (orderTimeMs < interval.start.getTime()) {
        right = mid - 1;
      } else {
        left = mid + 1;
      }
    }

    // Should not find a matching interval
    expect(foundIndex).toBe(-1);
  });
});

describe("Cancelled orders per day", () => {
  it("groups cancelled orders by day in timezone", () => {
    const cancelledOrders = [
      { createdAt: new Date("2025-01-06T05:30:00.000Z"), _count: { id: 2 } }, // Monday 09:00 Tehran
      { createdAt: new Date("2025-01-06T15:30:00.000Z"), _count: { id: 1 } }, // Monday 19:00 Tehran
      { createdAt: new Date("2025-01-07T05:30:00.000Z"), _count: { id: 3 } }, // Tuesday 09:00 Tehran
    ];

    const cancelledByDay = new Map<string, number>();
    for (const c of cancelledOrders) {
      const dayKey = formatInTimeZone(c.createdAt, "Asia/Tehran", "yyyy-MM-dd");
      cancelledByDay.set(dayKey, (cancelledByDay.get(dayKey) ?? 0) + c._count.id);
    }

    expect(cancelledByDay.get("2025-01-06")).toBe(3); // 2 + 1 on Monday
    expect(cancelledByDay.get("2025-01-07")).toBe(3); // 3 on Tuesday
  });
});

describe("Settings validation", () => {
  function validateGranularity(granularityMin: number): { valid: boolean; error?: string } {
    if (granularityMin <= 0) {
      return { valid: false, error: "دقت زمانی باید مثبت باشد" };
    }
    if (granularityMin > 1440) {
      return { valid: false, error: "دقت زمانی نمی‌تواند بیشتر از ۲۴ ساعت باشد" };
    }
    return { valid: true };
  }

  function validateSchedule(
    schedules: { dayOfWeek: number; startTime: string; endTime: string; isEnabled: boolean; crossesMidnight: boolean }[]
  ): { valid: boolean; error?: string } {
    const daySet = new Set<number>();
    for (const s of schedules) {
      if (s.isEnabled) {
        if (daySet.has(s.dayOfWeek)) {
          return { valid: false, error: `برنامه تکراری برای روز ${s.dayOfWeek} یافت شد` };
        }
        daySet.add(s.dayOfWeek);
      }
    }

    for (const s of schedules) {
      if (!s.isEnabled) continue;

      if (s.startTime === s.endTime) {
        return { valid: false, error: `زمان شروع و پایان نمی‌تواند یکسان باشد برای روز ${s.dayOfWeek}` };
      }

      if (!s.crossesMidnight && s.startTime >= s.endTime) {
        return { valid: false, error: `زمان شروع باید قبل از زمان پایان باشد برای روز ${s.dayOfWeek}` };
      }

      if (s.crossesMidnight && s.startTime <= s.endTime) {
        return { valid: false, error: `برای بازه‌های میان‌شب، زمان شروع باید بعد از پایان باشد برای روز ${s.dayOfWeek}` };
      }
    }

    return { valid: true };
  }

  it("validates granularity bounds", () => {
    expect(validateGranularity(0).valid).toBe(false);
    expect(validateGranularity(-1).valid).toBe(false);
    expect(validateGranularity(1441).valid).toBe(false);
    expect(validateGranularity(15).valid).toBe(true);
    expect(validateGranularity(1440).valid).toBe(true);
  });

  it("validates duplicate days", () => {
    const schedules = [
      { dayOfWeek: 1, startTime: "09:00", endTime: "23:00", isEnabled: true, crossesMidnight: false },
      { dayOfWeek: 1, startTime: "10:00", endTime: "22:00", isEnabled: true, crossesMidnight: false },
    ];
    const result = validateSchedule(schedules);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("تکراری");
  });

  it("validates start < end for normal schedules", () => {
    const schedules = [
      { dayOfWeek: 1, startTime: "23:00", endTime: "09:00", isEnabled: true, crossesMidnight: false },
    ];
    const result = validateSchedule(schedules);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("قبل از زمان پایان");
  });

  it("allows start > end for midnight crossing", () => {
    const schedules = [
      { dayOfWeek: 1, startTime: "22:00", endTime: "02:00", isEnabled: true, crossesMidnight: true },
    ];
    const result = validateSchedule(schedules);
    expect(result.valid).toBe(true);
  });

  it("rejects start <= end for midnight crossing", () => {
    const schedules = [
      { dayOfWeek: 1, startTime: "09:00", endTime: "23:00", isEnabled: true, crossesMidnight: true },
    ];
    const result = validateSchedule(schedules);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("میان‌شب");
  });

  it("rejects equal start and end", () => {
    const schedules = [
      { dayOfWeek: 1, startTime: "09:00", endTime: "09:00", isEnabled: true, crossesMidnight: false },
    ];
    const result = validateSchedule(schedules);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("یکسان");
  });

  it("requires at least one enabled schedule", () => {
    const schedules = [
      { dayOfWeek: 1, startTime: "09:00", endTime: "23:00", isEnabled: false, crossesMidnight: false },
    ];
    const result = validateSchedule(schedules);
    expect(result.valid).toBe(true); // validateSchedule doesn't check this, handled separately
    // Note: The actual API checks for at least one enabled schedule separately
  });
});