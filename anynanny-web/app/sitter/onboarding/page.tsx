import { redirect } from "next/navigation";

export default function LegacySitterOnboardingRedirect() {
  redirect("/auth/register?role=sitter");
}
