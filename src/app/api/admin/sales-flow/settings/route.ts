import { NextResponse } from "next/server";
import { guard } from "@/lib/api";
import { prisma } from "@/lib/db";
import { z } from "zod";

export const dynamic = "force-dynamic";

const ScheduleSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  startTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/),
  endTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/),
  isEnabled: z.boolean().default(true),
  crossesMidnight: z.boolean().default(false), // Allow schedules that cross midnight
});

const SettingsSchema = z.object({
  granularityMin: z.number().int().positive().max(1440), // Max 24 hours
  timezone: z.string().optional(),
  schedules: z.array(ScheduleSchema),
});

// Valid granularity options (in minutes)
const VALID_GRANULARITIES = [15, 30, 60, 120, 240, 480];

async function getSettings() {
  const settings = await prisma.salesFlowSettings.findFirst({
    include: { schedules: true },
  });

  if (!settings) {
    const defaultSchedules = [
      { dayOfWeek: 0, startTime: "09:00", endTime: "23:00", isEnabled: true, crossesMidnight: false },
      { dayOfWeek: 1, startTime: "09:00", endTime: "23:00", isEnabled: true, crossesMidnight: false },
      { dayOfWeek: 2, startTime: "09:00", endTime: "23:00", isEnabled: true, crossesMidnight: false },
      { dayOfWeek: 3, startTime: "09:00", endTime: "23:00", isEnabled: true, crossesMidnight: false },
      { dayOfWeek: 4, startTime: "09:00", endTime: "23:00", isEnabled: true, crossesMidnight: false },
      { dayOfWeek: 5, startTime: "09:00", endTime: "23:00", isEnabled: true, crossesMidnight: false },
      { dayOfWeek: 6, startTime: "09:00", endTime: "23:00", isEnabled: true, crossesMidnight: false },
    ];

    const created = await prisma.salesFlowSettings.create({
      data: {
        granularityMin: 30,
        timezone: "Asia/Tehran",
        schedules: {
          create: defaultSchedules,
        },
      },
      include: { schedules: true },
    });
    return created;
  }

  return settings;
}

function validateSchedule(
  schedules: { dayOfWeek: number; startTime: string; endTime: string; isEnabled: boolean; crossesMidnight: boolean }[]
): { valid: boolean; error?: string } {
  // Check for duplicate days
  const daySet = new Set<number>();
  for (const s of schedules) {
    if (s.isEnabled) {
      if (daySet.has(s.dayOfWeek)) {
        return { valid: false, error: `برنامه تکراری برای روز ${s.dayOfWeek} یافت شد` };
      }
      daySet.add(s.dayOfWeek);
    }
  }

  // Validate time ranges
  for (const s of schedules) {
    if (!s.isEnabled) continue;

    if (s.startTime === s.endTime) {
      return { valid: false, error: `زمان شروع و پایان نمی‌تواند یکسان باشد برای روز ${s.dayOfWeek}` };
    }

    // For non-midnight-crossing schedules, start must be before end
    if (!s.crossesMidnight && s.startTime >= s.endTime) {
      return { valid: false, error: `زمان شروع باید قبل از زمان پایان باشد برای روز ${s.dayOfWeek}` };
    }

    // For midnight-crossing schedules, start must be after end
    if (s.crossesMidnight && s.startTime <= s.endTime) {
      return { valid: false, error: `برای بازه‌های میان‌شب، زمان شروع باید بعد از پایان باشد برای روز ${s.dayOfWeek}` };
    }
  }

  return { valid: true };
}

function validateGranularity(granularityMin: number): { valid: boolean; error?: string } {
  if (granularityMin <= 0) {
    return { valid: false, error: "دقت زمانی باید مثبت باشد" };
  }
  if (granularityMin > 1440) {
    return { valid: false, error: "دقت زمانی نمی‌تواند بیشتر از ۲۴ ساعت باشد" };
  }
  // Allow custom intervals but warn if not in standard set
  return { valid: true };
}

export async function GET() {
  const g = await guard("finance.view");
  if ("res" in g) return g.res;

  const settings = await getSettings();
  return NextResponse.json(settings);
}

export async function PUT(request: Request) {
  const g = await guard("finance.view");
  if ("res" in g) return g.res;

  try {
    const body = await request.json();
    const parsed = SettingsSchema.parse(body);

    // Validate granularity
    const granularityValidation = validateGranularity(parsed.granularityMin);
    if (!granularityValidation.valid) {
      return NextResponse.json({ error: granularityValidation.error }, { status: 400 });
    }

    // Validate schedules
    const scheduleValidation = validateSchedule(parsed.schedules);
    if (!scheduleValidation.valid) {
      return NextResponse.json({ error: scheduleValidation.error }, { status: 400 });
    }

    // Check for at least one enabled schedule
    const hasEnabledSchedule = parsed.schedules.some((s) => s.isEnabled);
    if (!hasEnabledSchedule) {
      return NextResponse.json(
        { error: "حداقل یک روز باید فعال باشد" },
        { status: 400 }
      );
    }

    // Validate timezone
    const validTimezones = Intl.supportedValuesOf("timeZone");
    const timezone = parsed.timezone ?? "Asia/Tehran";
    if (!validTimezones.includes(timezone)) {
      return NextResponse.json(
        { error: "منطقه زمانی نامعتبر است" },
        { status: 400 }
      );
    }

    const existing = await prisma.salesFlowSettings.findFirst();
    let settings;

    if (existing) {
      await prisma.salesFlowSchedule.deleteMany({
        where: { settingsId: existing.id },
      });

      settings = await prisma.salesFlowSettings.update({
        where: { id: existing.id },
        data: {
          granularityMin: parsed.granularityMin,
          timezone,
          schedules: {
            create: parsed.schedules.map((s) => ({
              dayOfWeek: s.dayOfWeek,
              startTime: s.startTime,
              endTime: s.endTime,
              isEnabled: s.isEnabled,
              crossesMidnight: s.crossesMidnight,
            })),
          },
        },
        include: { schedules: true },
      });
    } else {
      settings = await prisma.salesFlowSettings.create({
        data: {
          granularityMin: parsed.granularityMin,
          timezone,
          schedules: {
            create: parsed.schedules.map((s) => ({
              dayOfWeek: s.dayOfWeek,
              startTime: s.startTime,
              endTime: s.endTime,
              isEnabled: s.isEnabled,
              crossesMidnight: s.crossesMidnight,
            })),
          },
        },
        include: { schedules: true },
      });
    }

    return NextResponse.json(settings);
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.errors }, { status: 400 });
    }
    console.error(e);
    return NextResponse.json({ error: "خطای سرور" }, { status: 500 });
  }
}