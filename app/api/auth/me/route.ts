import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { getUserById } from "@/lib/users-store";

export const dynamic = "force-dynamic";

export async function GET() {
  const userId = verifySessionToken(
    cookies().get(SESSION_COOKIE)?.value,
  );
  if (!userId) {
    return NextResponse.json({ ok: true, user: null });
  }
  const user = await getUserById(userId);
  return NextResponse.json({ ok: true, user });
}
