"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";

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
    const res = await fetch("/api/profile/preferences", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        preferences: [
          { key: "favoriteCategory", value: favoriteCategory },
          { key: "coffeePreference", value: coffeePreference },
          { key: "sweetOrSavory", value: sweetOrSavory },
        ].filter((p) => p.value),
        dietaryTagIds: Array.from(diet),
      }),
    });
    setSaving(false);
    if (res.ok) {
      show("ترجیحات ذخیره شد", "success");
      router.refresh();
    } else show("خطا", "error");
  }

  return (
    <div className="space-y-5">
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
        {saving ? "در حال ذخیره..." : "ذخیره"}
      </button>
    </div>
  );
}