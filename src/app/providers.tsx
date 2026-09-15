"use client";
import { SessionProvider } from "next-auth/react";
import { CartProvider } from "@/components/cart/CartContext";
import { OfflineProvider } from "@/lib/offline/OfflineContext";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <CartProvider>
        <OfflineProvider>{children}</OfflineProvider>
      </CartProvider>
    </SessionProvider>
  );
}