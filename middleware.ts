import { NextRequest, NextResponse } from "next/server";

const SECRET = process.env.AUTH_SECRET || "farman-demo-secret";
const SESSION_COOKIE = "farman_session";
const PUBLIC_PATHS = new Set(["/login", "/signup"]);

function base64urlToBuffer(s: string): ArrayBuffer {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4 ? "=".repeat(4 - (b64.length % 4)) : "";
  const bin = atob(b64 + pad);
  const buf = new ArrayBuffer(bin.length);
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return buf;
}

async function hasValidSession(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return false;
  try {
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(SECRET),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const validSig = await crypto.subtle.verify(
      "HMAC",
      key,
      base64urlToBuffer(sig),
      new TextEncoder().encode(payload),
    );
    if (!validSig) return false;
    const data = JSON.parse(
      new TextDecoder().decode(new Uint8Array(base64urlToBuffer(payload))),
    ) as { uid?: unknown; exp?: unknown };
    return (
      typeof data.uid === "string" &&
      typeof data.exp === "number" &&
      data.exp > Date.now()
    );
  } catch {
    return false;
  }
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const signedIn = await hasValidSession(token);

  if (PUBLIC_PATHS.has(pathname)) {
    if (signedIn) {
      return NextResponse.redirect(new URL("/", req.url));
    }
    // A stale/corrupt cookie must not block the auth screens — clear it.
    if (token) {
      const res = NextResponse.next();
      res.cookies.set(SESSION_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
      return res;
    }
    return NextResponse.next();
  }

  if (!signedIn) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/auth).*)"],
};
