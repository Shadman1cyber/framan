"use client";
import { SessionProvider, useSession, signOut } from "next-auth/react";
import { Capacitor } from "@capacitor/core";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { isManagement } from "@/lib/constants";
import { CartProvider } from "@/components/cart/CartContext";
import { OfflineProvider } from "@/lib/offline/OfflineContext";
import { ThemeProvider } from "@/lib/ThemeContext";

function NativeStaffBoundary({ children }: { children: React.ReactNode }) {
  const [native, setNative] = useState<boolean | null>(null);
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const staff = isManagement((session?.user as { role?: string } | undefined)?.role);
  const login = pathname === "/admin/login";
  const staffPage = pathname === "/admin" || pathname.startsWith("/admin/") || /^\/order\/[^/]+$/.test(pathname);

  useEffect(() => {
    const active = Capacitor.isNativePlatform();
    setNative(active);
    document.documentElement.classList.toggle("native-app", active);
  }, []);

  useEffect(() => {
    if (!native || status === "loading") return;
    if (status === "authenticated" && !staff) {
      void signOut({ callbackUrl: "/admin/login" });
      return;
    }
    if (!staff && !login) router.replace("/admin/login");
    if (staff && (!staffPage || login)) router.replace("/admin");
  }, [native, status, staff, login, staffPage, router]);

  if (native && (status === "loading" || (status === "authenticated" && !staff) || (staff ? !staffPage || login : !login))) {
    return <div className="min-h-dvh bg-cream" role="status" aria-label="در حال بارگذاری" />;
  }
  return children;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <ThemeProvider>
        <CartProvider>
          <OfflineProvider>
            <NativeStaffBoundary>{children}</NativeStaffBoundary>
          </OfflineProvider>
        </CartProvider>
      </ThemeProvider>
    </SessionProvider>
  );
}
