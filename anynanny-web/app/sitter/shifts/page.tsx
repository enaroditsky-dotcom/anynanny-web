"use client";

import { SitterPageShell } from "@/components/sitter/sitter-page-shell";
import { SitterShiftsPageContent } from "@/components/sitter/sitter-shifts-page-content";

export default function SitterShiftsPage() {
  return (
    <SitterPageShell
      title="לוח המשמרות שלי"
      subtitle="בקשות ממתינות לאישור, ומשמרות מאושרות — הכל מטבלת הבקשות."
    >
      <SitterShiftsPageContent />
    </SitterPageShell>
  );
}
