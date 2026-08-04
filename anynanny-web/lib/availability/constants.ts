export const SITTER_AVAILABILITY_TABLE = "sitter_availability" as const;

export type CalendarMode = "all_except_blocked" | "only_selected";

export type SitterAvailabilityRow = {
  sitter_id: string;
  availability_date: string;
  slot_indices: number[];
  updated_at: string;
};
