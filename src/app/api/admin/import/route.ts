import { NextResponse } from "next/server";
import { z } from "zod";
import { guard } from "@/lib/api";
import { IMPORT_KINDS, buildPreview, detectConflicts, commitImport, type ImportKind } from "@/lib/importer";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const previewSchema = z.object({ kind: z.enum(["PRODUCTS", "INGREDIENTS", "ORDERS", "EXPENSES"]), content: z.string().min(1) });
const commitSchema = z.object({ kind: z.enum(["PRODUCTS", "INGREDIENTS", "ORDERS", "EXPENSES"]), content: z.string().min(1), confirmed: z.literal(true) });

/** Step 1: parse + validate + preview (no DB writes). */
export async function POST(req: Request) {
  const g = await guard("import.run");
  if ("res" in g) return g.res;
  const body = await req.json();
  const parsed = previewSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "ورودی نامعتبر" }, { status: 400 });
  try {
    const preview = await detectConflicts(
      parsed.data.kind as ImportKind,
      buildPreview(parsed.data.kind as ImportKind, parsed.data.content),
    );
    return NextResponse.json({ preview });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

/** Step 2: execute confirmed import. */
export async function PUT(req: Request) {
  const g = await guard("import.run");
  if ("res" in g) return g.res;
  const body = await req.json();
  const parsed = commitSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "ورودی نامعتبر" }, { status: 400 });
  try {
    const report = await commitImport(parsed.data.kind as ImportKind, parsed.data.content);
    return NextResponse.json({ report });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

/** Import history. */
export async function GET() {
  const g = await guard("import.run");
  if ("res" in g) return g.res;
  const jobs = await prisma.importJob.findMany({ orderBy: { createdAt: "desc" }, take: 20 });
  return NextResponse.json({ jobs });
}
