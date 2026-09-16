import type { Metadata } from "next";
import { HomePageClient } from "@/components/marketing/home-page-client";

export const metadata: Metadata = {
  title: "AnyNanny — פשוט למצוא זמן לחיים",
  description:
    "ברוכים הבאים ל־AnyNanny. מקום שבו משפחות ובייביסיטריות נפגשות, מכירות ובוחרות זו בזו."
};

export default function HomePage() {
  return <HomePageClient />;
}
