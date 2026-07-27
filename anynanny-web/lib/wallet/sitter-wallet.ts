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

export async function fetchSitterWalletView(
  supabase: SupabaseClient,
  sitterId: string
): Promise<{
  balance: number;
  transactions: SitterWalletTransaction[];
  error: string | null;
  missingSchema: boolean;
}> {
  if (!sitterId.trim()) {
    return { balance: 0, transactions: [], error: "Missing sitter id", missingSchema: false };
  }

  const ensured = await ensureSitterWalletRow(supabase);
  if (ensured.missingSchema) {
    return {
      balance: 0,
      transactions: [],
      error: ensured.error,
      missingSchema: true
    };
  }

  const { data: wallet, error: walletError } = await supabase
    .from(SITTER_WALLET_BALANCES_TABLE)
    .select("balance")
    .eq("sitter_id", sitterId)
    .maybeSingle();

  if (walletError) {
    return {
      balance: ensured.balance,
      transactions: [],
      error: walletError.message,
      missingSchema: isMissingRelationError(walletError.message)
    };
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
      balance,
      transactions: [],
      error: txError.message,
      missingSchema: isMissingRelationError(txError.message)
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

  return { balance, transactions, error: null, missingSchema: false };
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
