import { z } from "zod";
import { STAFF_ROLES } from "@/lib/constants";
import { isValidDateKey } from "@/lib/staff-shifts";

const HHMM = /^([01]?\d|2[0-3]):[0-5]\d$/;
const time = z.string().regex(HHMM, "ساعت نامعتبر (HH:mm)");
const dateKey = z.string().refine(isValidDateKey, "تاریخ نامعتبر (YYYY-MM-DD)");

const rotationSlotSchema = z
  .object({
    position: z.number().int().min(0).max(6),
    label: z.string().trim().min(1).max(40),
    shiftStart: time.nullable(),
    shiftEnd: time.nullable(),
  })
  .superRefine((slot, ctx) => {
    if ((slot.shiftStart == null) !== (slot.shiftEnd == null)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "برای هر شیفت، ساعت شروع و پایان باید هر دو مقدار داشته باشند",
        path: [slot.shiftStart == null ? "shiftStart" : "shiftEnd"],
      });
    }
  });

const rotationSchema = z
  .object({
    isEnabled: z.boolean(),
    startDate: dateKey,
    slots: z.array(rotationSlotSchema).min(2).max(7),
  })
  .superRefine((rotation, ctx) => {
    const positions = new Set<number>();
    rotation.slots.forEach((slot, index) => {
      if (positions.has(slot.position)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "ترتیب شیفت‌های چرخشی باید یکتا باشد",
          path: ["slots", index, "position"],
        });
      }
      positions.add(slot.position);
    });
    const ordered = [...rotation.slots].map((slot) => slot.position).sort((a, b) => a - b);
    if (ordered.some((position, index) => position !== index)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "ترتیب شیفت‌های چرخشی باید از صفر پیوسته باشد",
        path: ["slots"],
      });
    }
  });

const staffFields = {
  name: z.string().trim().min(1).max(80),
  role: z.enum(STAFF_ROLES),
  isActive: z.boolean().optional(),
  task: z.string().trim().max(200).optional().nullable(),
  shiftStart: time.optional().nullable(),
  shiftEnd: time.optional().nullable(),
};

export const staffCreateSchema = z
  .object({
    ...staffFields,
    rotation: rotationSchema.optional().nullable(),
  })
  .superRefine((staff, ctx) => {
    if ((staff.shiftStart == null) !== (staff.shiftEnd == null)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "ساعت شروع و پایان باید هر دو مقدار داشته باشند",
        path: [staff.shiftStart == null ? "shiftStart" : "shiftEnd"],
      });
    }
  });

export const staffUpdateSchema = z
  .object({
    name: staffFields.name.optional(),
    role: staffFields.role.optional(),
    isActive: staffFields.isActive,
    task: staffFields.task,
    shiftStart: staffFields.shiftStart,
    shiftEnd: staffFields.shiftEnd,
    rotation: rotationSchema.optional().nullable(),
  })
  .superRefine((staff, ctx) => {
    if (staff.shiftStart !== undefined && staff.shiftEnd !== undefined && ((staff.shiftStart == null) !== (staff.shiftEnd == null))) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "ساعت شروع و پایان باید هر دو مقدار داشته باشند",
        path: [staff.shiftStart == null ? "shiftStart" : "shiftEnd"],
      });
    }
  });
