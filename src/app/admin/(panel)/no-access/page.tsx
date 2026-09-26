import { DashboardShell } from "@/components/admin/dashboard/DashboardShell";

function LockIcon() {
  return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="4.5" y="10" width="15" height="10" rx="2.5" /><path d="M8 10V7.5a4 4 0 0 1 8 0V10" /></svg>;
}

export default function NoCashierAccessPage() {
  return (
    <DashboardShell title="دسترسی محدود است" icon={<LockIcon />}>
      <div data-legacy-surface="dashboard">
        <div className="card p-8 text-center">
          <h2 className="heading-section">دسترسی محدود است</h2>
          <p className="mt-3 text-sm leading-relaxed text-dashboard-muted">صاحب کافه هنوز بخشی را برای این حساب صندوق‌دار فعال نکرده است.</p>
        </div>
      </div>
    </DashboardShell>
  );
}
