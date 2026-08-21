import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui";
import { BusinessSetupForm } from "@/components/business-setup-form";

export const dynamic = "force-dynamic";

export default async function BusinessSetupPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireSession();
  const sp = await searchParams;
  const idea = typeof sp.idea === "string" ? sp.idea : "";
  const businesses = await db.business.findMany({
    orderBy: { createdAt: "desc" },
    take: 6,
    include: { tasks: true },
  });

  return (
    <div className="max-w-[860px]">
      <PageHeader
        title="Start a Business"
        description="Describe what you want to do in plain language. The Business Agent turns it into a structured, executable workspace — customers, operations, suppliers, costs and your first task list."
      />
      <BusinessSetupForm prefillIdea={idea} />

      {businesses.length > 0 && (
        <div className="mt-8">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint mb-3">Your businesses</h3>
          <ul className="space-y-2">
            {businesses.map((b) => {
              const done = b.tasks.filter((t) => t.done).length;
              return (
                <li key={b.id}>
                  <a href={`/business/${b.id}`} className="flex items-center justify-between rounded-xl border border-line bg-surface px-4 py-3.5 hover:border-accent/40 transition-colors group">
                    <div>
                      <p className="text-sm font-medium text-ink group-hover:text-accent transition-colors">{b.name}</p>
                      <p className="text-xs text-ink-faint mt-0.5 line-clamp-1">{b.concept}</p>
                    </div>
                    <span className="num text-xs text-ink-dim shrink-0 ml-4">
                      {done}/{b.tasks.length} tasks
                    </span>
                  </a>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
