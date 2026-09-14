"use client";
import { useEffect, useRef } from "react";
import { useCart } from "@/components/cart/CartContext";

export function QrContextTracker({
  qrId,
  tableLabel,
}: {
  qrId: string | null;
  tableLabel?: string | null;
}) {
  const { setQrContext } = useCart();
  const visitedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!qrId) return;
    setQrContext(qrId, tableLabel ?? null);

    // Register the table visit: marks the table occupied and issues the
    // signed table-session cookie required for ordering at this table.
    if (visitedRef.current === qrId) return;
    visitedRef.current = qrId;
    fetch("/api/table-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ qrCode: qrId }),
    }).catch(() => {
      // Non-blocking: ordering will explain if the session is missing.
    });
  }, [qrId, tableLabel, setQrContext]);

  return null;
}
