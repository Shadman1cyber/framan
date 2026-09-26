import { ChartCard } from "./ChartCard";
import { MiniRing } from "./MiniRing";

function RingIcon() {
  return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="8.5" /><path d="m12 12 3.5-2.5" /></svg>;
}

/** Secondary-ring card. It takes no color: the arc reads the page's theme. */
export function RingCard({ title, percent, label, caption, display, action }: { title: string; percent: number; label: string; caption: string; display: string; action?: React.ReactNode }) {
  return (
    <ChartCard title={title} icon={<RingIcon />} action={action}>
      <div className="flex flex-1 items-center justify-center gap-4">
        <MiniRing percent={percent} label={label} caption={caption} size={92} strokeWidth={9} />
        <div className="min-w-0">
          <p className="module-accent-text font-mono text-2xl font-semibold tracking-[-0.06em]">{display}</p>
          <p className="mt-1 text-[11px] text-dashboard-muted">{caption}</p>
        </div>
      </div>
    </ChartCard>
  );
}
