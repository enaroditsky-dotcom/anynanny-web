import type { SupabaseClient } from "@supabase/supabase-js";
import {
  fetchParentBillingTransactions,
  type BillingTransaction
} from "@/lib/wallet/billing-transactions";
import { isPostgrestMissingColumnError, isPostgrestSchemaDriftError } from "@/lib/supabase/postgrest-schema";

const PARENT_WALLET_BALANCES_TABLE = "parent_wallet_balances" as const;

function finiteAmount(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function pickSessionAmount(row: Record<string, unknown>): number {
  return (
    finiteAmount(row.total_amount_charged) ??
    finiteAmount(row.final_amount_nis) ??
    finiteAmount(row.total_amount) ??
    0
  );
}

function computeLedgerBalance(transactions: BillingTransaction[]): number {
  let balance = 0;
  for (const tx of transactions) {
    if (tx.status !== "succeeded") continue;
    const amount = Math.abs(Number(tx.amount) || 0);
    if (tx.type === "deposit" || tx.type === "refund") balance += amount;
    else balance -= amount;
  }
  return Math.round(balance * 100) / 100;
}

async function fetchParentWalletBalanceRow(
  supabase: SupabaseClient,
  parentId: string
): Promise<{ balance: number | null; rowFound: boolean }> {
  const attempts: Array<{ column: string; filter: string }> = [
    { column: "parent_id", filter: parentId },
    { column: "user_id", filter: parentId }
  ];

  for (const attempt of attempts) {
    const { data, error } = await supabase
      .from(PARENT_WALLET_BALANCES_TABLE)
      .select("balance")
      .eq(attempt.column, attempt.filter)
      .maybeSingle();

    if (!error) {
      if (!data) return { balance: null, rowFound: false };
      const balance = finiteAmount((data as { balance?: unknown }).balance);
      return { balance: balance ?? 0, rowFound: true };
    }

    if (
      isPostgrestMissingColumnError(error.message, attempt.column) ||
      /Could not find the table/i.test(error.message) ||
      /PGRST205/i.test(error.message)
    ) {
      continue;
    }

    console.warn("[parent-wallet] balance read failed:", error.message);
    return { balance: null, rowFound: false };
  }

  // Legacy fallback: profiles.balance
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("balance")
    .eq("id", parentId)
    .maybeSingle();

  if (!profileError && profile) {
    const balance = finiteAmount((profile as { balance?: unknown }).balance);
    if (balance != null) return { balance, rowFound: true };
  }

  return { balance: null, rowFound: false };
}

/**
 * Build payment history from completed/paid sessions when billing_transactions
 * is empty or schema-incompatible.
 */
export async function fetchParentSessionPaymentHistory(
  supabase: SupabaseClient,
  parentId: string,
  limit = 20
): Promise<BillingTransaction[]> {
  if (!parentId.trim()) return [];

  const selectAttempts = [
    "id, created_at, updated_at, end_time, total_amount_charged, final_amount_nis, total_amount, status, session_status, payment_status",
    "id, created_at, end_time, total_amount_charged, final_amount_nis, total_amount, status",
    "id, created_at, total_amount_charged, final_amount_nis",
    "id, created_at, final_amount_nis"
  ];

  for (const select of selectAttempts) {
    const { data, error } = await supabase
      .from("sessions")
      .select(select)
      .eq("parent_id", parentId)
      .order("created_at", { ascending: false })
      .limit(Math.max(limit * 2, 40));

    if (error) {
      if (isPostgrestSchemaDriftError(error.message) || isPostgrestMissingColumnError(error.message, "parent_id")) {
        continue;
      }
      console.warn("[parent-wallet] sessions history failed:", error.message);
      return [];
    }

    const rows = ((data as unknown) as Record<string, unknown>[] | null) ?? [];
    const mapped: BillingTransaction[] = [];

    for (const row of rows) {
      const amount = pickSessionAmount(row);
      if (!(amount > 0)) continue;

      const statusRaw = String(row.payment_status ?? row.session_status ?? row.status ?? "")
        .trim()
        .toLowerCase();
      // Skip clearly unpaid / cancelled sessions when status is known.
      if (
        statusRaw &&
        (statusRaw.includes("cancel") ||
          statusRaw.includes("pending") ||
          statusRaw === "unpaid" ||
          statusRaw === "draft")
      ) {
        continue;
      }

      mapped.push({
        id: `session-${String(row.id ?? mapped.length)}`,
        type: "payment",
        amount,
        description: "תשלום משמרת",
        created_at: String(row.end_time ?? row.updated_at ?? row.created_at ?? new Date().toISOString()),
        status: "succeeded"
      });

      if (mapped.length >= limit) break;
    }

    return mapped;
  }

  return [];
}

export type ParentWalletView = {
  balance: number;
  transactions: BillingTransaction[];
  source: "billing" | "sessions" | "mixed";
};

/** Load parent wallet balance + recent ledger (billing table, then sessions fallback). */
export async function fetchParentWalletView(
  supabase: SupabaseClient,
  parentId: string,
  limit = 20
): Promise<ParentWalletView> {
  if (!parentId.trim()) {
    return { balance: 0, transactions: [], source: "billing" };
  }

  const [walletRow, billingTx] = await Promise.all([
    fetchParentWalletBalanceRow(supabase, parentId),
    fetchParentBillingTransactions(supabase, parentId, limit)
  ]);

  let transactions = billingTx;
  let source: ParentWalletView["source"] = "billing";

  if (transactions.length === 0) {
    const sessionTx = await fetchParentSessionPaymentHistory(supabase, parentId, limit);
    if (sessionTx.length > 0) {
      transactions = sessionTx;
      source = "sessions";
    }
  } else {
    // Optionally enrich with session payments not already represented.
    const sessionTx = await fetchParentSessionPaymentHistory(supabase, parentId, limit);
    if (sessionTx.length > 0) {
      const existingIds = new Set(transactions.map((tx) => tx.id));
      const merged = [...transactions];
      for (const tx of sessionTx) {
        if (existingIds.has(tx.id)) continue;
        // Avoid obvious duplicates by same amount + same day.
        const day = tx.created_at.slice(0, 10);
        const dup = merged.some(
          (existing) =>
            existing.type === "payment" &&
            Math.abs(existing.amount - tx.amount) < 0.01 &&
            existing.created_at.slice(0, 10) === day
        );
        if (!dup) merged.push(tx);
      }
      merged.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
      transactions = merged.slice(0, limit);
      source = "mixed";
    }
  }

  let balance = walletRow.balance;
  if (balance == null || (!walletRow.rowFound && balance === 0)) {
    const ledger = computeLedgerBalance(transactions);
    // Only use ledger when it produces a meaningful non-negative available balance
    // (deposits present). Session-only payment history should not invent a negative wallet.
    if (transactions.some((tx) => tx.type === "deposit" || tx.type === "refund")) {
      balance = Math.max(0, ledger);
    } else if (balance == null) {
      balance = 0;
    }
  }

  return {
    balance: Number.isFinite(balance) ? Number(balance) : 0,
    transactions,
    source
  };
}
