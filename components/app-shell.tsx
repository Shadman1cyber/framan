"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Nav } from "@/components/nav";
import { UI_VERSION } from "@/lib/version";

const AUTH_PATHS = new Set(["/login", "/signup"]);

export function AppShell({
  user,
  children,
}: {
  user?: { name: string; title: string } | null;
  children: ReactNode;
}) {
  const pathname = usePathname();

  // خودترمیمی: اگر مرورگر باندل قدیمی از نسخهٔ قبل را نگه داشته باشد،
  // یک‌بار صفحه تازه‌سازی می‌شود تا همیشه نسخهٔ فعلی اجرا شود.
  useEffect(() => {
    try {
      if (localStorage.getItem("farman_ui_version") !== UI_VERSION) {
        localStorage.setItem("farman_ui_version", UI_VERSION);
        window.location.reload();
      }
    } catch {
      // حافظه در دسترس نیست — کاری نمی‌کنیم
    }
  }, []);

  // Auth screens stand alone — no workspace chrome until signed in.
  if (AUTH_PATHS.has(pathname)) {
    return (
      <div className="min-h-screen">
        <div className="mx-auto w-full max-w-sm px-6">{children}</div>
      </div>
    );
  }

  return (
    <>
      <Nav user={user} />
      <div className="md:ps-60">
        <div className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b-[0.5px] border-borders bg-white px-4 py-2 sm:px-8">
          <span className="tnum text-xs text-neutral-400">
            فرمان · رابط {UI_VERSION}
          </span>
          {user ? (
            <span className="flex items-center gap-3">
              <span className="text-sm text-neutral-600">
                {user.name} · {user.title}
              </span>
              <button
                onClick={signOut}
                className="rounded-md border-[0.5px] border-borders px-3 py-1 text-sm hover:bg-canvas"
              >
                خروج
              </button>
            </span>
          ) : null}
        </div>
        <main>
          <div className="mx-auto max-w-4xl px-4 py-6 sm:px-8 sm:py-10">{children}</div>
        </main>
      </div>
    </>
  );
}

async function signOut() {
  await fetch("/api/auth/logout", { method: "POST" });
  window.location.href = "/login";
}
