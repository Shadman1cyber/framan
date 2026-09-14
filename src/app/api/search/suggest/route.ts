import { NextResponse } from "next/server";
import { getSuggestions } from "@/lib/search";

export const dynamic = "force-dynamic";

/** Public search suggestions for the menu autocomplete. */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") ?? "").slice(0, 80);
  if (!q.trim()) return NextResponse.json({ suggestions: [] });
  try {
    const suggestions = await getSuggestions(q, 8);
    return NextResponse.json({ suggestions });
  } catch {
    return NextResponse.json({ suggestions: [] });
  }
}
