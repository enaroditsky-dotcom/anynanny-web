import { redirect } from "next/navigation";

/** Legacy URL: profile editor now lives on the dashboard (optional section). */
export default function SitterOnboardingPage() {
  redirect("/sitter/dashboard");
}
