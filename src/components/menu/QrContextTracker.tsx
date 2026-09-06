"use client";
import { useEffect } from "react";
import { useCart } from "@/components/cart/CartContext";

export function QrContextTracker({
  qrId,
  tableLabel,
}: {
  qrId: string | null;
  tableLabel?: string | null;
}) {
  const { setQrContext } = useCart();

  useEffect(() => {
    if (!qrId) return;
    setQrContext(qrId, tableLabel ?? null);
  }, [qrId, tableLabel, setQrContext]);

  return null;
}