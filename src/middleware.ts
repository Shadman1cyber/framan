import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";

/**
 * Route protection (enforced at the edge, not only in UI):
 *  - /admin/login: staff login page — customers are bounced home, staff to the panel
 *  - /admin/* (panel): staff only; anonymous goes to the staff login page
 *  - /cart, /checkout: management accounts are redirected to /admin
 */
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  const role = (token?.role as string | undefined) ?? null;
  const isManagement = role === "ADMIN" || role === "STAFF" || role === "OWNER" || role === "CASHIER";

  // Staff login page: reachable when anonymous; customers are blocked; staff skip it.
  if (pathname === "/admin/login") {
    if (isManagement) {
      return NextResponse.redirect(new URL("/admin", req.url));
    }
    if (token && !isManagement) {
      return NextResponse.redirect(new URL("/", req.url));
    }
    return NextResponse.next();
  }

  // Management panel: staff only.
  if (pathname.startsWith("/admin")) {
    if (!token) {
      const login = new URL("/admin/login", req.url);
      login.searchParams.set("callbackUrl", pathname);
      return NextResponse.redirect(login);
    }
    if (!isManagement) {
      return NextResponse.redirect(new URL("/", req.url));
    }
  }

  // Management accounts never use the customer shopping flow.
  if ((pathname === "/cart" || pathname === "/checkout") && isManagement) {
    return NextResponse.redirect(new URL("/admin", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/cart", "/checkout"],
};
