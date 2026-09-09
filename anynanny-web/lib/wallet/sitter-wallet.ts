import type { SupabaseClient } from "@supabase/supabase-js";
import { BOOKINGS_TABLE } from "@/lib/bookings/constants";
import { isBookingPaymentPaid } from "@/lib/bookings/payment-status-label";
import { isPostgrestMissingColumnError } from "@/lib/supabase/postgrest-schema";

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

function normalizeWalletType(raw: unknown): SitterWalletTransactionType {
  const typeRaw = String(raw ?? "earnings");
  return typeRaw === "payout" || typeRaw === "bonus" ? typeRaw : "earnings";
}

function normalizeWalletStatus(raw: unknown): SitterWalletTransactionStatus {
  const statusRaw = String(raw ?? "succeeded");
  return statusRaw === "pending" || statusRaw === "failed" ? statusRaw : "succeeded";
}

/**
 * Pending ledger rows stay pending until the linked booking is actually paid.
 * Manual cash/BIT/PayBox marks the booking paid without promoting sitter_transactions.
 */
export function promotePendingSitterIncomeIfPaid(
  row: SitterEarningsLedgerRow,
  paidBookingIds: ReadonlySet<string>
): SitterEarningsLedgerRow {
  if (String(row.status ?? "") !== "pending") return row;
  const bookingId = typeof row.booking_id === "string" ? row.booking_id.trim() : "";
  if (!bookingId || !paidBookingIds.has(bookingId)) return row;
  return { ...row, status: "succeeded" };
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
    type: normalizeWalletType(row.type),
    amount: Number(row.amount) || 0,
    status: normalizeWalletStatus(row.status),
    created_at: String(row.created_at ?? ""),
    booking_id: row.booking_id != null ? String(row.booking_id) : null
  };
}

function collectPendingBookingIds(rows: SitterEarningsLedgerRow[]): string[] {
  const ids = new Set<string>();
  for (const row of rows) {
    if (String(row.status) !== "pending") continue;
    const bookingId = typeof row.booking_id === "string" ? row.booking_id.trim() : "";
    if (bookingId) ids.add(bookingId);
  }
  return [...ids];
}

async function fetchPaidBookingIds(
  supabase: SupabaseClient,
  bookingIds: string[]
): Promise<Set<string>> {
  const paid = new Set<string>();
  if (bookingIds.length === 0) return paid;

  const { data, error } = await supabase
    .from(BOOKINGS_TABLE)
    .select("id, payment_status, paid_at")
    .in("id", bookingIds);

  if (error) {
    console.warn("[sitter-wallet] paid booking lookup failed:", error.message);
    return paid;
  }

  for (const row of data ?? []) {
    const record = row as { id?: unknown; payment_status?: unknown; paid_at?: unknown };
    const id = record.id != null ? String(record.id).trim() : "";
    if (!id) continue;
    if (
      isBookingPaymentPaid({
        paymentStatus: record.payment_status != null ? String(record.payment_status) : null,
        paidAt: record.paid_at != null ? String(record.paid_at) : null
      })
    ) {
      paid.add(id);
    }
  }

  return paid;
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

  const listSelectWithBooking = "id, type, amount, description, created_at, status, booking_id";
  const listSelect = "id, type, amount, description, created_at, status";
  let txData: Record<string, unknown>[] | null = null;
  let { data: listData, error: txError } = await supabase
    .from(SITTER_TRANSACTIONS_TABLE)
    .select(listSelectWithBooking)
    .eq("sitter_id", sitterId)
    .order("created_at", { ascending: false })
    .limit(25);
  txData = (listData as Record<string, unknown>[] | null) ?? null;

  if (txError && isPostgrestMissingColumnError(txError.message, "booking_id")) {
    const retry = await supabase
      .from(SITTER_TRANSACTIONS_TABLE)
      .select(listSelect)
      .eq("sitter_id", sitterId)
      .order("created_at", { ascending: false })
      .limit(25);
    txData = (retry.data as Record<string, unknown>[] | null) ?? null;
    txError = retry.error;
  }

  if (txError) {
    return {
      ...emptyWalletView(txError.message, isMissingRelationError(txError.message), balance)
    };
  }

  const rawListRows: Record<string, unknown>[] = (txData ?? []).map((row) => ({
    ...row,
    created_at: row.created_at ?? new Date().toISOString()
  }));
  const listLedgerRows = rawListRows.map((row) => mapLedgerRow(row));

  const yearStartIso = new Date(asOf.getFullYear(), 0, 1).toISOString();
  const summarySelectWithBooking = "id, type, amount, created_at, status, booking_id";
  const summarySelect = "id, type, amount, created_at, status";
  let earningsRows: Record<string, unknown>[] | null = null;
  let { data: summaryData, error: earningsError } = await supabase
    .from(SITTER_TRANSACTIONS_TABLE)
    .select(summarySelectWithBooking)
    .eq("sitter_id", sitterId)
    .in("type", ["earnings", "bonus"])
    .gte("created_at", yearStartIso);
  earningsRows = (summaryData as Record<string, unknown>[] | null) ?? null;

  if (earningsError && isPostgrestMissingColumnError(earningsError.message, "booking_id")) {
    const retry = await supabase
      .from(SITTER_TRANSACTIONS_TABLE)
      .select(summarySelect)
      .eq("sitter_id", sitterId)
      .in("type", ["earnings", "bonus"])
      .gte("created_at", yearStartIso);
    earningsRows = (retry.data as Record<string, unknown>[] | null) ?? null;
    earningsError = retry.error;
  }

  const summaryLedgerRows = earningsError
    ? listLedgerRows
    : (earningsRows ?? []).map((row) => mapLedgerRow(row as Record<string, unknown>));

  if (earningsError) {
    console.warn("[sitter-wallet] earnings summary query failed:", earningsError.message);
  }

  const paidBookingIds = await fetchPaidBookingIds(
    supabase,
    collectPendingBookingIds([...summaryLedgerRows, ...listLedgerRows])
  );

  const countableSummaryRows = summaryLedgerRows.map((row) =>
    promotePendingSitterIncomeIfPaid(row, paidBookingIds)
  );
  const earningsSummary = summarizeSitterEarnings(countableSummaryRows, asOf);

  const transactions: SitterWalletTransaction[] = rawListRows.map((row, index) => {
    const ledger = listLedgerRows[index] ?? mapLedgerRow(row);
    const promoted = promotePendingSitterIncomeIfPaid(ledger, paidBookingIds);
    return {
      id: String(promoted.id ?? ""),
      type: normalizeWalletType(promoted.type),
      amount: promoted.amount,
      description: String(row.description ?? ""),
      created_at: String(promoted.created_at || row.created_at || new Date().toISOString()),
      status: normalizeWalletStatus(promoted.status)
    };
  });

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
