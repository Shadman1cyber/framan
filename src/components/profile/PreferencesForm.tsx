"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";
import { useOffline } from "@/lib/offline/OfflineContext";
import { enqueueAction } from "@/lib/offline/queue";

type Cat = { id: string; slug: string; nameFa: string };
type Diet = { id: string; key: string; nameFa: string; icon: string | null };

export function PreferencesForm({
  categories,
  dietaryTags,
  initialPrefs,
  initialDiet,
}: {
  categories: Cat[];
  dietaryTags: Diet[];
  initialPrefs: Array<{ key: string; value: string }>;
  initialDiet: string[];
}) {
  const map = Object.fromEntries(initialPrefs.map((p) => [p.key, p.value]));
  const [favoriteCategory, setFavoriteCategory] = useState(map.favoriteCategory ?? "");
  const [coffeePreference, setCoffeePreference] = useState(map.coffeePreference ?? "");
  const [sweetOrSavory, setSweetOrSavory] = useState(map.sweetOrSavory ?? "");
  const [diet, setDiet] = useState<Set<string>>(new Set(initialDiet));
  const [saving, setSaving] = useState(false);
  const router = useRouter();
  const { isOnline } = useOffline();
  const { show } = useToast();

  function toggleDiet(id: string) {
    setDiet((d) => {
      const n = new Set(d);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  async function save() {
    setSaving(true);
    const payload = {
      preferences: [
        { key: "favoriteCategory", value: favoriteCategory },
        { key: "coffeePreference", value: coffeePreference },
        { key: "sweetOrSavory", value: sweetOrSavory },
      ].filter((p) => p.value),
      dietaryTagIds: Array.from(diet),
    };
    try {
      if (isOnline) {
        const res = await fetch("/api/profile/preferences", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          show("ترجیحات ذخیره شد", "success");
          router.refresh();
        } else {
          show("خطا", "error");
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
    <div className="space-y-5">
      {!isOnline && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 text-center">
          آفلاین هستید — تغییرات در صف ذخیره و هنگام اتصال ثبت می‌شوند
        </div>
      )}
      <section>
        <label className="label">دسته‌ی مورد علاقه</label>
        <div className="flex flex-wrap gap-2">
          {categories.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setFavoriteCategory(c.slug)}
              aria-pressed={favoriteCategory === c.slug}
              className={`chip ${favoriteCategory === c.slug ? "chip-active" : ""}`}
            >
              {c.nameFa}
            </button>
          ))}
        </div>
      </section>
      <section>
        <label className="label">سلیقه‌ی طعم</label>
        <div className="flex flex-wrap gap-2">
          {[
            { v: "sweet", l: "شیرین" },
            { v: "savory", l: "ملس" },
            { v: "bitter", l: "تلخ" },
          ].map((o) => (
            <button
              key={o.v}
              type="button"
              onClick={() => setSweetOrSavory(o.v)}
              aria-pressed={sweetOrSavory === o.v}
              className={`chip ${sweetOrSavory === o.v ? "chip-active" : ""}`}
            >
              {o.l}
            </button>
          ))}
        </div>
      </section>
      <section>
        <label className="label">سلیقه‌ی قهوه</label>
        <div className="flex flex-wrap gap-2">
          {[
            { v: "mild", l: "ملایم" },
            { v: "balanced", l: "متعادل" },
            { v: "strong", l: "تلخ و قوی" },
          ].map((o) => (
            <button
              key={o.v}
              type="button"
              onClick={() => setCoffeePreference(o.v)}
              aria-pressed={coffeePreference === o.v}
              className={`chip ${coffeePreference === o.v ? "chip-active" : ""}`}
            >
              {o.l}
            </button>
          ))}
        </div>
      </section>
      <section>
        <label className="label">رژیم غذایی</label>
        <div className="flex flex-wrap gap-2">
          {dietaryTags.map((d) => (
            <button
              key={d.id}
              type="button"
              onClick={() => toggleDiet(d.id)}
              aria-pressed={diet.has(d.id)}
              className={`chip ${diet.has(d.id) ? "chip-active" : ""}`}
            >
              {d.icon && <span aria-hidden="true">{d.icon}</span>}
              {d.nameFa}
            </button>
          ))}
        </div>
      </section>
      <button onClick={save} disabled={saving} className="btn-primary w-full">
        {saving ? "در حال ذخیره..." : isOnline ? "ذخیره" : "ذخیره آفلاین"}
      </button>
    </div>
  );
}