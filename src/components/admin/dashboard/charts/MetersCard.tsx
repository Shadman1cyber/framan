import { ChartCard } from "./ChartCard";
import { ProgressBar } from "./ProgressBar";

function FunnelIcon() {
  return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 5h18l-7 8v6l-4 2v-8L3 5Z" /></svg>;
}

export type MeterItem = { label: string; value: number; display: string };

/** Meter list card. It takes no color: the fills read the page's theme. */
export function MetersCard({ title, items, action }: { title: string; items: MeterItem[]; action?: React.ReactNode }) {
  return (
    <ChartCard title={title} icon={<FunnelIcon />} action={action}>
      <div className="flex flex-1 flex-col justify-center gap-4">
        {items.map((item) => (
          <div key={item.label}>
            <div className="mb-1.5 flex items-center justify-between gap-2 text-[11px] leading-relaxed">
              <span className="truncate">{item.label}</span>
              <span className="font-mono text-dashboard-foreground">{item.display}</span>
            </div>
            <ProgressBar value={item.value} />
          </div>
        ))}
      </div>
    </ChartCard>
  );
}
