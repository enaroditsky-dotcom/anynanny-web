"use client";

import { SitterAvailabilityManager } from "@/components/sitter/sitter-availability-manager";
import { SitterPageShell } from "@/components/sitter/sitter-page-shell";

export default function SitterAvailabilityPage() {
  return (
    <SitterPageShell
      title="סידור עבודה"
      subtitle="ניהול זמינות בסיס — שעות פתוחות וחסומות. ללא משמרות מאושרות."
    >
      <SitterAvailabilityManager />
    </SitterPageShell>
  );
}
