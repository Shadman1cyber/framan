import { NextResponse } from "next/server";
import { guard } from "@/lib/api";
import { prisma } from "@/lib/db";
import { z } from "zod";
import { startOfDay, endOfDay, addMinutes, format, parseISO } from "date-fns";
import { fromZonedTime, toZonedTime, formatInTimeZone } from "date-fns-tz";

export const dynamic = "force-dynamic";

const QuerySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  granularityMin: z.coerce.number().int().positive().optional(),
  range: z.enum(["today", "yesterday", "week", "month", "custom"]).optional(),
});

const REVENUE_STATUSES = ["COMPLETED", "READY", "PREPARING", "CONFIRMED"];

function getRange(range?: string): { from: Date; to: Date } | null {
  const now = new Date();
  const today = startOfDay(now);

  switch (range) {
    case "today":
      return { from: today, to: endOfDay(today) };
    case "yesterday": {
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      return { from: startOfDay(yesterday), to: endOfDay(yesterday) };
    }
    case "week": {
      const weekAgo = new Date(today);
      weekAgo.setDate(weekAgo.getDate() - 6);
      return { from: startOfDay(weekAgo), to: endOfDay(today) };
    }
    case "month": {
      const monthAgo = new Date(today);
      monthAgo.setMonth(monthAgo.getMonth() - 1);
      return { from: startOfDay(monthAgo), to: endOfDay(today) };
    }
    default:
      return null;
  }
}

async function getSettings() {
  return prisma.salesFlowSettings.findFirst({
    include: { schedules: true },
  });
}

interface Schedule {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  isEnabled: boolean;
}

interface Interval {
  start: Date;
  end: Date;
  label: string;
  dayIndex: number;
  dayDate: string; // YYYY-MM-DD for grouping cancelled orders by day
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

      // Handle midnight crossing (e.g., 22:00 to 02:00)
      const crossesMidnight = dayEnd <= dayStart;
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
          const intervalStartZoned = toZonedTime(intervalStart, timezone);
          const actualEndZoned = toZonedTime(actualEnd, timezone);
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

export async function GET(request: Request) {
  const g = await guard("finance.view");
  if ("res" in g) return g.res;

  const { searchParams } = new URL(request.url);
  const parsed = QuerySchema.safeParse({
    from: searchParams.get("from") ?? undefined,
    to: searchParams.get("to") ?? undefined,
    granularityMin: searchParams.get("granularityMin") ?? undefined,
    range: searchParams.get("range") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors }, { status: 400 });
  }

  const { from, to, granularityMin: queryGranularity, range } = parsed.data;

  const settings = await getSettings();
  if (!settings) {
    return NextResponse.json({ error: "تنظیمات فروش پیکربندی نشده است" }, { status: 404 });
  }

  const granularity = queryGranularity ?? settings.granularityMin;
  const timezone = settings.timezone;

  let dateRange: { from: Date; to: Date };

  if (from && to) {
    // Parse dates in the configured timezone
    dateRange = {
      from: fromZonedTime(parseISO(from), timezone),
      to: fromZonedTime(parseISO(to + "T23:59:59.999"), timezone),
    };
  } else if (range) {
    const rg = getRange(range);
    if (!rg) {
      return NextResponse.json({ error: "بازه زمانی نامعتبر" }, { status: 400 });
    }
    dateRange = rg;
  } else {
    dateRange = getRange("today")!;
  }

  const intervals = generateIntervals(
    dateRange.from,
    dateRange.to,
    granularity,
    settings.schedules as Schedule[],
    timezone
  );

  if (intervals.length === 0) {
    return NextResponse.json({
      intervals: [],
      summary: {
        totalOrders: 0,
        totalRevenue: 0,
        totalItems: 0,
        totalCancelled: 0,
        granularity,
        timezone,
        from: dateRange.from.toISOString(),
        to: dateRange.to.toISOString(),
      },
      settings: {
        granularityMin: settings.granularityMin,
        timezone: settings.timezone,
      },
    });
  }

  // Fetch orders in the date range
  const orders = await prisma.order.findMany({
    where: {
      status: { in: REVENUE_STATUSES },
      createdAt: {
        gte: dateRange.from,
        lte: dateRange.to,
      },
    },
    select: {
      id: true,
      total: true,
      createdAt: true,
      status: true,
      _count: { select: { items: true } },
    },
  });

  // Fetch cancelled orders grouped by day (in timezone)
  const cancelledOrders = await prisma.order.groupBy({
    by: ["createdAt"],
    where: {
      status: "CANCELLED",
      createdAt: {
        gte: dateRange.from,
        lte: dateRange.to,
      },
    },
    _count: { id: true },
  });

  // Build a map of cancelled orders per day (YYYY-MM-DD in timezone)
  const cancelledByDay = new Map<string, number>();
  for (const c of cancelledOrders) {
    const dayKey = formatInTimeZone(c.createdAt, timezone, "yyyy-MM-dd");
    cancelledByDay.set(dayKey, (cancelledByDay.get(dayKey) ?? 0) + c._count.id);
  }

  // Initialize interval data map
  const intervalMap = new Map<string, {
    orders: number;
    revenue: number;
    items: number;
    cancelled: number;
    avgOrderValue: number;
  }>();

  for (const interval of intervals) {
    const key = buildIntervalKey(interval);
    intervalMap.set(key, { orders: 0, revenue: 0, items: 0, cancelled: 0, avgOrderValue: 0 });
  }

  // Efficiently assign orders to intervals using binary search
  // Since intervals are sorted by start time, we can use a more efficient approach
  for (const order of orders) {
    const orderTime = order.createdAt.getTime();
    // Binary search for the interval
    let left = 0;
    let right = intervals.length - 1;
    let foundIndex = -1;

    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      const interval = intervals[mid];
      if (orderTime >= interval.start.getTime() && orderTime < interval.end.getTime()) {
        foundIndex = mid;
        break;
      } else if (orderTime < interval.start.getTime()) {
        right = mid - 1;
      } else {
        left = mid + 1;
      }
    }

    if (foundIndex >= 0) {
      const interval = intervals[foundIndex];
      const key = buildIntervalKey(interval);
      const data = intervalMap.get(key);
      if (data) {
        data.orders += 1;
        data.revenue += order.total;
        data.items += order._count.items;
      }
    }
  }

  // Calculate averages and assign cancelled orders to first interval of each day
  const cancelledAssigned = new Set<string>();
  for (const [key, data] of intervalMap.entries()) {
    if (data.orders > 0) {
      data.avgOrderValue = Math.round(data.revenue / data.orders);
    }
    // Assign cancelled orders to the first interval of each day
    const interval = intervals.find(i => buildIntervalKey(i) === key);
    if (interval && !cancelledAssigned.has(interval.dayDate)) {
      data.cancelled = cancelledByDay.get(interval.dayDate) ?? 0;
      cancelledAssigned.add(interval.dayDate);
    }
  }

  const result = intervals.map((interval) => {
    const key = buildIntervalKey(interval);
    const data = intervalMap.get(key) ?? { orders: 0, revenue: 0, items: 0, cancelled: 0, avgOrderValue: 0 };
    return {
      start: interval.start.toISOString(),
      end: interval.end.toISOString(),
      label: interval.label,
      dayIndex: interval.dayIndex,
      dayDate: interval.dayDate,
      orders: data.orders,
      revenue: data.revenue,
      items: data.items,
      avgOrderValue: data.avgOrderValue,
      cancelled: data.cancelled,
    };
  });

  return NextResponse.json({
    intervals: result,
    summary: {
      totalOrders: result.reduce((s, i) => s + i.orders, 0),
      totalRevenue: result.reduce((s, i) => s + i.revenue, 0),
      totalItems: result.reduce((s, i) => s + i.items, 0),
      totalCancelled: result.reduce((s, i) => s + i.cancelled, 0),
      granularity,
      timezone,
      from: dateRange.from.toISOString(),
      to: dateRange.to.toISOString(),
    },
    settings: {
      granularityMin: settings.granularityMin,
      timezone: settings.timezone,
    },
  });
}