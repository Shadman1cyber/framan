"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

const DEMO_ACCOUNTS = [
  { email: "alex@meridian.test", name: "الکس چن", role: "مدیر عملیات" },
  { email: "priya@meridian.test", name: "پریا پتل", role: "سرپرست تدارکات" },
  { email: "sam@meridian.test", name: "سام اورتز", role: "شریک مالی" },
];

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
    <div className="py-16">
      <div className="text-base font-medium">Farman</div>
      <h1 className="mt-6 text-lg">ورود به فضای کاری</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Meridian Roasters · Operations
      </p>

      <form onSubmit={submit} className="mt-6 space-y-4">
        <div>
          <label htmlFor="email" className="text-sm text-neutral-600">
            ایمیل کاری
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            className="mt-1 w-full rounded-md border-[0.5px] border-borders px-3 py-2 text-sm outline-none focus:border-neutral-400"
            required
          />
        </div>
        <div>
          <label htmlFor="password" className="text-sm text-neutral-600">
            گذرواژه
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            className="mt-1 w-full rounded-md border-[0.5px] border-borders px-3 py-2 text-sm outline-none focus:border-neutral-400"
            required
          />
        </div>
        {error ? (
          <p className="rounded-md border-l-2 border-red-600 bg-red-50 px-3 py-2 text-sm text-neutral-700">
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover disabled:opacity-50"
        >
          ورود
        </button>
      </form>

      <p className="mt-4 text-sm text-neutral-500">
        تازه اینجاید؟ 
        <Link href="/signup" className="underline hover:text-neutral-700">
          ساخت حساب
        </Link>
      </p>

      <div className="mt-8 rounded-xl border-[0.5px] border-borders p-4">
        <div className="text-xs text-neutral-400">حساب‌های نمایشی</div>
        <ul className="mt-2 space-y-1 text-sm text-neutral-600">
          {DEMO_ACCOUNTS.map((a) => (
            <li key={a.email}>
              <button
                type="button"
                onClick={() => {
                  setEmail(a.email);
                  setPassword("demo1234");
                }}
                className="underline decoration-neutral-300 hover:text-neutral-900"
              >
                {a.email}
              </button>{" "}
              — {a.name}, {a.role}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-sm text-neutral-400">
          گذرواژهٔ هر سه: demo1234 (برای پرشدن کلیک کنید).
        </p>
      </div>
    </div>
  );
}
