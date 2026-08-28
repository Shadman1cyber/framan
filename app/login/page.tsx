"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!data.ok) {
        setError(data.error ?? "ورود ناموفق بود. دوباره تلاش کنید.");
        return;
      }
      router.push("/");
      router.refresh();
    } catch {
      setError("به سرور دسترسی نشد — بررسی کنید سرور روشن است.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center py-12 px-4 bg-neutral-50">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="text-2xl font-bold text-neutral-900">Farman</div>
          <h1 className="mt-4 text-xl font-semibold text-neutral-900">ورود به فضای کاری</h1>
          <p className="mt-2 text-sm text-neutral-500">Meridian Roasters · Operations</p>
        </div>

        <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-6">
          <form onSubmit={submit} className="space-y-5" noValidate>
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-neutral-700 mb-1.5">
                ایمیل کاری
              </label>
              <div className="relative">
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  autoFocus
                  className="w-full rounded-lg border border-neutral-300 px-4 py-3 text-sm outline-none transition-colors focus:ring-2 focus:ring-brand focus:border-transparent disabled:bg-neutral-50"
                  required
                  placeholder="you@company.com"
                  disabled={busy}
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="password" className="block text-sm font-medium text-neutral-700">
                  گذرواژه
                </label>
                <Link
                  href="/forgot-password"
                  className="text-sm text-brand hover:underline"
                >
                  فراموشی گذرواژه؟
                </Link>
              </div>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  className="w-full rounded-lg border border-neutral-300 px-4 py-3 text-sm outline-none transition-colors focus:ring-2 focus:ring-brand focus:border-transparent disabled:bg-neutral-50 pr-12"
                  required
                  placeholder="••••••••"
                  disabled={busy}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 flex items-center pr-3 text-neutral-400 hover:text-neutral-600 focus:outline-none"
                  aria-label={showPassword ? "مخفی کردن گذرواژه" : "نمایش گذرواژه"}
                  disabled={busy}
                >
                  {showPassword ? (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            <div className="flex items-center">
              <input
                id="remember"
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="w-4 h-4 text-brand border-neutral-300 rounded focus:ring-2 focus:ring-brand focus:ring-offset-2"
                disabled={busy}
              />
              <label htmlFor="remember" className="ml-2 text-sm text-neutral-600 cursor-pointer">
                مرا به خاطر بسپار
              </label>
            </div>

            {error ? (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-center gap-2" role="alert">
                <svg className="w-5 h-5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-6a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 4zm0 10a.75.75 0 01.75.75h.008v.008a.75.75 0 01-1.5 0V14a.75.75 0 01.75-.75h-.008z" clipRule="evenodd" />
                </svg>
                {error}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-lg bg-brand px-4 py-3 text-sm font-semibold text-white hover:bg-brand-hover focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {busy ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  در حال ورود...
                </span>
              ) : (
                "ورود"
              )}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-neutral-500">
            تازه اینجاید؟{" "}
            <Link href="/signup" className="font-medium text-brand hover:underline">
              ساخت حساب
            </Link>
          </p>
        </div>

        <p className="mt-6 text-center text-xs text-neutral-400">
          با ورود، شما با <Link href="/terms" className="underline hover:text-neutral-600">شرایط استفاده</Link>{" "}
          و <Link href="/privacy" className="underline hover:text-neutral-600">حریم خصوصی</Link> موافقت می‌کنید.
        </p>
      </div>
    </div>
  );
}
