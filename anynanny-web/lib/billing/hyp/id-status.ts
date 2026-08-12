/**
 * HYP/SHVA Israeli ID validation (`idStatus`).
 *
 * Authoritative source: HYP Enterprise `inquireTransactions` XML
 * (`<idStatus code="1">Valid</idStatus>`), not the HYP Pay hosted-page redirect.
 *
 * Supported values (HYP Enterprise doDeal / inquireTransactions):
 * Absent (0), Valid (1), Invalid (2), NotValidated (3)
 *
 * Redirect `idStatus` may be parsed for diagnostics only.
 */

export type HypIdStatusOutcome =
  | "valid"
  | "invalid"
  | "absent"
  | "not_validated"
  | "inconclusive";

export type HypIdStatusInterpretation = {
  raw: string | null;
  code: string | null;
  outcome: HypIdStatusOutcome;
};

function pickRawIdStatus(raw: Record<string, string> | null | undefined): string | null {
  if (!raw) return null;
  for (const key of ["idStatus", "IdStatus", "IDStatus", "idstatus", "Idstatus"]) {
    const value = raw[key];
    if (value != null && String(value).trim()) return String(value).trim();
  }
  return null;
}

export function interpretHypIdStatus(
  source: string | null | undefined | Record<string, string>
): HypIdStatusInterpretation {
  const raw =
    source && typeof source === "object"
      ? pickRawIdStatus(source)
      : source == null
        ? null
        : String(source).trim() || null;

  if (!raw) {
    return { raw: null, code: null, outcome: "inconclusive" };
  }

  const normalized = raw.trim().toLowerCase();
  const codeMatch = normalized.match(/^(\d+)/);
  const code = codeMatch?.[1] ?? null;
  const numeric = code != null ? Number(code) : Number.NaN;

  if (numeric === 1 || normalized === "valid" || normalized.startsWith("valid")) {
    return { raw, code: code ?? "1", outcome: "valid" };
  }
  if (numeric === 2 || normalized === "invalid" || normalized.startsWith("invalid")) {
    return { raw, code: code ?? "2", outcome: "invalid" };
  }
  if (numeric === 0 || normalized === "absent" || normalized.startsWith("absent")) {
    return { raw, code: code ?? "0", outcome: "absent" };
  }
  if (
    numeric === 3 ||
    normalized === "notvalidated" ||
    normalized === "not_validated" ||
    normalized.startsWith("notvalidated") ||
    normalized.startsWith("not_validated")
  ) {
    return { raw, code: code ?? "3", outcome: "not_validated" };
  }

  return { raw, code, outcome: "inconclusive" };
}

/** Parse `<idStatus code="1">Valid</idStatus>` from an inquireTransactions XML blob. */
export function parseIdStatusFromInquiryXml(xml: string): HypIdStatusInterpretation {
  const block = String(xml ?? "");
  const attr = block.match(/<idStatus\b[^>]*\bcode\s*=\s*["']([^"']*)["']/i);
  const text = block.match(/<idStatus\b[^>]*>([^<]*)<\/idStatus>/i);
  const combined = [attr?.[1], text?.[1]].filter((v) => v && String(v).trim()).join(" ");
  return interpretHypIdStatus(combined || null);
}
