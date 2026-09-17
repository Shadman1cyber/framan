"use client";
import { useState } from "react";
import { useToast } from "@/components/ui/Toast";
import { ROLES, ROLE_LABELS_FA, type Role } from "@/lib/constants";

type Row = {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: string;
  orderCount: number;
  ratingCount: number;
  createdAt: string;
};

const ROLE_OPTIONS: Role[] = [ROLES.CUSTOMER, ROLES.CASHIER, ROLES.OWNER];

export function UsersAdmin({ initial }: { initial: Row[] }) {
  const [items, setItems] = useState(initial);
  const { show } = useToast();

  async function setRole(id: string, role: Role) {
    const res = await fetch(`/api/admin/users/${id}/role`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });
    if (res.ok) {
      setItems((xs) => xs.map((u) => (u.id === id ? { ...u, role } : u)));
      show("نقش به‌روزرسانی شد", "success");
    } else {
      const j = await res.json().catch(() => ({}));
      show(j.error ?? "خطا", "error");
    }
  }

  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-beige text-espresso/70 dark:bg-dark-surfaceHover dark:text-dark-textSecondary">
          <tr>
            <th className="p-3 text-right">نام</th>
            <th className="p-3 text-right">ایمیل</th>
            <th className="p-3 text-right">سفارش‌ها</th>
            <th className="p-3 text-right">امتیازها</th>
            <th className="p-3 text-right">نقش</th>
            <th className="p-3 text-right">عضویت</th>
          </tr>
        </thead>
        <tbody>
          {items.map((u) => (
            <tr key={u.id} className="border-t border-coffee/10 dark:border-dark-border">
              <td className="p-3 font-medium">{u.name}</td>
              <td className="p-3 text-muted">{u.email || "-"}</td>
              <td className="p-3 text-muted">{u.orderCount}</td>
              <td className="p-3 text-muted">{u.ratingCount}</td>
              <td className="p-3">
                <select
                  value={ROLE_OPTIONS.includes(u.role as Role) ? u.role : "OWNER"}
                  onChange={(e) => setRole(u.id, e.target.value as Role)}
                  className="rounded-lg border border-coffee/15 bg-cream-50 px-2 py-1 text-xs dark:border-dark-border dark:bg-dark-surface dark:text-dark-text"
                  aria-label={`نقش ${u.name}`}
                >
                  {ROLE_OPTIONS.map((r) => (
                    <option key={r} value={r}>{ROLE_LABELS_FA[r]}</option>
                  ))}
                </select>
              </td>
              <td className="p-3 text-xs text-muted">
                {new Intl.DateTimeFormat("fa-IR", { dateStyle: "short" }).format(new Date(u.createdAt))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
