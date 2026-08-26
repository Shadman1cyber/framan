import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createSessionToken, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth";
import { createUser, isValidRoleId } from "@/lib/users-store";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let name = "";
  let email = "";
  let password = "";
  let roleId = "role-procurement-lead";
  try {
    const body = (await req.json()) as {
      name?: unknown;
      email?: unknown;
      password?: unknown;
      roleId?: unknown;
    };
    if (typeof body.name === "string") name = body.name;
    if (typeof body.email === "string") email = body.email;
    if (typeof body.password === "string") password = body.password;
    if (typeof body.roleId === "string" && isValidRoleId(body.roleId)) {
      roleId = body.roleId;
    }
  } catch {
    // fall through
  }

  name = name.trim();
  email = email.trim();

  if (name.length < 2) {
    return NextResponse.json(
      { ok: false, error: "Enter your full name." },
      { status: 400 },
    );
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json(
      { ok: false, error: "Enter a valid work email address." },
      { status: 400 },
    );
  }
  if (password.length < 8) {
    return NextResponse.json(
      { ok: false, error: "Passwords need at least 8 characters." },
      { status: 400 },
    );
  }

  try {
    const user = await createUser({ name, email, password, roleId });
    const res = NextResponse.json({ ok: true, user });
    res.cookies.set(SESSION_COOKIE, createSessionToken(user.id), sessionCookieOptions);
    return res;
  } catch (err) {
    if (err instanceof Error && err.message === "duplicate_email") {
      return NextResponse.json(
        { ok: false, error: "An account with that email already exists — sign in instead." },
        { status: 409 },
      );
    }
    throw err;
  }
}
