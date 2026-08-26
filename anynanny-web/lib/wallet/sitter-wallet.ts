import type { SupabaseClient } from "@supabase/supabase-js";

export const SITTER_WALLET_BALANCES_TABLE = "sitter_wallet_balances" as const;
export const SITTER_TRANSACTIONS_TABLE = "sitter_transactions" as const;

export type SitterWalletTransactionType = "earnings" | "payout" | "bonus";
export type SitterWalletTransactionStatus = "succeeded" | "pending" | "failed";

export type SitterWalletTransaction = {
  id: string;
  type: SitterWalletTransactionType;
  amount: number;
  description: string;
  created_at: string;
  status: SitterWalletTransactionStatus;
};

export type SitterEarningsLedgerRow = {
  id?: string | null;
  type: string;
  amount: number;
  status: string;
  created_at: string;
  booking_id?: string | null;
};

export type SitterEarningsSummary = {
  monthEarnings: number;
  yearEarnings: number;
  monthShiftCount: number;
};

export const EMPTY_SITTER_EARNINGS_SUMMARY: SitterEarningsSummary = {
  monthEarnings: 0,
  yearEarnings: 0,
  monthShiftCount: 0
};

function isSucceededIncomeType(type: string): boolean {
  return type === "earnings" || type === "bonus";
}

/** Calendar-local earnings from succeeded shift payments (excludes pending/failed/payout). */
export function summarizeSitterEarnings(
  rows: SitterEarningsLedgerRow[],
  asOf: Date = new Date()
): SitterEarningsSummary {
  const year = asOf.getFullYear();
  const month = asOf.getMonth();
  let monthEarnings = 0;
  let yearEarnings = 0;
  const monthShiftKeys = new Set<string>();

  for (const row of rows) {
    const type = String(row.type ?? "");
    const status = String(row.status ?? "");
    if (!isSucceededIncomeType(type) || status !== "succeeded") continue;

    const amount = Number(row.amount);
    if (!Number.isFinite(amount) || amount <= 0) continue;

    const created = new Date(row.created_at);
    if (Number.isNaN(created.getTime()) || created.getFullYear() !== year) continue;

    yearEarnings += amount;
    if (created.getMonth() !== month) continue;

    monthEarnings += amount;
    if (type !== "earnings") continue;

    const bookingId = typeof row.booking_id === "string" ? row.booking_id.trim() : "";
    const rowId = typeof row.id === "string" ? row.id.trim() : "";
    monthShiftKeys.add(bookingId ? `booking:${bookingId}` : rowId ? `id:${rowId}` : `anon:${monthShiftKeys.size}`);
  }

  return {
    monthEarnings: Number(monthEarnings.toFixed(2)),
    yearEarnings: Number(yearEarnings.toFixed(2)),
    monthShiftCount: monthShiftKeys.size
  };
}

function mapLedgerRow(row: Record<string, unknown>): SitterEarningsLedgerRow {
  return {
    id: row.id != null ? String(row.id) : null,
    type: String(row.type ?? "earnings"),
    amount: Number(row.amount) || 0,
    status: String(row.status ?? "succeeded"),
    created_at: String(row.created_at ?? ""),
    booking_id: row.booking_id != null ? String(row.booking_id) : null
  };
}

function isMissingRelationError(message: string | undefined): boolean {
  const msg = message ?? "";
  return (
    /Could not find the table/i.test(msg) ||
    /relation .* does not exist/i.test(msg) ||
    /404/.test(msg) ||
    /PGRST205/i.test(msg) ||
    /schema cache/i.test(msg)
  );
}

/** Ensure a zero-balance wallet row exists for the authenticated sitter. */
export async function ensureSitterWalletRow(
  supabase: SupabaseClient
): Promise<{ balance: number; error: string | null; missingSchema: boolean }> {
  const { data, error } = await supabase.rpc("ensure_sitter_wallet");
  if (!error) {
    const row = (Array.isArray(data) ? data[0] : data) as { balance?: unknown } | null;
    const balance = row?.balance != null && Number.isFinite(Number(row.balance)) ? Number(row.balance) : 0;
    return { balance, error: null, missingSchema: false };
  }

  if (isMissingRelationError(error.message) || /ensure_sitter_wallet/i.test(error.message ?? "")) {
    return { balance: 0, error: error.message, missingSchema: true };
  }

  // Fallback: direct select (wallet row may already exist).
  const { data: wallet, error: walletError } = await supabase
    .from(SITTER_WALLET_BALANCES_TABLE)
    .select("balance")
    .maybeSingle();

  if (walletError) {
    return {
      balance: 0,
      error: walletError.message,
      missingSchema: isMissingRelationError(walletError.message)
    };
  }

  return {
    balance:
      wallet?.balance != null && Number.isFinite(Number(wallet.balance))
        ? Number(wallet.balance)
        : 0,
    error: null,
    missingSchema: false
  };
}

function emptyWalletView(error: string | null, missingSchema: boolean, balance = 0) {
  return {
    balance,
    transactions: [] as SitterWalletTransaction[],
    earningsSummary: { ...EMPTY_SITTER_EARNINGS_SUMMARY },
    error,
    missingSchema
  };
}

export async function fetchSitterWalletView(
  supabase: SupabaseClient,
  sitterId: string,
  asOf: Date = new Date()
): Promise<{
  balance: number;
  transactions: SitterWalletTransaction[];
  earningsSummary: SitterEarningsSummary;
  error: string | null;
  missingSchema: boolean;
}> {
  if (!sitterId.trim()) {
    return emptyWalletView("Missing sitter id", false);
  }

  const ensured = await ensureSitterWalletRow(supabase);
  if (ensured.missingSchema) {
    return emptyWalletView(ensured.error, true);
  }

  const { data: wallet, error: walletError } = await supabase
    .from(SITTER_WALLET_BALANCES_TABLE)
    .select("balance")
    .eq("sitter_id", sitterId)
    .maybeSingle();

  if (walletError) {
    return emptyWalletView(
      walletError.message,
      isMissingRelationError(walletError.message),
      ensured.balance
    );
  }

  const balance =
    wallet?.balance != null && Number.isFinite(Number(wallet.balance))
      ? Number(wallet.balance)
      : ensured.balance;

  const { data: txData, error: txError } = await supabase
    .from(SITTER_TRANSACTIONS_TABLE)
    .select("id, type, amount, description, created_at, status")
    .eq("sitter_id", sitterId)
    .order("created_at", { ascending: false })
    .limit(25);

  if (txError) {
    return {
      ...emptyWalletView(txError.message, isMissingRelationError(txError.message), balance)
    };
  }

  const transactions: SitterWalletTransaction[] = (txData ?? []).map((row) => {
    const typeRaw = String((row as { type?: string }).type ?? "earnings");
    const type: SitterWalletTransactionType =
      typeRaw === "payout" || typeRaw === "bonus" ? typeRaw : "earnings";
    const statusRaw = String((row as { status?: string }).status ?? "succeeded");
    const status: SitterWalletTransactionStatus =
      statusRaw === "pending" || statusRaw === "failed" ? statusRaw : "succeeded";
    return {
      id: String((row as { id: string }).id),
      type,
      amount: Number((row as { amount?: unknown }).amount) || 0,
      description: String((row as { description?: string }).description ?? ""),
      created_at: String((row as { created_at?: string }).created_at ?? new Date().toISOString()),
      status
    };
  });

  const yearStartIso = new Date(asOf.getFullYear(), 0, 1).toISOString();
  const { data: earningsRows, error: earningsError } = await supabase
    .from(SITTER_TRANSACTIONS_TABLE)
    .select("id, type, amount, created_at, status, booking_id")
    .eq("sitter_id", sitterId)
    .in("type", ["earnings", "bonus"])
    .eq("status", "succeeded")
    .gte("created_at", yearStartIso);

  let earningsSummary = EMPTY_SITTER_EARNINGS_SUMMARY;
  if (earningsError) {
    console.warn("[sitter-wallet] earnings summary query failed:", earningsError.message);
    earningsSummary = summarizeSitterEarnings(
      transactions.map((tx) => ({
        id: tx.id,
        type: tx.type,
        amount: tx.amount,
        status: tx.status,
        created_at: tx.created_at
      })),
      asOf
    );
  } else {
    earningsSummary = summarizeSitterEarnings(
      (earningsRows ?? []).map((row) => mapLedgerRow(row as Record<string, unknown>)),
      asOf
    );
  }

  return { balance, transactions, earningsSummary, error: null, missingSchema: false };
}

/** Best-effort credit after payment finalize (DB trigger is primary; this is a safety net). */
export async function creditSitterWalletForSession(
  supabase: SupabaseClient,
  sessionId: string
): Promise<void> {
  if (!sessionId.trim()) return;
  const { error } = await supabase.rpc("credit_sitter_wallet_for_session", {
    p_session_id: sessionId
  });
  if (error) {
    // Trigger may already have credited; missing RPC until migration is applied.
    console.warn("[sitter-wallet] credit_sitter_wallet_for_session:", error.message);
  }
}

export async function creditSitterWalletForBooking(
  supabase: SupabaseClient,
  bookingId: string
): Promise<void> {
  if (!bookingId.trim()) return;
  const { error } = await supabase.rpc("credit_sitter_wallet_for_booking", {
    p_booking_id: bookingId
  });
  if (error) {
    console.warn("[sitter-wallet] credit_sitter_wallet_for_booking:", error.message);
  }
}
