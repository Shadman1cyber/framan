import { NextResponse } from "next/server";
import { z } from "zod";
import { guard } from "@/lib/api";
import { OfflineMutationConflict, runIdempotentOfflineMutation } from "@/lib/offline/server";

const schema = z.object({ amount: z.number().int().min(1).max(10000) });
const POINTS_KEY = "LOYALTY_POINTS";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const g = await guard("customers.loyalty", "customers");
  if ("res" in g) return g.res;
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "امتیاز نامعتبر است" }, { status: 400 });

  try {
    const receipt = await runIdempotentOfflineMutation(req, g.user.id, { customerId: params.id, amount: parsed.data.amount }, async (tx) => {
      const customer = await tx.user.findFirst({ where: { id: params.id, role: "CUSTOMER" }, select: { id: true } });
      if (!customer) throw new CustomerPointsError("مشتری یافت نشد", 404);
      const current = await tx.userPreference.findUnique({ where: { userId_key: { userId: params.id, key: POINTS_KEY } } });
      const next = (Number(current?.value ?? 0) || 0) + parsed.data.amount;
      await tx.userPreference.upsert({
        where: { userId_key: { userId: params.id, key: POINTS_KEY } },
        create: { userId: params.id, key: POINTS_KEY, value: String(next) },
        update: { value: String(next) },
      });
      return { body: { points: next } };
    });
    return NextResponse.json(receipt.body, {
      status: receipt.status,
      headers: { "X-Farman-Replayed": receipt.replayed ? "1" : "0" },
    });
  } catch (error) {
    if (error instanceof OfflineMutationConflict) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof CustomerPointsError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "ثبت امتیاز انجام نشد" }, { status: 500 });
  }
}

class CustomerPointsError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}
