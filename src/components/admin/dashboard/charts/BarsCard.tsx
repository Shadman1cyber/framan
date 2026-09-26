import { ChartCard } from "./ChartCard";
import { BarChart, type BarDatum } from "./BarChart";

function BarsIcon() {
  return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 20v-6M10 20V6M16 20v-9M22 20H2" /></svg>;
}

/** Column chart card. It takes no color: the bars read the page's theme. */
export function BarsCard({ title, data, max, action }: { title: string; data: BarDatum[]; max?: number; action?: React.ReactNode }) {
  return (
    <ChartCard title={title} icon={<BarsIcon />} action={action}>
      <BarChart data={data} max={max} className="flex-1" />
    </ChartCard>
  );
}
