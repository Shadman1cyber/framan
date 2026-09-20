"use client";

import { useRouter } from "next/navigation";
import { StaffPanel, type StaffOpt } from "@/components/admin/OperationsDashboard";
import { useToast } from "@/components/ui/Toast";
import { todayGregorianInput } from "@/lib/jalali";

function shiftGregorian(greg: string, deltaDays: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(greg);
  if (!m) return greg;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) + deltaDays * 86400000);
  const p2 = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}`;
}

/** Client wrapper for the staff page: provides toast + router refresh to StaffPanel. */
export function StaffPanelClient({ initialStaff }: { initialStaff: StaffOpt[] }) {
  const { show } = useToast();
  const router = useRouter();
  const today = todayGregorianInput();

  return (
    <StaffPanel
      from={shiftGregorian(today, -13)}
      to={today}
      initialStaff={initialStaff}
      show={show}
      refresh={() => router.refresh()}
    />
  );
}