"use client";
import { useEffect, useMemo, useState } from "react";
import { useCart } from "@/components/cart/CartContext";
import { QuantitySelector } from "@/components/ui/QuantitySelector";
import { useToast } from "@/components/ui/Toast";
import { Price } from "@/components/ui/Price";

export type CoffeeLineOption = { id: string; nameFa: string; price: number };

export function AddToCart({
  product,
}: {
  product: {
    id: string;
    name: string;
    price: number;
    image?: string;
    coffeeLines?: CoffeeLineOption[];
  };
}) {
  const [qty, setQty] = useState(1);
  const [lineId, setLineId] = useState<string | null>(null);
  const { add, setQrContext } = useCart();
  const { show } = useToast();

  const lines = useMemo(() => product.coffeeLines ?? [], [product.coffeeLines]);
  const hasLines = lines.length > 0;
  const selectedLine = useMemo(() => lines.find((l) => l.id === lineId) ?? null, [lines, lineId]);
  const finalPrice = selectedLine ? selectedLine.price : product.price;

  // Default to the first (cheapest) line when the product has coffee lines.
  useEffect(() => {
    if (hasLines && !lineId) setLineId(lines[0].id);
  }, [hasLines, lineId, lines]);

  return (
    <div className="mt-2 space-y-3">
      {hasLines && (
        <fieldset className="rounded-2xl border border-coffee/10 bg-cream-50 p-4">
          <legend className="px-1 text-sm font-semibold text-espresso">انتخاب خط قهوه</legend>
          <div className="flex flex-wrap gap-2">
            {lines.map((l) => {
              const active = l.id === lineId;
              return (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => setLineId(l.id)}
                  aria-pressed={active}
                  className={`flex flex-col items-start gap-0.5 rounded-xl border px-3 py-2 text-right transition-colors ${
                    active
                      ? "border-olive bg-olive/10 text-olive-700"
                      : "border-coffee/15 bg-cream text-espresso/80 hover:bg-beige"
                  }`}
                >
                  <span className="text-sm font-medium">{l.nameFa}</span>
                  <Price amount={l.price} size="sm" className={active ? "text-olive-700" : "text-muted"} />
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-muted">
            نوع دانه‌ی قهوه را انتخاب کنید؛ قیمت بر اساس خط انتخابی محاسبه می‌شود.
          </p>
        </fieldset>
      )}

      <div className="flex items-center gap-3">
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
            add({
              productId: product.id,
              name: product.name,
              price: finalPrice,
              basePrice: product.price,
              image: product.image,
              coffeeLineId: hasLines ? lineId : null,
              coffeeLineName: selectedLine?.nameFa ?? null,
              quantity: qty,
            });
            show(`${product.name} به سبد اضافه شد`, "success");
          }}
        >
          افزودن به سبد
        </button>
      </div>
    </div>
  );
}
