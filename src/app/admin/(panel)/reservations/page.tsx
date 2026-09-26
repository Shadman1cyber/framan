import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** رزرو میزها is part of the combined میزها page now. */
export default function AdminReservationsPage() {
  redirect("/admin/tables");
}
