"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type Suggestion = {
  type: "product" | "category" | "ingredient";
  id: string;
  title: string;
  subtitle: string | null;
  href: string;
  image: string | null;
  price: number | null;
};

const TYPE_LABELS: Record<Suggestion["type"], string> = {
  product: "محصول",
  category: "دسته",
  ingredient: "ترکیب",
};

export function SearchBar({ className }: { className?: string }) {
  const router = useRouter();
  const sp = useSearchParams();
  const [q, setQ] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const boxRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => setQ(sp.get("q") ?? ""), [sp]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  function fetchSuggestions(value: string) {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!value.trim()) {
      setSuggestions([]);
      setOpen(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    timerRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search/suggest?q=${encodeURIComponent(value)}`);
        const json = await res.json();
        setSuggestions(json.suggestions ?? []);
        setOpen(true);
        setHighlight(-1);
      } catch {
        setSuggestions([]);
      } finally {
        setLoading(false);
      }
    }, 180);
  }

  function go(href: string) {
    setOpen(false);
    router.push(href);
  }

  function submit() {
    if (highlight >= 0 && suggestions[highlight]) {
      go(suggestions[highlight].href);
      return;
    }
    setOpen(false);
    router.push(`/search?q=${encodeURIComponent(q)}`);
  }

  const hasResults = suggestions.length > 0;

  return (
    <div ref={boxRef} className={`relative ${className ?? ""}`} role="search">
      <div className="relative">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-coffee/50"
        >
          🔍
        </span>
        <input
          type="search"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            fetchSuggestions(e.target.value);
          }}
          onFocus={() => q && suggestions.length > 0 && setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setHighlight((h) => Math.min(h + 1, suggestions.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setHighlight((h) => Math.max(h - 1, -1));
            } else if (e.key === "Enter") {
              e.preventDefault();
              submit();
            } else if (e.key === "Escape") {
              setOpen(false);
            }
          }}
          placeholder="جستجو در منو؛ نام محصول، دسته یا ترکیب..."
          className="input pr-11"
          aria-label="جستجو"
          role="combobox"
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-controls="search-suggestions"
          autoComplete="off"
        />
        {loading && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-xs text-muted"
          >
            …
          </span>
        )}
      </div>

      {open && (
        <div
          className="absolute inset-x-0 top-full z-50 mt-2 overflow-hidden rounded-2xl border border-coffee/15 bg-cream-50 shadow-elevated"
          id="search-suggestions" role="listbox"
        >
          {hasResults ? (
            <ul className="max-h-80 overflow-y-auto">
              {suggestions.map((s, i) => (
                <li key={`${s.type}-${s.id}`}>
                  <button
                    type="button"
                    onClick={() => go(s.href)}
                    onMouseEnter={() => setHighlight(i)}
                    className={`flex w-full items-center gap-3 px-4 py-2.5 text-right transition-colors ${
                      highlight === i ? "bg-beige" : "hover:bg-beige/60"
                    }`}
                    role="option"
                    aria-selected={highlight === i}
                  >
                    <span
                      aria-hidden="true"
                      className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-beige text-sm"
                    >
                      {s.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={s.image} alt="" className="h-full w-full object-cover" />
                      ) : s.type === "category" ? (
                        "🗂️"
                      ) : s.type === "ingredient" ? (
                        "🌿"
                      ) : (
                        "🍽️"
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-espresso">{s.title}</span>
                      {s.subtitle && (
                        <span className="block truncate text-xs text-muted">{s.subtitle}</span>
                      )}
                    </span>
                    <span className="shrink-0 text-[10px] text-muted">{TYPE_LABELS[s.type]}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            !loading && q.trim() && (
              <div className="px-4 py-5 text-center text-sm text-muted">
                نتیجه‌ای برای «{q}» یافت نشد
              </div>
            )
          )}
          {hasResults && (
            <button
              type="button"
              onClick={submit}
              className="block w-full border-t border-coffee/10 bg-beige-soft px-4 py-2.5 text-center text-xs font-medium text-olive-600 hover:bg-beige"
            >
              مشاهده همه نتایج «{q}»
            </button>
          )}
        </div>
      )}
    </div>
  );
}
