"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createPurchaseRequestAction } from "@/server/actions/procurement";
import { Loader2, Sparkles, CircleAlert } from "lucide-react";

const inputCls =
  "w-full h-10 rounded-lg bg-bg border border-line px-3 text-sm text-ink placeholder:text-ink-faint focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition";

export function NewRequestForm({ prefill }: { prefill: { item: string; qty: number | string } }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      const res = await createPurchaseRequestAction({
        title: String(fd.get("title") ?? ""),
        itemDescription: String(fd.get("item") ?? ""),
        quantity: Number(fd.get("quantity")),
        unit: String(fd.get("unit") ?? "units"),
        neededBy: String(fd.get("neededBy") ?? "") || null,
        budget: fd.get("budget") ? Number(fd.get("budget")) : null,
        priority: String(fd.get("priority") ?? "normal"),
        notes: String(fd.get("notes") ?? "") || null,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.push(`/procurement/requests/${res.id}?fresh=1`);
    });
  }

  return (
    <form onSubmit={onSubmit} className="rounded-xl border border-line bg-surface p-6 space-y-5">
      <div>
        <label htmlFor="title" className="block text-xs font-medium text-ink-dim mb-1.5 uppercase tracking-wide">Title</label>
        <input
          id="title" name="title" required
          defaultValue={prefill.item ? `${prefill.qty || ""} ${prefill.item}`.trim() : ""}
          placeholder="e.g. Industrial packaging for export batch"
          className={inputCls}
        />
      </div>

      <div>
        <label htmlFor="item" className="block text-xs font-medium text-ink-dim mb-1.5 uppercase tracking-wide">Item description</label>
        <input id="item" name="item" required defaultValue={prefill.item}
          placeholder="e.g. heavy-duty corrugated boxes 480×400mm"
          className={inputCls} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="quantity" className="block text-xs font-medium text-ink-dim mb-1.5 uppercase tracking-wide">Quantity</label>
          <input id="quantity" name="quantity" type="number" min={1} max={1000000} required defaultValue={prefill.qty || ""} placeholder="500" className={`${inputCls} num`} />
        </div>
        <div>
          <label htmlFor="unit" className="block text-xs font-medium text-ink-dim mb-1.5 uppercase tracking-wide">Unit</label>
          <select id="unit" name="unit" defaultValue="units" className={inputCls}>
            {["units", "rolls", "sheets", "coils", "packs", "kg", "tons", "m³", "pallets"].map((u) => (
              <option key={u} value={u}>{u}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="neededBy" className="block text-xs font-medium text-ink-dim mb-1.5 uppercase tracking-wide">Delivery needed by</label>
          <input id="neededBy" name="neededBy" type="date" className={`${inputCls} num`} />
        </div>
        <div>
          <label htmlFor="budget" className="block text-xs font-medium text-ink-dim mb-1.5 uppercase tracking-wide">Budget (IRR, optional)</label>
          <input id="budget" name="budget" type="number" min={0} step="0.01" placeholder="500000000" className={`${inputCls} num`} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="priority" className="block text-xs font-medium text-ink-dim mb-1.5 uppercase tracking-wide">Priority</label>
          <select id="priority" name="priority" defaultValue="normal" className={inputCls}>
            <option value="low">Low</option>
            <option value="normal">Normal</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </select>
        </div>
      </div>

      <div>
        <label htmlFor="notes" className="block text-xs font-medium text-ink-dim mb-1.5 uppercase tracking-wide">Notes (optional)</label>
        <textarea id="notes" name="notes" rows={3} placeholder="Quality requirements, export constraints, preferred terms…" className="w-full rounded-lg bg-bg border border-line px-3 py-2.5 text-sm text-ink placeholder:text-ink-faint focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition resize-none" />
      </div>

      {error && (
        <p className="flex items-center gap-2 text-sm text-bad bg-bad/10 border border-bad/20 rounded-lg px-3 py-2">
          <CircleAlert className="h-4 w-4 shrink-0" /> {error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="inline-flex items-center gap-2 h-10 rounded-lg bg-accent px-5 text-sm font-semibold text-[#04211d] hover:bg-accent-strong disabled:opacity-60 transition-colors"
      >
        {pending ? <Loader2 className="h-4 w-4 spin" /> : <Sparkles className="h-4 w-4" />}
        {pending ? "FARMAN is executing…" : "Submit to FARMAN"}
      </button>
      <p className="text-xs text-ink-faint">
        On submit, the Procurement Agent parses your requirement, sources suppliers and prepares a recommendation — usually within seconds.
      </p>
    </form>
  );
}
