import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getSessionUser } from "@/lib/guards";
import { prisma } from "@/lib/db";

const schema = z.object({
  productId: z.string().min(1),
  rating: z.number().int().min(1).max(5),
  review: z.string().max(1000).optional().nullable(),
});

/**
 * Submit a rating. Rule 5: authentication is REQUIRED to submit.
 * Rule 6: viewing ratings (GET) requires no auth.
 */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json(
      { error: "برای ثبت امتیاز ابتدا وارد شوید", code: "AUTH_REQUIRED" },
      { status: 401 },
    );
  }
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "ورودی نامعتبر" }, { status: 400 });

  const product = await prisma.product.findUnique({ where: { id: parsed.data.productId } });
  if (!product) return NextResponse.json({ error: "محصول یافت نشد" }, { status: 404 });

  // One rating per user per product; resubmission updates the existing rating.
  const rating = await prisma.rating.upsert({
    where: { userId_productId: { userId: user.id, productId: parsed.data.productId } },
    create: {
      userId: user.id,
      productId: parsed.data.productId,
      rating: parsed.data.rating,
      review: parsed.data.review?.trim() || null,
    },
    update: {
      rating: parsed.data.rating,
      review: parsed.data.review?.trim() || null,
    },
  });
  return NextResponse.json({ ok: true, id: rating.id });
}

/** Public: list ratings for a product (no auth needed). */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const productId = searchParams.get("productId");
  if (!productId) return NextResponse.json({ error: "productId لازم است" }, { status: 400 });
  const ratings = await prisma.rating.findMany({
    where: { productId },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: { id: true, rating: true, review: true, createdAt: true, user: { select: { name: true } } },
  });
  const avg = ratings.length ? ratings.reduce((s, r) => s + r.rating, 0) / ratings.length : null;
  const user = await getSessionUser();
  const mine = user
    ? await prisma.rating.findUnique({
        where: { userId_productId: { userId: user.id, productId } },
      })
    : null;
  return NextResponse.json({
    average: avg,
    count: ratings.length,
    mine: mine ? { rating: mine.rating, review: mine.review } : null,
    ratings: ratings.map((r) => ({
      id: r.id,
      rating: r.rating,
      review: r.review,
      userName: r.user?.name ?? "کاربر",
      createdAt: r.createdAt.toISOString(),
    })),
  });
}
