import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";

const COOKIE = "farman_session";
const secret = () => process.env.SESSION_SECRET || "farman-dev-secret";

function sign(userId: string): string {
  return createHmac("sha256", secret()).update(userId).digest("hex").slice(0, 32);
}

export function makeToken(userId: string): string {
  return `${userId}.${sign(userId)}`;
}

export function verifyToken(token: string | undefined): string | null {
  if (!token) return null;
  const idx = token.lastIndexOf(".");
  if (idx < 1) return null;
  const userId = token.slice(0, idx);
  const sig = token.slice(idx + 1);
  const expected = sign(userId);
  try {
    if (timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return userId;
  } catch {
    return null;
  }
  return null;
}

export async function setSessionCookie(userId: string) {
  const jar = await cookies();
  jar.set(COOKIE, makeToken(userId), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function clearSessionCookie() {
  const jar = await cookies();
  jar.delete(COOKIE);
}

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: string;
  companyId: string;
  companyName: string;
};

export async function getSession(): Promise<SessionUser | null> {
  const jar = await cookies();
  const userId = verifyToken(jar.get(COOKIE)?.value);
  if (!userId) return null;
  const user = await db.user.findUnique({
    where: { id: userId },
    include: { company: true },
  });
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    companyId: user.companyId,
    companyName: user.company.name,
  };
}

export async function requireSession(): Promise<SessionUser> {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}
