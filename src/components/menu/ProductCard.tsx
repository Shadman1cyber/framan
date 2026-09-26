"use client";

import Image from "next/image";
import Link from "next/link";
import { useCart } from "@/components/cart/CartContext";
import { AllergenBadge } from "@/components/ui/Badges";
import { Price } from "@/components/ui/Price";
import { QuantitySelector } from "@/components/ui/QuantitySelector";
import { Rating } from "@/components/ui/Rating";
import type { PublicProduct } from "@/lib/queries";

export function ProductCard({
  product,
  conflictNames,
}: {
  product: PublicProduct;
  conflictNames?: string[];
}) {
  const { items, add, decrease } = useCart();
  const coffeeLine = product.coffeeLines[0] ?? null;
  const cartItem = items.find(
    (item) =>
      item.productId === product.id &&
      (item.coffeeLineId ?? null) === (coffeeLine?.id ?? null),
  );
  const quantity = cartItem?.quantity ?? 0;
  const conflicts = product.allergens.filter((a) =>
    conflictNames?.includes(a.nameFa),
  );

  const changeQuantity = (nextQuantity: number) => {
    if (nextQuantity > quantity) {
      add({
        productId: product.id,
        name: product.nameFa,
        price: coffeeLine?.price ?? product.price,
        basePrice: product.price,
        image: product.image ?? undefined,
        coffeeLineId: coffeeLine?.id ?? null,
        coffeeLineName: coffeeLine?.nameFa ?? null,
        quantity: 1,
      });
    } else if (nextQuantity < quantity) {
      decrease(product.id, coffeeLine?.id ?? null);
    }
  };

  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-2xl border border-coffee/10 bg-cream-50 shadow-soft transition-shadow hover:shadow-card dark:border-dark-border dark:bg-dark-surface">
      <Link
        href={`/product/${product.slug}`}
        className="flex flex-1 flex-col focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-olive"
      >
        <div className="relative aspect-[4/3] overflow-hidden bg-beige dark:bg-dark-surfaceHover">
          {product.image ? (
            <Image
              src={product.image}
              alt={product.nameFa}
              fill
              sizes="(max-width: 768px) 50vw, 25vw"
              className="object-cover transition-transform duration-500 group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-4xl text-coffee/40">☕</div>
          )}
        </div>
        <div className="flex flex-1 flex-col gap-2 p-3">
          <div className="flex items-start justify-between gap-2">
            <h3 className="heading-card line-clamp-1">{product.nameFa}</h3>
          </div>
          <p className="line-clamp-2 text-xs text-muted">{product.description}</p>
          {conflicts.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {conflicts.slice(0, 2).map((a) => (
                <AllergenBadge key={a.id} nameFa={a.nameFa} icon={a.icon} />
              ))}
            </div>
          )}
          <div className="mt-auto flex flex-col items-start gap-1.5 pt-1">
            {product.ratingAvg != null && product.ratingCount > 0 && (
              <Rating value={product.ratingAvg} count={product.ratingCount} />
            )}
            <Price amount={coffeeLine?.price ?? product.price} size="sm" />
          </div>
        </div>
      </Link>
      <div className="flex justify-center border-t border-coffee/10 p-2.5 dark:border-dark-border">
        <QuantitySelector
          value={quantity}
          onChange={changeQuantity}
          min={0}
        />
      </div>
    </article>
  );
}