"use client";
import { Suspense, useState } from "react";
import { signIn, getSession, signOut } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";

export default function AdminLoginPage() {
  return (
    <Suspense fallback={null}>
      <AdminLoginInner />
    </Suspense>
  );
}

function AdminLoginInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const requestedCallback = sp.get("callbackUrl") ?? "/admin";
  const callbackUrl = /^\/admin(?:\/[^\\?#]*)?(?:\?[^\\#]*)?$/.test(requestedCallback) && !requestedCallback.startsWith("/admin/login")
    ? requestedCallback
    : "/admin";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await signIn("credentials", { email, password, redirect: false });
    if (res?.error) {
      setLoading(false);
      setError("ایمیل یا رمز عبور اشتباه است");
      return;
    }
    const session = await getSession();
    const role = (session?.user as { role?: string } | undefined)?.role;
    // Only staff may pass this door.
    if (role !== "OWNER" && role !== "CASHIER" && role !== "ADMIN" && role !== "STAFF") {
      await signOut({ redirect: false });
      setLoading(false);
      setError("این حساب مشتری است؛ ورود پرسنل فقط با حساب صندوق‌دار یا مدیر مجاز است.");
      return;
    }
    setLoading(false);
    router.push(callbackUrl);
    router.refresh();
  }

  return (
    <main className="admin-login flex min-h-dvh items-center justify-center bg-dark-bg p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <span
            aria-hidden="true"
            className="flex h-14 w-14 items-center justify-center rounded-2xl border border-coffee-light/20 bg-cream text-2xl font-bold text-espresso"
          >
            ف
          </span>
          <h1 className="font-display text-2xl font-semibold text-espresso md:text-3xl">پنل مدیریت کافه ۱۳</h1>
          <p className="text-xs text-espresso/60">
            ورود اختصاصی صندوق‌دار و مدیر کافه
          </p>
        </div>

        <form
          onSubmit={submit}
          className="space-y-4 rounded-3xl border border-coffee-light/30 bg-[#3a2c20] p-6 shadow-elevated dark:border-coffee/25 dark:bg-[#3a2c20] dark:shadow-elevated"
        >
          <div className="flex items-center justify-center gap-2 text-xs font-medium text-espresso/70">
            <span aria-hidden="true">🔐</span>
            <span>ورود پرسنلی</span>
          </div>
          {error && (
            <p className="rounded-xl border border-danger/25 bg-danger/5 px-3 py-2 text-sm text-danger">
              {error}
            </p>
          )}
          <div>
            <label className="label" htmlFor="email">ایمیل</label>
            <input
              id="email"
              type="email"
              className="input !border-coffee-light/25 dark:!bg-dark-surfaceHover"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              dir="ltr"
            />
          </div>
          <div>
            <label className="label" htmlFor="password">رمز عبور</label>
            <input
              id="password"
              type="password"
              className="input !border-coffee-light/25 dark:!bg-dark-surfaceHover"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              dir="ltr"
            />
          </div>
          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? "در حال ورود..." : "ورود به پنل مدیریت"}
          </button>
          <p className="native-customer-link text-center text-[11px] text-muted">
            حساب مشتری دارید؟ از <a href="/login" className="text-olive-600 hover:underline">صفحه ورود مشتریان</a> استفاده کنید.
          </p>
        </form>
      </div>
    </main>
  );
}
