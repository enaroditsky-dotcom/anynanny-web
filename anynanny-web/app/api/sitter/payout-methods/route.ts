import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import {
  fetchSitterPayoutMethods,
  saveSitterPayoutMethods,
  togglePayoutEnabledMethod,
  validateOptionalBitPhone,
  validateOptionalPayboxPhone,
  validatePayoutCard,
  type PayoutEnabledMethod,
  type SitterPayoutMethodKind
} from "@/lib/wallet/sitter-payout-methods";
import { validateOptionalPayboxPaymentLink } from "@/lib/billing/paybox-payment-link";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  kind?: SitterPayoutMethodKind | "cash";
  preferred?: boolean;
  /** Membership in payout_enabled_methods. Saving a phone or link must not send this. */
  enabled?: boolean;
  bitPhone?: string;
  payboxPhone?: string;
  payboxLink?: string;
  cardHolder?: string;
  /** Full card number or last4 — server stores last4 only. */
  cardNumber?: string;
  cardExpMonth?: number | null;
  cardExpYear?: number | null;
  cardIdNumber?: string;
  /** Accepted for validation only — never written to the database. */
  cardCvv?: string;
};

/**
 * Persist sitter payout destinations (Bit / PayBox / card metadata)
 * or membership in the enabled receiving set (cash / bit / paybox).
 * Saving a phone or link does not change which methods are enabled.
 * Card PAN is reduced to last4; CVV is never stored (PCI).
 */
export async function POST(request: Request) {
  const supabase = await createServerClient();
  if (!supabase) {
    return NextResponse.json({ error: "Server misconfigured." }, { status: 500 });
  }

  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const kind = body.kind;
  if (kind !== "bit" && kind !== "paybox" && kind !== "card" && kind !== "cash") {
    return NextResponse.json({ error: "kind must be bit | paybox | card | cash." }, { status: 400 });
  }

  if (
    (kind === "cash" || kind === "bit" || kind === "paybox") &&
    typeof body.enabled === "boolean" &&
    !Object.prototype.hasOwnProperty.call(body, "bitPhone") &&
    !Object.prototype.hasOwnProperty.call(body, "payboxPhone") &&
    !Object.prototype.hasOwnProperty.call(body, "payboxLink")
  ) {
    const loaded = await fetchSitterPayoutMethods(supabase, user.id);
    if (loaded.error && !loaded.missingSchema) {
      return NextResponse.json({ error: loaded.error }, { status: 400 });
    }
    const enabledMethods = togglePayoutEnabledMethod(
      loaded.methods.enabledMethods,
      kind as PayoutEnabledMethod,
      body.enabled
    );
    const saved = await saveSitterPayoutMethods(supabase, user.id, { enabledMethods });
    if (!saved.ok) {
      return NextResponse.json(
        { error: saved.error, missingSchema: saved.missingSchema === true },
        { status: 400 }
      );
    }
    return NextResponse.json({ methods: saved.methods });
  }

  if (kind === "bit") {
    const bitPhone = String(body.bitPhone ?? "");
    const err = validateOptionalBitPhone(bitPhone);
    if (err) return NextResponse.json({ error: err }, { status: 400 });
    const saved = await saveSitterPayoutMethods(supabase, user.id, { bitPhone });
    if (!saved.ok) {
      return NextResponse.json(
        { error: saved.error, missingSchema: saved.missingSchema === true },
        { status: 400 }
      );
    }
    return NextResponse.json({ methods: saved.methods });
  }

  if (kind === "paybox") {
    const hasPhone = Object.prototype.hasOwnProperty.call(body, "payboxPhone");
    const hasLink = Object.prototype.hasOwnProperty.call(body, "payboxLink");
    if (!hasPhone && !hasLink) {
      return NextResponse.json(
        { error: "נא להזין מספר PayBox או לינק אישי." },
        { status: 400 }
      );
    }
    const payboxPhone = hasPhone ? String(body.payboxPhone ?? "") : undefined;
    const payboxLink = hasLink ? String(body.payboxLink ?? "") : undefined;
    if (payboxPhone !== undefined) {
      const err = validateOptionalPayboxPhone(payboxPhone);
      if (err) return NextResponse.json({ error: err }, { status: 400 });
    }
    if (payboxLink !== undefined) {
      const err = validateOptionalPayboxPaymentLink(payboxLink);
      if (err) return NextResponse.json({ error: err }, { status: 400 });
    }
    const saved = await saveSitterPayoutMethods(supabase, user.id, {
      ...(payboxPhone !== undefined ? { payboxPhone } : {}),
      ...(payboxLink !== undefined ? { payboxLink } : {})
    });
    if (!saved.ok) {
      return NextResponse.json(
        { error: saved.error, missingSchema: saved.missingSchema === true },
        { status: 400 }
      );
    }
    return NextResponse.json({ methods: saved.methods });
  }

  if (kind === "cash") {
    return NextResponse.json({ error: "enabled must be boolean." }, { status: 400 });
  }

  const month = body.cardExpMonth == null ? null : Number(body.cardExpMonth);
  const year = body.cardExpYear == null ? null : Number(body.cardExpYear);
  const cardDigits = String(body.cardNumber ?? "").replace(/\D/g, "");
  const cvvDigits = String(body.cardCvv ?? "").replace(/\D/g, "");
  // Full PAN or explicit CVV → require CVV; last4-only metadata update may omit it.
  const requireCvv = cardDigits.length >= 12 || cvvDigits.length > 0;
  const cardErr = validatePayoutCard({
    holder: String(body.cardHolder ?? ""),
    last4OrNumber: String(body.cardNumber ?? ""),
    expMonth: month,
    expYear: year,
    idNumber: String(body.cardIdNumber ?? ""),
    cvv: String(body.cardCvv ?? ""),
    requireCvv
  });
  if (cardErr) return NextResponse.json({ error: cardErr }, { status: 400 });

  const setPreferred = body.preferred !== false;

  // Intentionally drop cardCvv / full PAN — only last4 + metadata reach Postgres.
  const saved = await saveSitterPayoutMethods(supabase, user.id, {
    cardHolder: String(body.cardHolder ?? ""),
    cardLast4: String(body.cardNumber ?? ""),
    cardExpMonth: month,
    cardExpYear: year,
    cardIdNumber: String(body.cardIdNumber ?? ""),
    preferred: setPreferred ? "card" : undefined
  });

  if (!saved.ok) {
    return NextResponse.json(
      { error: saved.error, missingSchema: saved.missingSchema === true },
      { status: 400 }
    );
  }

  return NextResponse.json({
    methods: saved.methods,
    /** Client may follow up with Hyp registration for live token. */
    hypReady: false,
    note: "Card metadata saved. Register via HYP to enable live payouts."
  });
}
