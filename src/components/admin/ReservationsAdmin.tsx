"use client";
import { useMemo, useState } from "react";
import { useToast } from "@/components/ui/Toast";

type Reservation = {
  id: string;
  tableId: string;
  tableNumber: string;
  tableLabel: string | null;
  customerName: string;
  customerPhone: string | null;
  guests: number;
  reservedAt: string;
  durationMin: number;
  status: string;
};

type TableOption = { id: string; number: string; label: string | null };

const STATUS_LABELS: Record<string, string> = {
  RESERVED: "رزرو شده",
  SEATED: "نشسته",
  CANCELLED: "لغو شده",
  NO_SHOW: "مراجعه نشد",
};

const STATUS_STYLES: Record<string, string> = {
  RESERVED: "bg-olive-50 text-olive-600",
  SEATED: "bg-warning/10 text-warning",
  CANCELLED: "bg-coffee/10 text-muted",
  NO_SHOW: "bg-danger/10 text-danger",
};

export function ReservationsAdmin({
  initial,
  tables,
}: {
  initial: Reservation[];
  tables: TableOption[];
}) {
  const [items, setItems] = useState(initial);
  const [form, setForm] = useState({
    tableId: tables[0]?.id ?? "",
    customerName: "",
    customerPhone: "",
    guests: 2,
    date: new Date().toISOString().slice(0, 10),
    time: "19:00",
    durationMin: 60,
  });
  const [busy, setBusy] = useState(false);
  const { show } = useToast();

  function toIso(): string {
    // Interpret date+time as local time.
    const d = new Date(`${form.date}T${form.time}:00`);
    return d.toISOString();
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!form.tableId || !form.customerName.trim()) {
      show("میز و نام مشتری الزامی است", "error");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/admin/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tableId: form.tableId,
          customerName: form.customerName.trim(),
          customerPhone: form.customerPhone || null,
          guests: form.guests,
          reservedAt: toIso(),
          durationMin: form.durationMin,
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "خطا");
      show("رزرو ثبت شد", "success");
      setForm((f) => ({ ...f, customerName: "", customerPhone: "" }));
      await reload();
    } catch (err) {
      show(err instanceof Error ? err.message : "خطا", "error");
    } finally {
      setBusy(false);
    }
  }

  async function reload() {
    const res = await fetch("/api/admin/reservations");
    if (!res.ok) return;
    const j = await res.json();
    setItems(j.reservations ?? []);
  }

  async function setStatus(id: string, status: string) {
    const res = await fetch(`/api/admin/reservations/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (res.ok) {
      setItems((xs) => xs.map((r) => (r.id === id ? { ...r, status } : r)));
      show(
        status === "SEATED" ? "مشتری نشست؛ میز اشغال شد" : `وضعیت: ${STATUS_LABELS[status]}`,
        "success",
      );
    } else show("خطا", "error");
  }

  async function del(id: string) {
    if (!confirm("حذف رزرو؟")) return;
    const res = await fetch(`/api/admin/reservations/${id}`, { method: "DELETE" });
    if (res.ok) {
      setItems((xs) => xs.filter((r) => r.id !== id));
      show("حذف شد", "success");
    }
  }

  const grouped = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const groups: Record<string, Reservation[]> = { امروز: [], آینده: [], گذشته: [] };
    for (const r of items) {
      const d = new Date(r.reservedAt);
      d.setHours(0, 0, 0, 0);
      if (r.status === "CANCELLED" || r.status === "NO_SHOW" || d < today) groups["گذشته"].push(r);
      else if (d.getTime() === today.getTime()) groups["امروز"].push(r);
      else groups["آینده"].push(r);
    }
    // Ascending within active groups, descending for the past.
    groups["گذشته"].sort((a, b) => +new Date(b.reservedAt) - +new Date(a.reservedAt));
    return groups;
  }, [items]);

  return (
    <div className="space-y-6">
      {/* Create form */}
      <form onSubmit={create} className="card p-4">
        <h2 className="mb-3 text-sm font-semibold">رزرو جدید</h2>
        <div className="grid gap-3 md:grid-cols-4">
          <label className="block">
            <span className="label">میز</span>
            <select className="input" value={form.tableId} onChange={(e) => setForm({ ...form, tableId: e.target.value })}>
              {tables.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label ?? `میز ${t.number}`}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="label">نام مشتری</span>
            <input className="input" value={form.customerName} onChange={(e) => setForm({ ...form, customerName: e.target.value })} />
          </label>
          <label className="block">
            <span className="label">شماره تماس (اختیاری)</span>
            <input className="input" dir="ltr" value={form.customerPhone} onChange={(e) => setForm({ ...form, customerPhone: e.target.value })} />
          </label>
          <label className="block">
            <span className="label">تعداد نفرات</span>
            <input type="number" min={1} max={40} className="input" value={form.guests} onChange={(e) => setForm({ ...form, guests: Number(e.target.value) })} />
          </label>
          <label className="block">
            <span className="label">تاریخ</span>
            <input type="date" className="input" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          </label>
          <label className="block">
            <span className="label">ساعت</span>
            <input type="time" className="input" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} />
          </label>
          <label className="block">
            <span className="label">مدت (دقیقه)</span>
            <select className="input" value={form.durationMin} onChange={(e) => setForm({ ...form, durationMin: Number(e.target.value) })}>
              {[30, 60, 90, 120, 180].map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </label>
          <div className="flex items-end">
            <button type="submit" disabled={busy} className="btn-primary w-full">
              {busy ? "..." : "ثبت رزرو"}
            </button>
          </div>
        </div>
      </form>

      {/* Grouped lists */}
      {Object.entries(grouped).map(([group, list]) =>
        list.length === 0 ? null : (
          <section key={group}>
            <h3 className="mb-2 text-sm font-semibold text-espresso">{group}</h3>
            <ul className="space-y-2">
              {list.map((r) => (
                <li key={r.id} className="card flex flex-wrap items-center justify-between gap-3 p-3">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-beige text-sm font-bold text-espresso">
                      {r.tableNumber}
                    </span>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold">{r.customerName}</span>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_STYLES[r.status] ?? ""}`}>
                          {STATUS_LABELS[r.status] ?? r.status}
                        </span>
                      </div>
                      <div className="text-xs text-muted">
                        {new Intl.DateTimeFormat("fa-IR", { dateStyle: "short", timeStyle: "short" }).format(
                          new Date(r.reservedAt),
                        )}{" "}
                        · {r.guests} نفر · {r.durationMin} دقیقه
                        {r.customerPhone ? ` · ${r.customerPhone}` : ""}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {r.status === "RESERVED" && (
                      <>
                        <button onClick={() => setStatus(r.id, "SEATED")} className="btn-secondary text-xs">
                          نشست مشتری
                        </button>
                        <button onClick={() => setStatus(r.id, "NO_SHOW")} className="btn-ghost text-xs">
                          مراجعه نشد
                        </button>
                      </>
                    )}
                    {r.status === "SEATED" && (
                      <button onClick={() => setStatus(r.id, "CANCELLED")} className="btn-ghost text-xs">
                        لغو
                      </button>
                    )}
                    {r.status === "RESERVED" && (
                      <button onClick={() => setStatus(r.id, "CANCELLED")} className="btn-ghost text-xs text-danger">
                        لغو رزرو
                      </button>
                    )}
                    <button onClick={() => del(r.id)} className="btn-ghost text-xs text-danger">حذف</button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ),
      )}
      {items.length === 0 && (
        <div className="card p-8 text-center text-sm text-muted">هنوز رزروی ثبت نشده است.</div>
      )}
    </div>
  );
}
