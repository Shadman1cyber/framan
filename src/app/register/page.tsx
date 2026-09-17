"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { signIn } from "next-auth/react";
import { TopBar } from "@/components/nav/TopBar";

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({ error: "خطا" }));
      setError(j.error ?? "خطا در ثبت‌نام");
      setLoading(false);
      return;
    }
    await signIn("credentials", { email, password, redirect: false });
    setLoading(false);
    router.push("/profile");
  }

  return (
    <div>
      <TopBar />
      <main className="mx-auto max-w-md px-4 py-10">
        <h1 className="heading-section mb-6">ثبت‌نام</h1>
        <form onSubmit={submit} className="space-y-4 rounded-2xl border border-coffee/10 bg-cream-50 p-6 shadow-soft dark:border-dark-border dark:bg-dark-surface dark:shadow-dark-card">
          {error && <p className="text-sm text-danger">{error}</p>}
          <div>
            <label className="label" htmlFor="name">نام</label>
            <input id="name" className="input" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div>
            <label className="label" htmlFor="email">ایمیل</label>
            <input id="email" type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div>
            <label className="label" htmlFor="password">رمز عبور (حداقل ۸ کاراکتر)</label>
            <input
              id="password"
              type="password"
              minLength={8}
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? "در حال ثبت‌نام..." : "ثبت‌نام"}
          </button>
          <p className="text-center text-xs text-muted">
            حساب دارید؟ <a href="/login" className="text-olive-600 hover:underline">ورود</a>
          </p>
        </form>
      </main>
    </div>
  );
}