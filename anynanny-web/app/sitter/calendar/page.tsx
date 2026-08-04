import { redirect } from "next/navigation";

/** Legacy route — availability lives on /sitter/availability */
export default function SitterCalendarRedirectPage() {
  redirect("/sitter/availability");
}
