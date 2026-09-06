"use client";
import Link from "next/link";
import Image from "next/image";
import { Price } from "@/components/ui/Price";
import { Rating } from "@/components/ui/Rating";
import { AllergenBadge } from "@/components/ui/Badges";
import type { PublicProduct } from "@/lib/queries";

export function ProductCard({
  product,
  conflictNames,
}: {
  product: PublicProduct;
  conflictNames?: string[];
}) {
  const conflicts = product.allergens.filter((a) =>
    conflictNames?.includes(a.nameFa),
  );
  return (
    <Link
      href={`/product/${product.slug}`}
      className="group flex flex-col overflow-hidden rounded-2xl border border-coffee/10 bg-cream-50 shadow-soft transition-shadow hover:shadow-card"
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-beige">
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
              <AllergenBadge key={a.id} nameFa={a.nameFa} status={a.status} />
            ))}
          </div>
        )}
        <div className="mt-auto flex items-center justify-between pt-1">
          <Price amount={product.price} size="sm" />
          {product.ratingAvg != null && product.ratingCount > 0 && (
            <Rating value={product.ratingAvg} count={product.ratingCount} />
          )}
        </div>
      </div>
    </Link>
  );
}