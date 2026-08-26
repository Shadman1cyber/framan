import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createSessionToken, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth";
import { authenticate } from "@/lib/users-store";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let email = "";
  let password = "";
  try {
    const body = (await req.json()) as { email?: unknown; password?: unknown };
    if (typeof body.email === "string") email = body.email;
    if (typeof body.password === "string") password = body.password;
  } catch {
    // fall through
  }

  if (!email || !password) {
    return NextResponse.json(
      { ok: false, error: "Enter both your work email and password." },
      { status: 400 },
    );
  }

  const user = await authenticate(email, password);
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "That email and password combination doesn't match any account." },
      { status: 401 },
    );
  }

  const res = NextResponse.json({ ok: true, user });
  res.cookies.set(SESSION_COOKIE, createSessionToken(user.id), sessionCookieOptions);
  return res;
}
