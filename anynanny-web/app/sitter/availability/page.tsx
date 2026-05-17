"use client";

import { AvailabilityErrorBoundary } from "@/components/sitter/availability-error-boundary";
import { SitterAvailabilityManager } from "@/components/sitter/sitter-availability-manager";
import { SitterPageShell } from "@/components/sitter/sitter-page-shell";

export default function SitterAvailabilityPage() {
  return (
    <SitterPageShell
      title="סידור עבודה"
      subtitle="ניהול זמינות בסיס — שעות פתוחות וחסומות. ללא משמרות מאושרות."
    >
      <AvailabilityErrorBoundary>
        <SitterAvailabilityManager />
      </AvailabilityErrorBoundary>
    </SitterPageShell>
  );
}
