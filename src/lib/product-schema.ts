import { z } from "zod";

export const productSchema = z.object({
  nameFa: z.string().min(1).max(120),
  nameEn: z.string().max(120).optional().nullable(),
  description: z.string().min(1),
  price: z.number().int().nonnegative(),
  categoryId: z.string(),
  isAvailable: z.boolean(),
  isFeatured: z.boolean(),
  // slug/order are generated automatically (Rule 17) — accepted but optional
  slug: z.string().max(120).optional().nullable(),
  order: z.number().int().optional(),
  prepBaseMin: z.number().int().min(1).max(120).optional(),
  allergenStatus: z.enum(["CONTAINS", "FREE"]),
  image: z.string().optional().nullable().or(z.literal("")),
  images: z
    .array(
      z.object({
        url: z.string().min(1),
        isPrimary: z.boolean().optional(),
      }),
    )
    .max(8)
    .optional(),
  ingredientIds: z.array(z.string()),
  ingredientQuantities: z
    .array(z.object({ ingredientId: z.string(), quantity: z.number(), unit: z.string() }))
    .optional(),
  allergenIds: z.array(z.string()),
  coffeeLines: z
    .array(
      z.object({
        coffeeLineId: z.string(),
        price: z.number().int().nonnegative(),
        isActive: z.boolean().optional(),
      }),
    )
    .optional(),
});
