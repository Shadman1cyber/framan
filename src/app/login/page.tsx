"use client";
import { signIn, getSession, signOut } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { TopBar } from "@/components/nav/TopBar";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginInner />
    </Suspense>
  );
}

function LoginInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const callbackUrl = sp.get("callbackUrl") ?? "/profile";
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
    const isManagement = role === "ADMIN" || role === "STAFF" || role === "OWNER" || role === "CASHIER";
    if (isManagement) {
      // Don't reveal that this is a staff account — just show generic invalid credentials.
      await signOut({ redirect: false });
      setLoading(false);
      setError("ایمیل یا رمز عبور اشتباه است");
      return;
    }
    setLoading(false);
    router.push(callbackUrl);
    router.refresh();
  }

  return (
    <div>
      <TopBar />
      <main className="mx-auto max-w-md px-4 py-10">
        <h1 className="heading-section mb-6">ورود</h1>
        <form onSubmit={submit} className="space-y-4 rounded-2xl border border-coffee/10 bg-cream-50 p-6 shadow-soft dark:border-dark-border dark:bg-dark-surface dark:shadow-dark-card">
          {error && <p className="text-sm text-danger">{error}</p>}
          <div>
            <label className="label" htmlFor="email">ایمیل</label>
            <input
              id="email"
              type="email"
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>
          <div>
            <label className="label" htmlFor="password">رمز عبور</label>
            <input
              id="password"
              type="password"
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </div>
          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? "در حال ورود..." : "ورود"}
          </button>
          <p className="text-center text-xs text-muted">
            حساب ندارید؟ <a href="/register" className="text-olive-600 hover:underline">ثبت‌نام</a>
          </p>
          <p className="rounded-xl border border-coffee/10 bg-cream p-3 text-center text-xs text-muted dark:border-dark-border dark:bg-dark-surfaceHover">
            برای تست:<br />
            admin@farmans.cafe / admin1234 (مدیر)<br />
            cashier@farmans.cafe / cashier1234 (صندوق‌دار)<br />
            user@farmans.cafe / user1234 (مشتری)
          </p>
        </form>
      </main>
    </div>
  );
}