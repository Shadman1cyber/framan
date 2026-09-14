import { NextResponse } from "next/server";
import { z } from "zod";
import { guard } from "@/lib/api";
import { getAiSettings, setAiEnabled } from "@/lib/ai/settings";

export const dynamic = "force-dynamic";

export async function GET() {
  const g = await guard("ai.use");
  if ("res" in g) return g.res;
  const settings = await getAiSettings();
  return NextResponse.json({ settings });
}

const putSchema = z.object({ enabled: z.boolean() });

export async function PUT(req: Request) {
  const g = await guard("ai.configure");
  if ("res" in g) return g.res;
  const body = await req.json();
  const parsed = putSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "ورودی نامعتبر" }, { status: 400 });
  await setAiEnabled(parsed.data.enabled);
  const settings = await getAiSettings();
  return NextResponse.json({ settings });
}
