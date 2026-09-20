"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { JalaliDateTimeInput } from "@/components/ui/JalaliInputs";
import { useToast } from "@/components/ui/Toast";
import { formatNumber } from "@/lib/format";
import { formatJalaliDateTime } from "@/lib/jalali";

type StaffOpt = { id: string; name: string; role: string; task: string | null; isActive: boolean };
type Leave = {
  id: string;
  staffId: string;
  type: string;
  from: string;
  to: string;
  status: string;
  reason: string | null;
  createdAt?: string;
  staff?: { name: string };
};

const STATUS_FA: Record<string, string> = {
  PENDING: "در انتظار بررسی",
  APPROVED: "تأیید شده",
  REJECTED: "رد شده",
};

export function CashierLeavesClient({
  initialStaff,
  initialLeaves,
  initialDeadlineH,
}: {
  initialStaff: StaffOpt[];
  initialLeaves: Leave[];
  initialDeadlineH: number;
}) {
  const { show } = useToast();
  const [staff, setStaff] = useState<StaffOpt[]>(initialStaff);
  const [leaves, setLeaves] = useState<Leave[]>(initialLeaves);
  const [deadlineH, setDeadlineH] = useState(initialDeadlineH);
  const [staffId, setStaffId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState<"ALL" | "PENDING" | "APPROVED" | "REJECTED">("ALL");
  const [staffQuery, setStaffQuery] = useState("");

  const refresh = useCallback(async () => {
    const res = await fetch("/api/admin/leave-requests", { cache: "no-store" }).catch(() => null);
    if (!res?.ok) return;
    const data = (await res.json()) as {
      leaves?: Leave[];
      staff?: StaffOpt[];
      deadlineH?: number;
    };
    if (data.leaves) setLeaves(data.leaves);
    if (data.staff) setStaff(data.staff);
    if (data.deadlineH != null) setDeadlineH(data.deadlineH);
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(refresh, 30_000);
    window.addEventListener("focus", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [refresh]);

  async function submit() {
    if (!staffId) {
      show("ابتدا پرسنل را انتخاب کنید", "error");
      return;
    }
    if (!from || !to) {
      show("تاریخ شروع و پایان را کامل کنید", "error");
      return;
    }
    setSaving(true);
    const res = await fetch("/api/admin/leave-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ staffId, from, to, reason: reason.trim() || null }),
    }).catch(() => null);
    const data = res ? await res.json().catch(() => ({} as { error?: string })) : {};
    setSaving(false);
    if (!res?.ok) {
      show((data as { error?: string }).error ?? "ثبت درخواست انجام نشد", "error");
      return;
    }
    show("درخواست مرخصی برای مدیر ارسال شد", "success");
    setFrom("");
    setTo("");
    setReason("");
    void refresh();
  }

  const activeStaff = useMemo(() => staff.filter((s) => s.isActive), [staff]);

  const visibleLeaves = useMemo(() => {
    const q = staffQuery.trim();
    return leaves.filter((l) => {
      if (filter !== "ALL" && l.status !== filter) return false;
      if (staffId && l.staffId !== staffId) return false;
      if (q) {
        const name = l.staff?.name ?? staff.find((s) => s.id === l.staffId)?.name ?? "";
        if (!name.includes(q)) return false;
      }
      return true;
    });
  }, [leaves, filter, staffId, staffQuery, staff]);

  const pendingCount = useMemo(() => leaves.filter((l) => l.status === "PENDING").length, [leaves]);

  return (
    <div className="space-y-4">
      <div className="card flex flex-wrap items-center justify-between gap-2 p-4">
        <div>
          <p className="text-sm font-bold">🏖️ درخواست مرخصی برای پرسنل</p>
          <p className="mt-0.5 text-xs text-muted">
            درخواست از همین‌جا برای مدیر ارسال می‌شود · {formatNumber(pendingCount)} درخواست در انتظار بررسی
            {" · "}حداقل {formatNumber(deadlineH)} ساعت قبل
          </p>
        </div>
      </div>

      <section className="card space-y-3 p-4">
        <h2 className="text-sm font-bold">ثبت درخواست جدید</h2>
        <div className="grid min-w-0 gap-3 md:grid-cols-2">
          <label className="flex min-w-0 flex-col gap-1 text-xs text-muted">
            <span>پرسنل</span>
            <select className="input min-w-0" value={staffId} onChange={(e) => setStaffId(e.target.value)}>
              <option value="">انتخاب پرسنل…</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id} disabled={!s.isActive}>
                  {s.name}
                  {s.task ? ` · ${s.task}` : ""}
                  {s.isActive ? "" : " (غیرفعال)"}
                </option>
              ))}
            </select>
            {staff.length === 0 && <span className="text-[11px] text-danger">پرسنلی ثبت نشده است.</span>}
          </label>
          <label className="flex min-w-0 flex-col gap-1 text-xs text-muted">
            <span>دلیل (اختیاری)</span>
            <input
              className="input min-w-0"
              maxLength={500}
              placeholder="مثلاً سفر، کار اداری…"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <label className="flex min-w-0 flex-col gap-1 text-xs text-muted">
            <span>از تاریخ و ساعت</span>
            <JalaliDateTimeInput value={from} onChange={setFrom} />
          </label>
          <label className="flex min-w-0 flex-col gap-1 text-xs text-muted">
            <span>تا تاریخ و ساعت</span>
            <JalaliDateTimeInput value={to} onChange={setTo} />
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={submit} disabled={saving || activeStaff.length === 0} className="btn-primary text-xs">
            {saving ? "در حال ارسال…" : "🏖️ ارسال درخواست برای مدیر"}
          </button>
          <span className="text-[11px] text-muted">برای هر یک از پرسنل می‌توانید جداگانه درخواست ثبت کنید.</span>
        </div>
      </section>

      <section className="card space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-bold">سابقه درخواست‌ها ({formatNumber(visibleLeaves.length)})</h2>
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <input
              className="input !w-36 !py-1.5 text-xs"
              placeholder="جست‌وجوی نام پرسنل…"
              value={staffQuery}
              onChange={(e) => setStaffQuery(e.target.value)}
            />
            <select className="input !w-auto !py-1.5 text-xs" value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}>
              <option value="ALL">همه وضعیت‌ها</option>
              <option value="PENDING">در انتظار</option>
              <option value="APPROVED">تأیید شده</option>
              <option value="REJECTED">رد شده</option>
            </select>
            {(staffId || filter !== "ALL" || staffQuery) && (
              <button
                type="button"
                className="btn-ghost text-xs"
                onClick={() => {
                  setStaffId("");
                  setFilter("ALL");
                  setStaffQuery("");
                }}
              >
                پاک کردن فیلتر
              </button>
            )}
          </div>
        </div>

        {visibleLeaves.length === 0 ? (
          <p className="text-xs text-muted">درخواستی ثبت نشده است.</p>
        ) : (
          <ul className="space-y-1.5 text-xs">
            {visibleLeaves.slice(0, 100).map((l) => {
              const staffName = l.staff?.name ?? staff.find((s) => s.id === l.staffId)?.name ?? "—";
              return (
                <li
                  key={l.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-coffee/10 p-2.5 dark:border-dark-border"
                >
                  <div className="min-w-0">
                    <div className="font-semibold">{staffName}</div>
                    <div className="mt-0.5 tabular-nums text-muted">
                      {formatJalaliDateTime(l.from)} تا {formatJalaliDateTime(l.to)}
                      {l.reason ? ` · ${l.reason}` : ""}
                    </div>
                  </div>
                  <span
                    className={
                      l.status === "APPROVED"
                        ? "shrink-0 rounded-full bg-olive/15 px-2.5 py-1 font-semibold text-olive-700 dark:text-olive-300"
                        : l.status === "REJECTED"
                          ? "shrink-0 rounded-full bg-danger/10 px-2.5 py-1 font-semibold text-danger"
                          : "shrink-0 rounded-full bg-warning/15 px-2.5 py-1 font-semibold text-warning"
                    }
                  >
                    {STATUS_FA[l.status] ?? l.status}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
