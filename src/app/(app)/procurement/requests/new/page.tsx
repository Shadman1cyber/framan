import { NewRequestForm } from "@/components/new-request-form";
import { PageHeader } from "@/components/ui";

export default async function NewRequestPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const item = typeof sp.item === "string" ? sp.item : "";
  const qty = typeof sp.qty === "string" ? parseInt(sp.qty, 10) || "" : "";

  return (
    <div className="max-w-[720px]">
      <PageHeader
        title="New Purchase Request"
        description="Describe what you need. FARMAN parses the requirement, sources suppliers, compares offers and prepares execution — pausing for your approval when policy requires it."
      />
      <NewRequestForm prefill={{ item, qty }} />
    </div>
  );
}
