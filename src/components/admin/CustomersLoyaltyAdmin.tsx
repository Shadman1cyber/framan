"use client";

import { useState } from "react";
import { useToast } from "@/components/ui/Toast";
import { useOffline } from "@/lib/offline/OfflineContext";

type Customer = {
  id: string;
  name: string;
  email: string;
  phone: string;
  points: number;
  orderCount: number;
};

export function CustomersLoyaltyAdmin({ initial }: { initial: Customer[] }) {
  const [customers, setCustomers] = useState(initial);
  const [amounts, setAmounts] = useState<Record<string, number>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const { show } = useToast();
  const { mutateAdmin } = useOffline();

  async function addPoints(customer: Customer) {
    const amount = amounts[customer.id] ?? 1;
    if (!Number.isInteger(amount) || amount < 1 || amount > 10000) {
      show("امتیاز باید عددی بین ۱ تا ۱۰٬۰۰۰ باشد", "error");
      return;
    }
    setBusyId(customer.id);
    try {
      const result = await mutateAdmin<{ points: number }>({
        path: `/api/admin/customers/${customer.id}/points`,
        method: "POST",
        body: { amount },
      });
      const points = result.queued ? customer.points + amount : result.data.points;
      setCustomers((items) => items.map((item) => item.id === customer.id ? { ...item, points } : item));
      setAmounts((current) => ({ ...current, [customer.id]: 1 }));
      show(
        result.queued ? `${amount.toLocaleString("fa-IR")} امتیاز آفلاین ذخیره شد` : `${amount.toLocaleString("fa-IR")} امتیاز اضافه شد`,
        "success",
      );
    } catch (error) {
      show(error instanceof Error ? error.message : "ثبت امتیاز انجام نشد", "error");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-3">
      {customers.map((customer) => (
        <div key={customer.id} className="card flex flex-wrap items-center justify-between gap-3 p-4">
          <div>
            <div className="font-semibold">{customer.name}</div>
            <div className="mt-1 text-xs text-muted">{customer.phone || customer.email || "بدون اطلاعات تماس"} · {customer.orderCount.toLocaleString("fa-IR")} سفارش</div>
            <div className="mt-2 text-sm font-bold text-olive">{customer.points.toLocaleString("fa-IR")} امتیاز</div>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              max={10000}
              value={amounts[customer.id] ?? 1}
              onChange={(e) => setAmounts((current) => ({ ...current, [customer.id]: Number(e.target.value) }))}
              className="input w-28"
              aria-label={`امتیاز جدید برای ${customer.name}`}
            />
            <button type="button" disabled={busyId === customer.id} onClick={() => addPoints(customer)} className="btn-primary whitespace-nowrap">افزودن امتیاز</button>
          </div>
        </div>
      ))}
      {customers.length === 0 && <div className="card p-8 text-center text-sm text-muted">هنوز مشتری ثبت‌شده‌ای وجود ندارد.</div>}
    </div>
  );
}
