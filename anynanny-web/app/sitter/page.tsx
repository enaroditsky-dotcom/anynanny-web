import { redirect } from "next/navigation";

/** Sitter home — dashboard with rating + nanny ID header lives here. */
export default function SitterPage() {
  redirect("/sitter/dashboard");
}
