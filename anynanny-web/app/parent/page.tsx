import { redirect } from "next/navigation";

/** Parent home — dashboard is the primary entry after login. */
export default function ParentIndexPage() {
  redirect("/parent/dashboard");
}
