import type { SupabaseClient } from "@supabase/supabase-js";
import { isPostgrestMissingColumnError } from "@/lib/supabase/postgrest-schema";

export const BILLING_TRANSACTIONS_TABLE = "billing_transactions" as const;

export type BillingTransactionType = "deposit" | "payment" | "refund";
export type BillingTransactionStatus = "succeeded" | "pending" | "failed";

export type BillingTransaction = {
  id: string;
  type: BillingTransactionType;
  amount: number;
  description: string;
  created_at: string;
  status: BillingTransactionStatus;
};

type RawTxRow = Record<string, unknown>;

const OWNER_COLUMNS = ["parent_id", "user_id"] as const;

function normalizeTxType(raw: unknown, description?: unknown): BillingTransactionType {
  const value = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (value === "deposit" || value === "refund" || value === "payment") return value;
  if (value === "credit" || value === "topup" || value === "top_up") return "deposit";
  if (value === "debit" || value === "charge" || value === "spend") return "payment";

  const desc = String(description ?? "").trim().toLowerCase();
  if (
    desc.includes("deposit") ||
    desc.includes("top-up") ||
    desc.includes("topup") ||
    desc.includes("הטענ") ||
    desc.includes("טעינ") ||
    desc.includes("זיכוי")
  ) {
    return "deposit";
  }
  if (desc.includes("refund") || desc.includes("החזר")) return "refund";
  return "payment";
}

function normalizeTxStatus(raw: unknown): BillingTransactionStatus {
  const value = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (value === "pending" || value === "failed") return value;
  return "succeeded";
}

function mapBillingTransactionRow(row: RawTxRow): BillingTransaction {
  const description = String(row.description ?? row.note ?? row.title ?? "");
  const typeRaw =
    row.transaction_type ??
    row.type ??
    row.tx_type ??
    row.kind ??
    row.category ??
    row.entry_type;
  return {
    id: String(row.id ?? ""),
    type: normalizeTxType(typeRaw, description),
    amount: Math.abs(
      Number(row.amount ?? row.amount_nis ?? row.total ?? row.sum ?? row.value) || 0
    ),
    description,
    created_at: String(row.created_at ?? row.inserted_at ?? new Date().toISOString()),
    status: normalizeTxStatus(row.status ?? row.payment_status)
  };
}

/**
 * Load recent billing rows for a parent, tolerating schema drift:
 * - owner column: `parent_id` or `user_id`
 * - uses `select('*')` so missing `type` / `transaction_type` columns never 400
 */
export async function fetchParentBillingTransactions(
  supabase: SupabaseClient,
  parentId: string,
  limit = 20
): Promise<BillingTransaction[]> {
  if (!parentId.trim()) return [];

  let lastError: string | null = null;

  for (const ownerCol of OWNER_COLUMNS) {
    const { data, error } = await supabase
      .from(BILLING_TRANSACTIONS_TABLE)
      .select("*")
      .eq(ownerCol, parentId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (!error) {
      return (((data as unknown) as RawTxRow[] | null) ?? [])
        .map(mapBillingTransactionRow)
        .filter((row) => Boolean(row.id) && row.amount > 0);
    }

    lastError = error.message;
    const missingOwner = isPostgrestMissingColumnError(error.message, ownerCol);
    const missingTable =
      /Could not find the table/i.test(error.message) ||
      /PGRST205/i.test(error.message) ||
      /relation .* does not exist/i.test(error.message);

    if (missingOwner) continue;
    if (missingTable) {
      console.warn("[billing-transactions] table unavailable:", error.message);
      return [];
    }

    // created_at might be missing — retry without explicit order.
    if (isPostgrestMissingColumnError(error.message, "created_at")) {
      const unordered = await supabase
        .from(BILLING_TRANSACTIONS_TABLE)
        .select("*")
        .eq(ownerCol, parentId)
        .limit(limit);
      if (!unordered.error) {
        return (((unordered.data as unknown) as RawTxRow[] | null) ?? [])
          .map(mapBillingTransactionRow)
          .filter((row) => Boolean(row.id) && row.amount > 0);
      }
      lastError = unordered.error.message;
    }

    console.warn("[billing-transactions] fetch failed:", error.message);
  }

  if (lastError) {
    console.warn("[billing-transactions] no compatible owner column:", lastError);
  }
  return [];
}

export type InsertBillingTransactionInput = {
  parentId: string;
  type: BillingTransactionType;
  amount: number;
  description: string;
  status?: BillingTransactionStatus;
  stripePaymentIntentId?: string | null;
};

/** Insert a billing row, falling back across known column name variants. */
export async function insertBillingTransaction(
  supabase: SupabaseClient,
  input: InsertBillingTransactionInput
): Promise<{ error: string | null }> {
  const base = {
    amount: input.amount,
    description: input.description,
    status: input.status ?? "succeeded",
    created_at: new Date().toISOString(),
    ...(input.stripePaymentIntentId
      ? { stripe_payment_intent_id: input.stripePaymentIntentId }
      : {})
  };

  const attempts: Array<Record<string, unknown>> = [
    { ...base, parent_id: input.parentId, transaction_type: input.type },
    { ...base, parent_id: input.parentId, type: input.type },
    { ...base, user_id: input.parentId, transaction_type: input.type },
    { ...base, user_id: input.parentId, type: input.type }
  ];

  let lastError: string | null = null;

  for (const payload of attempts) {
    const { error } = await supabase.from(BILLING_TRANSACTIONS_TABLE).insert(payload);
    if (!error) return { error: null };

    lastError = error.message;
    const drift =
      isPostgrestMissingColumnError(error.message, "parent_id") ||
      isPostgrestMissingColumnError(error.message, "user_id") ||
      isPostgrestMissingColumnError(error.message, "type") ||
      isPostgrestMissingColumnError(error.message, "transaction_type") ||
      isPostgrestMissingColumnError(error.message, "stripe_payment_intent_id") ||
      isPostgrestMissingColumnError(error.message, "description") ||
      isPostgrestMissingColumnError(error.message, "status");

    if (!drift) {
      return { error: error.message };
    }
  }

  return { error: lastError ?? "Failed to insert billing transaction." };
}

/** Credit parent wallet balance and log a deposit transaction. */
export async function creditParentWalletDeposit(
  supabase: SupabaseClient,
  params: {
    parentId: string;
    amount: number;
    description: string;
    stripePaymentIntentId?: string | null;
  }
): Promise<{ error: string | null; newBalance?: number }> {
  const parentId = params.parentId.trim();
  const amount = Number(params.amount);
  if (!parentId || !Number.isFinite(amount) || amount <= 0) {
    return { error: "Invalid parent or amount." };
  }

  const { data: currentWallet, error: walletError } = await supabase
    .from("parent_wallet_balances")
    .select("balance")
    .eq("parent_id", parentId)
    .maybeSingle();

  if (walletError) {
    return { error: walletError.message };
  }

  const currentBalance = Number((currentWallet as { balance?: unknown } | null)?.balance ?? 0);
  const newBalance = (Number.isFinite(currentBalance) ? currentBalance : 0) + amount;

  const { error: updateError } = await supabase.from("parent_wallet_balances").upsert(
    {
      parent_id: parentId,
      balance: newBalance,
      updated_at: new Date().toISOString()
    },
    { onConflict: "parent_id" }
  );

  if (updateError) {
    return { error: updateError.message };
  }

  const { error: txError } = await insertBillingTransaction(supabase, {
    parentId,
    type: "deposit",
    amount,
    description: params.description,
    status: "succeeded",
    stripePaymentIntentId: params.stripePaymentIntentId
  });

  if (txError) {
    console.warn("[billing-transactions] deposit logged with wallet update but tx insert failed:", txError);
  }

  return { error: null, newBalance };
}

/** Info / MoreData marker used for Hyp wallet top-ups (not shift bookings). */
export const HYP_WALLET_DEPOSIT_PREFIX = "WalletDeposit_" as const;

export function buildHypWalletDepositInfo(parentId: string): string {
  return `${HYP_WALLET_DEPOSIT_PREFIX}${parentId.trim()}`;
}

export function parseHypWalletDepositParentId(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const value = String(raw).trim();
  const match = /^walletdeposit[_:-]?([0-9a-f-]{36})$/i.exec(value);
  if (match?.[1]) return match[1].toLowerCase();

  // Also accept "WalletDeposit_<uuid>|..." compound MoreData
  for (const part of value.split(/[|,;]/)) {
    const nested = parseHypWalletDepositParentId(part.trim());
    if (nested) return nested;
  }
  return null;
}
