import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { LoginForm } from "@/components/login-form";

export default async function LoginPage() {
  const session = await getSession();
  if (session) redirect("/dashboard");

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-[880px] grid md:grid-cols-2 border border-line rounded-2xl overflow-hidden bg-surface shadow-2xl">
        {/* Brand panel */}
        <div className="hidden md:flex flex-col justify-between p-10 bg-raised border-r border-line">
          <div>
            <BrandMark />
            <p className="mt-6 text-[15px] leading-relaxed text-ink-dim">
              The AI business execution platform. FARMAN understands intent,
              decides with context, and executes across your operations —
              under your authority.
            </p>
          </div>
          <ul className="space-y-3 text-sm text-ink-dim">
            {[
              "Procurement agent that sources, compares and executes",
              "AI CFO guarding cash flow and budgets",
              "Human-in-the-loop approvals on every consequential action",
            ].map((t) => (
              <li key={t} className="flex gap-2.5 items-start">
                <span className="mt-[7px] h-1.5 w-1.5 rounded-full bg-accent shrink-0" />
                {t}
              </li>
            ))}
          </ul>
        </div>

        {/* Login panel */}
        <div className="p-10 flex flex-col justify-center">
          <div className="md:hidden mb-8"><BrandMark /></div>
          <h1 className="text-xl font-semibold tracking-tight">Sign in to FARMAN</h1>
          <p className="mt-1.5 text-sm text-ink-dim">Demo environment — Zarin Industrial Group</p>
          <LoginForm />
        </div>
      </div>
    </div>
  );
}

function BrandMark() {
  return (
    <div>
      <div className="flex items-baseline gap-3">
        <span className="text-[28px] font-bold tracking-[0.18em] text-ink">FARMAN</span>
        <span className="text-lg text-accent font-semibold" dir="rtl">فرمان</span>
      </div>
      <p className="mt-1 text-xs text-ink-faint tracking-wide uppercase">
        Command → Authority → Execution
      </p>
    </div>
  );
}
