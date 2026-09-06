"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";

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
    const res = await fetch("/api/profile/allergies", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ allergenIds: Array.from(selected) }),
    });
    setSaving(false);
    if (res.ok) {
      show("حساسیت‌ها ذخیره شد", "success");
      router.refresh();
    } else show("خطا در ذخیره", "error");
  }

  return (
    <div className="space-y-4">
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
        {saving ? "در حال ذخیره..." : "ذخیره"}
      </button>
    </div>
  );
}