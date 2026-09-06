"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { useToast } from "@/components/ui/Toast";

export function AdminProductRowActions({ id }: { id: string }) {
  const router = useRouter();
  const { show } = useToast();
  const [busy, setBusy] = useState(false);
  async function del() {
    if (!confirm("حذف محصول؟")) return;
    setBusy(true);
    const res = await fetch(`/api/admin/products/${id}`, { method: "DELETE" });
    setBusy(false);
    if (res.ok) {
      show("محصول حذف شد", "success");
      router.refresh();
    } else show("خطا", "error");
  }
  return (
    <div className="flex gap-2">
      <Link href={`/admin/products/${id}`} className="btn-ghost text-xs">ویرایش</Link>
      <button onClick={del} disabled={busy} className="btn-ghost text-xs text-danger">حذف</button>
    </div>
  );
}