import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { Sidebar } from "@/components/sidebar";
import { CommandBar } from "@/components/command-bar";
import { LogoutButton } from "@/components/logout-button";
import { APPROVAL_STATUS } from "@/lib/domain";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  const pendingApprovals = await db.approval.count({
    where: { companyId: session.companyId, status: APPROVAL_STATUS.pending },
  });

  return (
    <div className="min-h-screen">
      <Sidebar pendingApprovals={pendingApprovals} companyName={session.companyName} />
      <div className="lg:pl-[236px]">
        <header className="sticky top-0 z-20 border-b border-line bg-bg/85 backdrop-blur-md">
          <div className="flex items-center gap-4 px-4 lg:px-8 h-[60px]">
            <div className="hidden sm:block flex-1" />
            <div className="flex-1 sm:max-w-[420px] w-full pl-12 sm:pl-0">
              <CommandBar />
            </div>
            <div className="flex-1 flex items-center justify-end gap-3">
              <div className="text-right hidden md:block">
                <p className="text-[13px] font-medium leading-tight">{session.name}</p>
                <p className="text-[11px] text-ink-faint capitalize">{session.role}</p>
              </div>
              <div className="h-8 w-8 rounded-full bg-accent-soft border border-accent/30 text-accent text-xs font-semibold flex items-center justify-center">
                {session.name.split(" ").map((p) => p[0]).join("")}
              </div>
              <LogoutButton />
            </div>
          </div>
        </header>
        <main className="px-4 lg:px-8 py-7 max-w-[1440px] mx-auto">{children}</main>
      </div>
    </div>
  );
}
