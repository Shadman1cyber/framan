import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** مرخصی‌ها is part of the combined پرسنل page now. */
export default function AdminLeavesPage() {
  redirect("/admin/staff");
}
