import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { TopBar } from "@/components/nav/TopBar";
import { BottomNav } from "@/components/nav/BottomNav";
import { AllergiesForm } from "@/components/profile/AllergiesForm";

export const dynamic = "force-dynamic";

export default async function AllergiesPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login?callbackUrl=/profile/allergies");
  const userId = (session.user as { id?: string }).id!;
  const [allergens, userAllergies] = await Promise.all([
    prisma.allergen.findMany({ orderBy: { nameFa: "asc" } }),
    prisma.userAllergy.findMany({ where: { userId } }),
  ]);
  return (
    <div className="pb-24">
      <TopBar />
      <main className="mx-auto max-w-2xl px-4 py-6">
        <h1 className="heading-section mb-2">حساسیت‌های من</h1>
        <p className="mb-6 text-sm text-muted">
          با انتخاب حساسیت‌ها، محصولات ناایمن از پیشنهادهای شخصی حذف می‌شوند و در فیلتر ایمن قرار می‌گیرند.
        </p>
        <AllergiesForm allergens={allergens} initial={userAllergies.map((u) => u.allergenId)} />
        <p className="mt-6 rounded-2xl border border-coffee/10 bg-cream-50 p-4 text-xs text-muted">
          سیستم ما فقط ابزار آگاهی است. در صورت حساسیت شدید، مواد تشکیل‌دهنده و شرایط تهیه را با کافه بررسی کنید.
        </p>
      </main>
      <BottomNav />
    </div>
  );
}