import { redirect } from "next/navigation";

/** Parent home — search is the primary entry after role selection. */
export default function ParentIndexPage() {
  redirect("/parent/search");
}
