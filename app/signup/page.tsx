"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

const ROLE_OPTIONS = [
  {
    id: "role-director",
    label: "مدیر عملیات",
    hint: "تأیید سفارش‌های تکی تا ۲۵۰٬۰۰۰٬۰۰۰ ریال",
  },
  {
    id: "role-procurement-lead",
    label: "سرپرست تدارکات",
    hint: "تأیید سفارش‌های تکی تا ۵۰٬۰۰۰٬۰۰۰ ریال",
  },
  {
    id: "role-finance-partner",
    label: "شریک مالی",
    hint: "تأیید سفارش‌های تکی تا ۵۰۰٬۰۰۰٬۰۰۰ ریال",
  },
];

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [roleId, setRoleId] = useState("role-procurement-lead");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password, roleId }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!data.ok) {
        setError(data.error ?? "ثبت‌نام ناموفق بود. دوباره تلاش کنید.");
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
      <h1 className="mt-6 text-lg">ساخت حساب شما</h1>
      <p className="mt-1 text-sm text-neutral-500">
        مریدین راسترز · فضای کاری عملیات
      </p>

      <form onSubmit={submit} className="mt-6 space-y-4">
        <div>
          <label htmlFor="name" className="text-sm text-neutral-600">
            نام و نام خانوادگی
          </label>
          <input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
            className="mt-1 w-full rounded-md border-[0.5px] border-borders px-3 py-2 text-sm outline-none focus:border-neutral-400"
            required
          />
        </div>
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
            autoComplete="new-password"
            minLength={8}
            className="mt-1 w-full rounded-md border-[0.5px] border-borders px-3 py-2 text-sm outline-none focus:border-neutral-400"
            required
          />
          <p className="mt-1 text-xs text-neutral-400">حداقل ۸ نویسه.</p>
        </div>
        <div>
          <span className="text-sm text-neutral-600">نقش</span>
          <div className="mt-1 space-y-[0.5px]">
            {ROLE_OPTIONS.map((r) => (
              <label
                key={r.id}
                className={`flex cursor-pointer items-start gap-2 border-[0.5px] px-3 py-2 ${
                  roleId === r.id ? "border-borders bg-surface" : "border-borders"
                }`}
              >
                <input
                  type="radio"
                  name="role"
                  value={r.id}
                  checked={roleId === r.id}
                  onChange={() => setRoleId(r.id)}
                  className="mt-1"
                />
                <span>
                  <span className="block text-sm">{r.label}</span>
                  <span className="block text-xs text-neutral-500">{r.hint}</span>
                </span>
              </label>
            ))}
          </div>
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
          ساخت حساب
        </button>
      </form>

      <p className="mt-4 text-sm text-neutral-500">
        قبلاً حساب ساخته‌اید؟ 
        <Link href="/login" className="underline hover:text-neutral-700">
          ورود
        </Link>
      </p>
    </div>
  );
}
