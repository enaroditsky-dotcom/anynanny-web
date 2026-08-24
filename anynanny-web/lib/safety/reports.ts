import type { SupabaseClient } from "@supabase/supabase-js";
import { isPostgrestSchemaDriftError } from "@/lib/supabase/postgrest-schema";
import {
  DUPLICATE_OPEN_REPORT_MESSAGE,
  REPORT_CONFIRMATION_MESSAGE,
  REPORT_DETAILS_MAX_LENGTH,
  SELF_REPORT_MESSAGE,
  USER_REPORTS_TABLE,
  isReportReason,
  isSafetyUuid,
  type ReportReason,
  type ReportTargetType
} from "@/lib/safety/constants";

export async function submitUserReport(
  supabase: SupabaseClient,
  input: {
    reporterId: string;
    reportedUserId: string;
    reason: ReportReason;
    details?: string | null;
    targetType?: ReportTargetType;
  }
): Promise<{ ok: true; message: string } | { ok: false; message: string }> {
  const reporterId = input.reporterId.trim();
  const reportedUserId = input.reportedUserId.trim();
  const details = (input.details ?? "").trim() || null;

  if (!isSafetyUuid(reporterId) || !isSafetyUuid(reportedUserId)) {
    return { ok: false, message: "לא ניתן לשלוח את הדיווח." };
  }
  if (reporterId === reportedUserId) {
    return { ok: false, message: SELF_REPORT_MESSAGE };
  }
  if (!isReportReason(input.reason)) {
    return { ok: false, message: "בחרו סיבת דיווח." };
  }
  if (details && details.length > REPORT_DETAILS_MAX_LENGTH) {
    return { ok: false, message: `פרטים נוספים מוגבלים ל-${REPORT_DETAILS_MAX_LENGTH} תווים.` };
  }

  const { error } = await supabase.from(USER_REPORTS_TABLE).insert({
    reporter_id: reporterId,
    reported_user_id: reportedUserId,
    target_type: input.targetType ?? "user",
    target_id: null,
    reason: input.reason,
    details,
    status: "open"
  });

  if (error) {
    const code = String((error as { code?: string }).code ?? "");
    const message = error.message ?? "";
    if (code === "23505" || /user_reports_open_dedupe/i.test(message)) {
      return { ok: false, message: DUPLICATE_OPEN_REPORT_MESSAGE };
    }
    if (/user_reports_not_self|check constraint/i.test(message)) {
      return { ok: false, message: SELF_REPORT_MESSAGE };
    }
    if (isPostgrestSchemaDriftError(message)) {
      return { ok: false, message: "דיווח עדיין לא זמין. נסו שוב מאוחר יותר." };
    }
    return { ok: false, message: message || "שליחת הדיווח נכשלה." };
  }

  return { ok: true, message: REPORT_CONFIRMATION_MESSAGE };
}
