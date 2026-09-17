import { TopBar } from "@/components/nav/TopBar";
import { BottomNav } from "@/components/nav/BottomNav";
import { LogoutButton } from "@/components/ui/LogoutButton";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import Link from "next/link";
import { normalizeRole, isManagement } from "@/lib/constants";
import { ThemeSwitcher } from "@/components/profile/ThemeSwitcher";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const session = await getServerSession(authOptions);
  const role = normalizeRole((session?.user as { role?: string } | undefined)?.role);
  const isMgmt = isManagement(role);

  if (!session?.user) {
    return (
      <div className="pb-24">
        <TopBar />
        <main className="mx-auto max-w-md px-4 py-12 text-center">
          <h1 className="heading-section mb-3">حساب کاربری</h1>
          <p className="mb-6 text-sm text-muted">
            برای مدیریت آلرژی‌ها و ترجیحات، وارد شوید.
          </p>
          <Link href="/login" className="btn-primary">ورود</Link>
        </main>
        <BottomNav />
      </div>
    );
  }

  return (
    <div className="pb-24">
      <TopBar />
      <main className="mx-auto max-w-md px-4 py-6">
        <h1 className="heading-section mb-2">{session.user.name ?? "کاربر"}</h1>
        <p className="mb-6 text-sm text-muted">{session.user.email}</p>

        <section className="mb-6">
          <h2 className="heading-card mb-3">نمایش</h2>
          <ThemeSwitcher />
        </section>

        <ul className="space-y-3">
          {isMgmt && (
            <>
              <li>
                <Link href="/admin" className="block rounded-2xl border border-olive/30 bg-olive-50 p-4 hover:shadow-card dark:border-olive/40 dark:bg-olive/20">
                  <span className="font-semibold">پنل مدیریت</span>
                  <span className="block text-xs text-muted">
                    {role === "OWNER" ? "داشبورد، محصولات، انبار، گزارش مالی و دستیار هوشمند" : "مدیریت سفارش‌ها و میزها"}
                  </span>
                </Link>
              </li>
              <li>
                <Link href="/admin/users" className="block rounded-2xl border border-coffee/10 bg-cream-50 p-4 hover:shadow-card dark:border-dark-border dark:bg-dark-surface">
                  <span className="font-semibold">مدیریت کاربران</span>
                  <span className="block text-xs text-muted">مشاهده و تغییر نقش کاربران</span>
                </Link>
              </li>
              <li>
                <Link href="/admin/ai/settings" className="block rounded-2xl border border-coffee/10 bg-cream-50 p-4 hover:shadow-card dark:border-dark-border dark:bg-dark-surface">
                  <span className="font-semibold">تنظیمات هوش مصنوعی</span>
                  <span className="block text-xs text-muted">مدیریت دستیار هوشمند و مهارت‌ها</span>
                </Link>
              </li>
            </>
          )}
          {!isMgmt && (
            <>
              <li>
                <Link href="/profile/allergies" className="block rounded-2xl border border-coffee/10 bg-cream-50 p-4 hover:shadow-card dark:border-dark-border dark:bg-dark-surface">
                  <span className="font-semibold">حساسیت‌ها</span>
                  <span className="block text-xs text-muted">مدیریت آلرژن‌ها</span>
                </Link>
              </li>
              <li>
                <Link href="/profile/preferences" className="block rounded-2xl border border-coffee/10 bg-cream-50 p-4 hover:shadow-card dark:border-dark-border dark:bg-dark-surface">
                  <span className="font-semibold">ترجیحات</span>
                  <span className="block text-xs text-muted">سلیقه‌ی غذایی شما</span>
                </Link>
              </li>
              <li>
                <Link href="/orders" className="block rounded-2xl border border-coffee/10 bg-cream-50 p-4 hover:shadow-card dark:border-dark-border dark:bg-dark-surface">
                  <span className="font-semibold">سفارش‌های من</span>
                </Link>
              </li>
            </>
          )}
        </ul>
        <div className="mt-6">
          <LogoutButton className="btn-secondary w-full" />
        </div>
      </main>
      <BottomNav />
    </div>
  );
}