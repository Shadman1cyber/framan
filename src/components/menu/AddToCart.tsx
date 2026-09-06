"use client";
import { useState } from "react";
import { useCart } from "@/components/cart/CartContext";
import { QuantitySelector } from "@/components/ui/QuantitySelector";
import { useToast } from "@/components/ui/Toast";

export function AddToCart({
  product,
}: {
  product: { id: string; name: string; price: number; image?: string };
}) {
  const [qty, setQty] = useState(1);
  const { add, setQrContext } = useCart();
  const { show } = useToast();

  return (
    <div className="mt-2 flex items-center gap-3">
      <QuantitySelector value={qty} onChange={setQty} />
      <button
        type="button"
        className="btn-primary flex-1"
        onClick={() => {
          if (typeof window !== "undefined") {
            const sp = new URLSearchParams(window.location.search);
            const qr = sp.get("qr") ?? sp.get("table");
            if (qr) setQrContext(qr);
          }
          add({ productId: product.id, name: product.name, price: product.price, image: product.image, quantity: qty });
          show(`${product.name} به سبد اضافه شد`, "success");
        }}
      >
        افزودن به سبد
      </button>
    </div>
  );
}