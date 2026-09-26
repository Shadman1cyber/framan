"use client";

import { useEffect, useState } from "react";

type Summary = {
  asOf: string;
  lowStock: { ingredientId: string; name: string; stock: number; unit: string; minStock: number | null }[];
  staffing: { days: number; hours: { hour: number; avgOrders: number; suggested: number }[]; note: string };
};
type Event = { id: string; severity: string; category: string; summary: string; createdAt: string };

export function AgentOperationsSummary() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [events, setEvents] = useState<Event[]>([]);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      const [operations, monitor] = await Promise.all([
        fetch("/api/admin/agent/operations", { cache: "no-store" }).then((r) => r.ok ? r.json() : null).catch(() => null),
        fetch("/api/admin/agent/monitor", { cache: "no-store" }).then((r) => r.ok ? r.json() : null).catch(() => null),
      ]);
      if (alive) { setSummary(operations); setEvents(monitor?.events ?? []); }
    };
    void load();
    const timer = setInterval(() => void load(), 300000);
    return () => { alive = false; clearInterval(timer); };
  }, []);
  return <section className="card mb-6 space-y-3 p-4" aria-label="تحلیل خودکار عملیات">
    <h2 className="text-base font-bold">تحلیل خودکار عملیات</h2>
    {!summary ? <p className="text-sm text-muted">در حال دریافت تحلیل انبار و ساعات پیک…</p> : <>
      <div className="grid gap-3 md:grid-cols-2">
        <div><h3 className="font-semibold">هشدار مواد اولیه</h3>
          {summary.lowStock.length ? <ul className="mt-1 space-y-1 text-sm">{summary.lowStock.map((row) => <li key={row.ingredientId}>⚠️ {row.name}: {row.stock} {row.unit} (حداقل {row.minStock ?? "تعریف‌نشده"})</li>)}</ul> : <p className="text-sm text-muted">ماده‌ای زیر حداقل ثبت‌شده نیست.</p>}
        </div>
        <div><h3 className="font-semibold">ساعات پیک و نیروی پیشنهادی</h3>
          {summary.staffing.hours.length ? <ul className="mt-1 space-y-1 text-sm">{summary.staffing.hours.slice(0, 6).map((row) => <li key={row.hour}>ساعت {row.hour}:۰۰ — میانگین {row.avgOrders} سفارش، {row.suggested} نفر</li>)}</ul> : <p className="text-sm text-muted">برای این بازه دادهٔ سفارش کافی نیست.</p>}
        </div>
      </div>
      <p className="text-xs text-muted">{summary.staffing.note}</p>
    </>}
    <div><h3 className="font-semibold">پایش ایجنت</h3>
      {events.length ? <ul className="mt-1 space-y-1 text-sm">{events.slice(0, 5).map((event) => <li key={event.id}>[{event.severity}] {event.summary}</li>)}</ul> : <p className="text-sm text-muted">هشدار تازه‌ای از ایجنت ناظر ثبت نشده است.</p>}
    </div>
  </section>;
}
