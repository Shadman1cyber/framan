import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { TopBar } from "@/components/nav/TopBar";
import { BottomNav } from "@/components/nav/BottomNav";
import { PreferencesForm } from "@/components/profile/PreferencesForm";

export const dynamic = "force-dynamic";

export default async function PreferencesPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login?callbackUrl=/profile/preferences");
  const userId = (session.user as { id?: string }).id!;
  const [categories, prefs, userDiet] = await Promise.all([
    prisma.category.findMany({ where: { isActive: true }, orderBy: { order: "asc" } }),
    prisma.userPreference.findMany({ where: { userId } }),
    prisma.userDietaryTag.findMany({
      where: { userId },
      include: { dietaryTag: true },
    }),
  ]);
  const dietaryTags = await prisma.dietaryTag.findMany();
  return (
    <div className="pb-24">
      <TopBar />
      <main className="mx-auto max-w-2xl px-4 py-6">
        <h1 className="heading-section mb-2">ترجیحات من</h1>
        <p className="mb-6 text-sm text-muted">
          سلیقه‌ی غذایی شما بر پیشنهادهای شخصی تاثیر می‌گذارد (پس از بررسی ایمنی).
        </p>
        <PreferencesForm
          categories={categories.map((c) => ({ id: c.id, slug: c.slug, nameFa: c.nameFa }))}
          dietaryTags={dietaryTags.map((d) => ({ id: d.id, key: d.key, nameFa: d.nameFa, icon: d.icon }))}
          initialPrefs={prefs}
          initialDiet={userDiet.map((u) => u.dietaryTagId)}
        />
      </main>
      <BottomNav />
    </div>
  );
}