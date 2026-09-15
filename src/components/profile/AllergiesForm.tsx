"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";
import { useOffline } from "@/lib/offline/OfflineContext";
import { enqueueAction } from "@/lib/offline/queue";

export function AllergiesForm({
  allergens,
  initial,
}: {
  allergens: Array<{ id: string; nameFa: string; icon: string | null; key: string }>;
  initial: string[];
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set(initial));
  const [saving, setSaving] = useState(false);
  const router = useRouter();
  const { isOnline } = useOffline();
  const { show } = useToast();

  function toggle(id: string) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  async function save() {
    setSaving(true);
    const payload = { allergenIds: Array.from(selected) };
    try {
      if (isOnline) {
        const res = await fetch("/api/profile/allergies", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          show("حساسیت‌ها ذخیره شد", "success");
          router.refresh();
        } else {
          show("خطا در ذخیره", "error");
        }
      } else {
        await enqueueAction({
          type: "UPDATE_PROFILE",
          payload,
        });
        show("تغییرات ذخیره شد و به محض اتصال اینترنت همگام‌سازی می‌شوند", "success");
        router.refresh();
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      {!isOnline && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 text-center">
          آفلاین هستید — تغییرات در صف ذخیره و هنگام اتصال ثبت می‌شوند
        </div>
      )}
      <ul className="grid grid-cols-2 gap-3">
        {allergens.map((a) => {
          const active = selected.has(a.id);
          return (
            <li key={a.id}>
              <button
                type="button"
                onClick={() => toggle(a.id)}
                aria-pressed={active}
                className={`flex w-full items-center gap-2 rounded-2xl border p-3 text-sm transition-colors ${
                  active
                    ? "border-olive bg-olive-50 text-olive-600"
                    : "border-coffee/10 bg-cream-50 text-espresso hover:bg-beige"
                }`}
              >
                <span aria-hidden="true">{a.icon ?? "·"}</span>
                <span className="flex-1 text-right">{a.nameFa}</span>
                {active && <span aria-hidden="true">✓</span>}
              </button>
            </li>
          );
        })}
      </ul>
      <button onClick={save} disabled={saving} className="btn-primary w-full">
        {saving ? "در حال ذخیره..." : isOnline ? "ذخیره" : "ذخیره آفلاین"}
      </button>
    </div>
  );
}