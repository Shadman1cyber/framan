const items = [
  { label: "روغن", value: 86 },
  { label: "برنج", value: 68 },
  { label: "مرغ", value: 52 },
];

function BellIcon() {
  return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></svg>;
}

/** Low-stock alert: the count and the depleted segments stay status-red on purpose. */
export function InventoryAlertCard() {
  return <section className="flex h-[230px] flex-col rounded-[14px] border border-dashboard-line bg-dashboard-surface/75 p-4"><div className="flex items-center justify-between gap-2 text-sm font-semibold text-dashboard-foreground"><span className="flex items-center gap-2"><span className="module-accent-text"><BellIcon /></span>موجودی در آستانه اتمام</span><span className="font-mono text-xl font-semibold text-accent-red">۳</span></div><div className="mt-10 space-y-[12.5px]">{items.map((item) => <div key={item.label} className="flex items-center gap-2.5"><span className="w-8 text-[11px] text-dashboard-foreground">{item.label}</span><div dir="ltr" className="flex h-1.5 flex-1 justify-end overflow-hidden rounded-full bg-dashboard-raised"><div className="h-full rounded-full bg-accent-red" style={{ width: `${100 - item.value}%` }} /></div><span className="w-7 text-left font-mono text-[11px] text-dashboard-muted">{item.value}٪</span></div>)}</div></section>;
}
