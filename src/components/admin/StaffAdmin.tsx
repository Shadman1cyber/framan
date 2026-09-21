"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";
import { STAFF_ROLES, STAFF_ROLE_LABELS_FA, type StaffRole } from "@/lib/constants";

export type StaffRow = { id: string; name: string; role: string; isActive: boolean; task?: string | null; shiftStart?: string | null; shiftEnd?: string | null };

export function StaffAdmin({ initial }: { initial: StaffRow[] }) {
  const [items, setItems] = useState(initial);
  const [name, setName] = useState("");
  const [role, setRole] = useState<StaffRole>("CHEF");
  const [task, setTask] = useState("");
  const [shiftStart, setShiftStart] = useState("09:00");
  const [shiftEnd, setShiftEnd] = useState("18:00");
  const { show } = useToast();
  const router = useRouter();

  async function create() {
    if (!name.trim()) return;
    const res = await fetch("/api/admin/staff", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), role, task: task.trim() || null, shiftStart: shiftStart || null, shiftEnd: shiftEnd || null }),
    });
    if (res.ok) {
      setName("");
      setTask("");
      router.refresh();
      show("پرسنل اضافه شد", "success");
    } else show("خطا", "error");
  }

  async function toggle(item: StaffRow) {
    const res = await fetch(`/api/admin/staff/${item.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !item.isActive }),
    });
    if (res.ok) {
      setItems((xs) => xs.map((x) => (x.id === item.id ? { ...x, isActive: !x.isActive } : x)));
      show(item.isActive ? "غیرفعال شد" : "فعال شد", "success");
    }
  }

  async function del(id: string) {
    if (!confirm("حذف پرسنل؟")) return;
    const res = await fetch(`/api/admin/staff/${id}`, { method: "DELETE" });
    if (res.ok) {
      setItems((xs) => xs.filter((x) => x.id !== id));
      show("حذف شد", "success");
    }
  }

  const chefs = items.filter((i) => i.isActive && i.role === "CHEF").length;

  return (
    <div className="space-y-6">
      <div className="card p-4">
        <p className="text-sm text-muted">
          شف‌های فعال برای <span className="font-semibold text-espresso dark:text-dark-text">برآورد زمان آماده‌سازی سفارش‌ها</span> استفاده می‌شوند.
          در حال حاضر <span className="font-semibold text-olive-600 dark:text-olive-300">{chefs} شف فعال</span> دارید.
        </p>
      </div>
      <p className="text-xs text-muted">
        مدیریت کامل تردد، مرخصی و پیشنهاد نیرو در <a href="/admin/operations" className="font-semibold text-olive-600 hover:underline dark:text-olive-300">داشبورد نیازهای عملیات ←</a>
      </p>
      <ul className="space-y-2">
        {items.map((i) => (
          <li key={i.id} className="card flex items-center justify-between p-3">
            <div>
              <div className="font-semibold">{i.name}</div>
              <div className="text-xs text-muted">
                {STAFF_ROLE_LABELS_FA[i.role as StaffRole] ?? i.role}
                {i.task ? ` · ${i.task}` : ""}
                {(i.shiftStart || i.shiftEnd) ? ` · شیفت ${i.shiftStart ?? "—"} تا ${i.shiftEnd ?? "—"}` : ""}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className={`chip ${i.isActive ? "chip-active" : ""}`}>
                {i.isActive ? "فعال" : "غیرفعال"}
              </span>
              <button onClick={() => toggle(i)} className="btn-ghost text-xs">
                {i.isActive ? "غیرفعال‌سازی" : "فعال‌سازی"}
              </button>
              <button onClick={() => del(i.id)} className="btn-ghost text-xs text-danger">حذف</button>
            </div>
          </li>
        ))}
      </ul>
      <div className="card p-4">
        <h2 className="mb-3 text-sm font-semibold">افزودن پرسنل</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <input className="input" placeholder="نام" value={name} onChange={(e) => setName(e.target.value)} />
          <select className="input" value={role} onChange={(e) => setRole(e.target.value as StaffRole)}>
            {STAFF_ROLES.map((r) => (
              <option key={r} value={r}>{STAFF_ROLE_LABELS_FA[r]}</option>
            ))}
          </select>
          <input className="input" placeholder="وظیفه (مثلاً بار سرد، سالن)" value={task} onChange={(e) => setTask(e.target.value)} />
          <div className="flex gap-2">
            <input className="input tabular-nums" type="time" value={shiftStart} onChange={(e) => setShiftStart(e.target.value)} aria-label="شروع شیفت" />
            <input className="input tabular-nums" type="time" value={shiftEnd} onChange={(e) => setShiftEnd(e.target.value)} aria-label="پایان شیفت" />
          </div>
        </div>
        <button onClick={create} className="btn-primary mt-3">ایجاد</button>
      </div>
    </div>
  );
}
