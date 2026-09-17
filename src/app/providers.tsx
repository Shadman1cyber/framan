"use client";
import { SessionProvider } from "next-auth/react";
import { CartProvider } from "@/components/cart/CartContext";
import { OfflineProvider } from "@/lib/offline/OfflineContext";
import { ThemeProvider } from "@/lib/ThemeContext";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <ThemeProvider>
        <CartProvider>
          <OfflineProvider>{children}</OfflineProvider>
        </CartProvider>
      </ThemeProvider>
    </SessionProvider>
  );
}