"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { StaffPanel, type StaffOpt } from "@/components/admin/OperationsDashboard";
import { StaffPayAdmin } from "@/components/admin/StaffPayAdmin";
import { useToast } from "@/components/ui/Toast";
import { todayGregorianInput } from "@/lib/jalali";

function shiftGregorian(greg: string, deltaDays: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(greg);
  if (!m) return greg;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) + deltaDays * 86400000);
  const p2 = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}`;
}

/** Client wrapper for the staff page: provides toast + router refresh to StaffPanel. */
export function StaffPanelClient({ initialStaff }: { initialStaff: StaffOpt[] }) {
  const { show } = useToast();
  const router = useRouter();
  const today = todayGregorianInput();
  const [payStaffId, setPayStaffId] = useState<string | null>(null);

  const payStaff = initialStaff.find((s) => s.id === payStaffId) ?? null;

  return (
    <div className="space-y-4">
      <StaffPanel
        from={shiftGregorian(today, -13)}
        to={today}
        initialStaff={initialStaff}
        show={show}
        refresh={() => router.refresh()}
      />

      <section className="card p-4">
        <h2 className="heading-card !text-base">دستمزد و نرخ پرداخت</h2>
        <p className="mt-1 text-xs text-muted">
          نرخ‌های ماهانه/ساعتی به‌صورت پیوسته ثبت می‌شوند؛ تبدیل ماهانه به ساعتی با فرض{" "}
          {220} ساعت کاری در ماه انجام می‌شود و اضافه‌کاری با همین نرخ پرداخت و جدا گزارش می‌گردد.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="text-xs text-muted">
            انتخاب پرسنل
            <select
              className="input mt-1 w-full"
              value={payStaffId ?? ""}
              onChange={(e) => setPayStaffId(e.target.value || null)}
            >
              <option value="">— انتخاب کنید —</option>
              {initialStaff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        {payStaff && (
          <div className="mt-3">
            <StaffPayAdmin staffId={payStaff.id} staffName={payStaff.name} />
          </div>
        )}
      </section>
    </div>
  );
}