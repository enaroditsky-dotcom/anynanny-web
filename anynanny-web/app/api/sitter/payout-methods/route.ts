import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import {
  saveSitterPayoutMethods,
  validateOptionalBitPhone,
  validateOptionalPayboxPhone,
  validatePayoutCard,
  type SitterPayoutMethodKind
} from "@/lib/wallet/sitter-payout-methods";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  kind?: SitterPayoutMethodKind;
  preferred?: boolean;
  bitPhone?: string;
  payboxPhone?: string;
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
 * Persist sitter payout destinations (Bit / PayBox / card metadata).
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
  if (kind !== "bit" && kind !== "paybox" && kind !== "card") {
    return NextResponse.json({ error: "kind must be bit | paybox | card." }, { status: 400 });
  }

  const setPreferred = body.preferred !== false;

  if (kind === "bit") {
    const bitPhone = String(body.bitPhone ?? "");
    const err = validateOptionalBitPhone(bitPhone);
    if (err) return NextResponse.json({ error: err }, { status: 400 });
    const saved = await saveSitterPayoutMethods(supabase, user.id, {
      bitPhone,
      preferred: bitPhone.trim() && setPreferred ? "bit" : undefined
    });
    if (!saved.ok) {
      return NextResponse.json(
        { error: saved.error, missingSchema: saved.missingSchema === true },
        { status: 400 }
      );
    }
    return NextResponse.json({ methods: saved.methods });
  }

  if (kind === "paybox") {
    const payboxPhone = String(body.payboxPhone ?? "");
    const err = validateOptionalPayboxPhone(payboxPhone);
    if (err) return NextResponse.json({ error: err }, { status: 400 });
    const saved = await saveSitterPayoutMethods(supabase, user.id, {
      payboxPhone,
      preferred: payboxPhone.trim() && setPreferred ? "paybox" : undefined
    });
    if (!saved.ok) {
      return NextResponse.json(
        { error: saved.error, missingSchema: saved.missingSchema === true },
        { status: 400 }
      );
    }
    return NextResponse.json({ methods: saved.methods });
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
