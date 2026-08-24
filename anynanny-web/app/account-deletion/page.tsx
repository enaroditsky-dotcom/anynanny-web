import type { Metadata } from "next";
import { AccountDeletionPageView } from "@/components/legal/account-deletion-page-view";

export const metadata: Metadata = {
  title: "מחיקת חשבון | AnyNanny",
  description:
    "כיצד למחוק חשבון AnyNanny מתוך האפליקציה, או לבקש מחיקה בפנייה ל־support@anynanny.org כאשר אין אפשרות להתחבר."
};

export default function AccountDeletionPage() {
  return <AccountDeletionPageView />;
}
