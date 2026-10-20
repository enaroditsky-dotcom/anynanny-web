import {
  BROADCAST_AUDIENCE_LABELS,
  isBroadcastAudienceType,
  type BroadcastAudienceType
} from "@/lib/admin/broadcast-audience";

export const QUESTION_HISTORY_PAGE_SIZE = 20;
export const RESPONDENT_PAGE_SIZE = 25;

const QUESTION_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type QuestionResultScope = "real" | "test";
export type RespondentStatusFilter = "all" | "responded" | "not_responded";

export type QuestionOptionTally = {
  id: string;
  label: string;
  position: number;
  selections: number;
  percentOfRespondents: number;
};

export type QuestionResultSummary = {
  recipients: number;
  respondents: number;
  nonrespondents: number;
  responseRate: number;
  percentagesMayExceed100: boolean;
  options: QuestionOptionTally[];
};

export function isBroadcastQuestionId(value: unknown): value is string {
  return typeof value === "string" && QUESTION_ID.test(value);
}

export function parseQuestionResultScope(value: unknown): QuestionResultScope {
  return value === "test" ? "test" : "real";
}

export function parseAudienceFilter(value: unknown): BroadcastAudienceType | null {
  return isBroadcastAudienceType(value) ? value : null;
}

export function parseRespondentStatus(value: unknown): RespondentStatusFilter {
  if (value === "responded" || value === "not_responded") return value;
  return "all";
}

export function pageBounds(page: unknown, pageSize: number): { page: number; from: number; to: number } {
  const parsed = typeof page === "number" ? page : Number(page);
  const safePage = Number.isInteger(parsed) && parsed > 0 && parsed <= 10000 ? parsed : 1;
  const from = (safePage - 1) * pageSize;
  return { page: safePage, from, to: from + pageSize - 1 };
}

/** PostgREST 416. The offset is past the last row; it is not a failed query. */
export function isUnsatisfiableRangeError(
  error: { code?: string; message?: string } | null | undefined
): boolean {
  if (!error) return false;
  return error.code === "PGRST103" || error.message === "Requested range not satisfiable";
}

/**
 * A range past the end has no rows. The caller supplies the filtered count,
 * because that response does not include one. Any other error stays an error.
 */
export function respondentPageFromQuery<T>(input: {
  data: T[] | null;
  count: number | null;
  error: { code?: string; message: string } | null;
  totalWhenUnsatisfiable: number;
}): { rows: T[]; total: number; error: string | null } {
  if (input.error) {
    if (isUnsatisfiableRangeError(input.error)) {
      return { rows: [], total: Math.max(0, input.totalWhenUnsatisfiable), error: null };
    }
    return { rows: [], total: 0, error: input.error.message };
  }
  return { rows: input.data ?? [], total: input.count ?? 0, error: null };
}

const EXACT_PARENT_PUBLIC_ID = /^(RP|P)-\d+$/i;
const EXACT_SITTER_PUBLIC_ID = /^(RAN|AN|CONS)-\d+$/i;

export type ExactPublicId = { column: "parent_serial" | "nanny_serial"; value: string };

/** Full RP/P or RAN/AN/CONS id. Prefixes such as RP and RAN stay a prefix search. */
export function exactPublicId(term: string): ExactPublicId | null {
  const value = term.trim().toUpperCase();
  if (EXACT_PARENT_PUBLIC_ID.test(value)) return { column: "parent_serial", value };
  if (EXACT_SITTER_PUBLIC_ID.test(value)) return { column: "nanny_serial", value };
  return null;
}

/** Prefix match on the stored serial. RP does not match P-, and AN does not match RAN-. */
export function profileSerialMatches(parentSerial: unknown, nannySerial: unknown, term: string): boolean {
  const prefix = term.trim().toUpperCase();
  if (prefix.length < 2) return false;
  const parent = typeof parentSerial === "string" ? parentSerial.trim().toUpperCase() : "";
  const sitter = typeof nannySerial === "string" ? nannySerial.trim().toUpperCase() : "";
  return parent.startsWith(prefix) || sitter.startsWith(prefix);
}

export function pageOfIds(
  ids: readonly string[],
  page: unknown,
  pageSize: number
): { ids: string[]; total: number; page: number } {
  const bounds = pageBounds(page, pageSize);
  return { ids: ids.slice(bounds.from, bounds.to + 1), total: ids.length, page: bounds.page };
}

/** Strip LIKE wildcards. A short fragment would match too many profiles. */
export function publicIdSearchTerm(value: unknown): string | null {
  const term = String(value ?? "")
    .trim()
    .slice(0, 40)
    .replace(/[%_\\]/g, "");
  return term.length >= 2 ? term : null;
}

export function percentOf(part: number, whole: number): number {
  if (whole <= 0 || part <= 0) return 0;
  return Math.round((part / whole) * 1000) / 10;
}

export function formatPercent(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded}%` : `${rounded.toFixed(1)}%`;
}

export function summarizeQuestionResults(input: {
  recipientCount: number;
  respondentCount: number;
  selectionMode: "single" | "multiple";
  options: Array<{ id: string; label: string; position: number; selections: number }>;
}): QuestionResultSummary {
  const recipients = Math.max(0, input.recipientCount);
  const respondents = Math.max(0, input.respondentCount);
  return {
    recipients,
    respondents,
    nonrespondents: Math.max(0, recipients - respondents),
    responseRate: percentOf(respondents, recipients),
    percentagesMayExceed100: input.selectionMode === "multiple",
    options: [...input.options]
      .sort((a, b) => a.position - b.position)
      .map((option) => ({
        id: option.id,
        label: option.label,
        position: option.position,
        selections: Math.max(0, option.selections),
        percentOfRespondents: percentOf(option.selections, respondents)
      }))
  };
}

export function adminRoleLabel(role: unknown): string {
  if (role === "parent") return "הורה";
  if (role === "sitter") return "נני";
  return "לא ידוע";
}

export function questionFormatLabel(format: unknown): string {
  return format === "yes_no" ? "כן / לא" : "תשובות לבחירה";
}

export function selectionModeLabel(mode: unknown): string {
  return mode === "multiple" ? "כמה תשובות" : "בחירה אחת";
}

export function audienceLabel(audience: unknown): string {
  return isBroadcastAudienceType(audience) ? BROADCAST_AUDIENCE_LABELS[audience] : "קהל לא ידוע";
}
