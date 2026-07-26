import { finalizeHypPaymentSuccess } from "@/lib/billing/finalize-hyp-payment";
import {
  isHypSuccessCCode,
  normalizeHypSessionCandidate,
  normalizeHypUuidCandidate,
  parseHypReturnParams
} from "@/lib/billing/hyp/parse-return-params";
import { createServerClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type CompleteBody = {
  bookingId?: string;
  sessionId?: string;
  hypApprovalId?: string;
  amountPaid?: string;
  /** Hyp response code — must be 0/00 when provided. */
  cCode?: string;
  /** Raw Hyp query/form for server-side parsing. */
  hypQuery?: string;
  Info?: string;
  MoreData?: string;
  Order?: string;
  Id?: string;
  Amount?: string;
  CCode?: string;
};

/**
 * Finalizes a shift after Hyp redirects back with checkout=success.
 * Session/booking are marked paid only here (or via the Hyp webhook).
 */
export async function POST(request: Request) {
  let body: CompleteBody;
  try {
    body = (await request.json()) as CompleteBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const supabase = createServerClient();
  if (!supabase) {
    return NextResponse.json({ error: "Server client initialization failed." }, { status: 500 });
  }

  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const fromQuery = body.hypQuery
    ? parseHypReturnParams(body.hypQuery)
    : parseHypReturnParams({
        CCode: String(body.CCode ?? body.cCode ?? ""),
        Info: String(body.Info ?? ""),
        MoreData: String(body.MoreData ?? ""),
        Order: String(body.Order ?? ""),
        Id: String(body.Id ?? body.hypApprovalId ?? ""),
        Amount: String(body.Amount ?? body.amountPaid ?? ""),
        bookingId: String(body.bookingId ?? ""),
        sessionId: String(body.sessionId ?? "")
      });

  const cCode = body.cCode ?? body.CCode ?? fromQuery.cCode;
  if (cCode != null && String(cCode).trim() !== "" && !isHypSuccessCCode(cCode)) {
    return NextResponse.json(
      { error: `Hyp payment was not successful (CCode=${cCode}).` },
      { status: 400 }
    );
  }

  const bookingId =
    normalizeHypUuidCandidate(body.bookingId) ||
    fromQuery.bookingId ||
    normalizeHypUuidCandidate(body.Info) ||
    normalizeHypUuidCandidate(body.Order);

  if (!bookingId) {
    return NextResponse.json(
      {
        error:
          "bookingId is required. Ensure Hyp Info echoes the booking UUID (or pass bookingId from the client)."
      },
      { status: 400 }
    );
  }

  const sessionId =
    normalizeHypSessionCandidate(body.sessionId) ||
    fromQuery.sessionId ||
    normalizeHypSessionCandidate(body.MoreData);

  const result = await finalizeHypPaymentSuccess(supabase, {
    bookingId,
    sessionId,
    parentId: user.id,
    hypApprovalId: body.hypApprovalId ?? body.Id ?? fromQuery.approvalId,
    amountPaid: body.amountPaid ?? body.Amount ?? fromQuery.amount
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    status: "paid",
    bookingId: result.bookingId,
    sessionIds: result.sessionIds
  });
}
