import { prisma } from "@/lib/db";
import { Price } from "@/components/ui/Price";
import Link from "next/link";
import Image from "next/image";
import { AdminProductRowActions } from "@/components/admin/AdminProductRowActions";
import { SectionPage } from "@/components/admin/dashboard/SectionPage";

export const dynamic = "force-dynamic";

export default async function AdminProductsPage() {
  const products = await prisma.product.findMany({
    orderBy: [{ isFeatured: "desc" }, { order: "asc" }],
    select: {
      id: true,
      nameFa: true,
      slug: true,
      price: true,
      image: true,
      isAvailable: true,
      category: { select: { nameFa: true } },
      _count: { select: { ratings: true } },
    },
  });
  return (
    <SectionPage kind="erp" title="محصولات" exclude="/admin/products">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-xs text-dashboard-muted">فهرست محصولات، قیمت، دسته و وضعیت موجودی.</p>
        <Link
          href="/admin/products/new"
          className="module-button-primary inline-flex min-h-9 items-center rounded-full px-4 text-[11px] font-semibold"
        >
          + افزودن محصول
        </Link>
      </div>
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-beige text-espresso/70 dark:bg-dark-surfaceHover dark:text-dark-textSecondary">
            <tr>
              <th className="p-3 text-right">محصول</th>
              <th className="p-3 text-right">دسته</th>
              <th className="p-3 text-right">قیمت</th>
              <th className="p-3 text-right">وضعیت</th>
              <th className="p-3 text-right">امتیاز</th>
              <th className="p-3 text-right">عملیات</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id} className="border-t border-coffee/10 dark:border-dark-border">
                <td className="p-3">
                  <div className="flex items-center gap-3">
                    <div className="relative h-10 w-10 overflow-hidden rounded-lg bg-beige dark:bg-dark-surfaceHover">
                      {p.image && <Image src={p.image} alt={p.nameFa} fill className="object-cover" sizes="40px" />}
                    </div>
                    <div>
                      <div className="font-medium">{p.nameFa}</div>
                      <div className="text-xs text-muted">{p.slug}</div>
                    </div>
                  </div>
                </td>
                <td className="p-3 text-muted">{p.category.nameFa}</td>
                <td className="p-3"><Price amount={p.price} size="sm" /></td>
                <td className="p-3">
                  <span className={p.isAvailable ? "chip" : "chip border-danger/30 text-danger"}>
                    {p.isAvailable ? "موجود" : "ناموجود"}
                  </span>
                </td>
                <td className="p-3 text-muted">{p._count.ratings}</td>
                <td className="p-3">
                  <AdminProductRowActions id={p.id} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionPage>
  );
}