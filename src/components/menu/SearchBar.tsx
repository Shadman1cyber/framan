"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

export function SearchBar({ className }: { className?: string }) {
  const router = useRouter();
  const sp = useSearchParams();
  const [q, setQ] = useState(sp.get("q") ?? "");
  useEffect(() => setQ(sp.get("q") ?? ""), [sp]);
  return (
    <form
      role="search"
      className={`relative ${className ?? ""}`}
      onSubmit={(e) => {
        e.preventDefault();
        const params = new URLSearchParams(Array.from(sp.entries()));
        if (q) params.set("q", q);
        else params.delete("q");
        router.push(`/search?${params.toString()}`);
      }}
    >
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="جستجو در منو..."
        className="input"
        aria-label="جستجو"
      />
    </form>
  );
}