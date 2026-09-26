import { requireOwnerPage } from "@/lib/admin-page-access";

export const dynamic = "force-dynamic";

/** Owner-only guard for the (client-rendered) sales-flow pages. */
export default async function SalesFlowLayout({ children }: { children: React.ReactNode }) {
  await requireOwnerPage();
  return <>{children}</>;
}
