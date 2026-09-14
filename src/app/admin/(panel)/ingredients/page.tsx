import { redirect } from "next/navigation";

// Ingredients management moved into the inventory system (/admin/inventory).
export default function IngredientsRedirect() {
  redirect("/admin/inventory");
}
