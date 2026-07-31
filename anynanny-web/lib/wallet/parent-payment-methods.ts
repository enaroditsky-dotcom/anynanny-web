import type { SupabaseClient } from "@supabase/supabase-js";
import {
  brandLabelHe,
  fetchHypCardToken,
  inferCardBrand
} from "@/lib/billing/hyp/token";
import { isPostgrestSchemaDriftError } from "@/lib/supabase/postgrest-schema";

export const PARENT_PAYMENT_METHODS_TABLE = "parent_payment_methods" as const;

export const HYP_WALLET_PAYMENT_METHOD_PREFIX = "WalletPaymentMethod_" as const;

export type ParentPaymentMethod = {
  id: string;
  parent_id: string;
  provider: "hyp" | "cardcom" | "stripe";
  last4: string;
  brand: string;
  brandLabel: string;
  label: string;
  exp_month: number;
  exp_year: number;
  is_default: boolean;
  created_at: string;
};

type RawMethodRow = {
  id: string;
  parent_id: string;
  provider?: string | null;
  last4?: string | null;
  brand?: string | null;
  label?: string | null;
  exp_month: number;
  exp_year: number;
  is_default?: boolean | null;
  created_at?: string | null;
  hyp_token?: string | null;
  israeli_id?: string | null;
};

function mapMethodRow(row: RawMethodRow): ParentPaymentMethod {
  const brand = String(row.brand ?? "card");
  return {
    id: row.id,
    parent_id: row.parent_id,
    provider: row.provider === "cardcom" || row.provider === "stripe" ? row.provider : "hyp",
    last4: String(row.last4 ?? "").slice(-4),
    brand,
    brandLabel: brandLabelHe(brand),
    label: String(row.label ?? "").trim(),
    exp_month: Number(row.exp_month) || 1,
    exp_year: Number(row.exp_year) || new Date().getFullYear(),
    is_default: Boolean(row.is_default),
    created_at: String(row.created_at ?? new Date().toISOString())
  };
}

export function buildHypWalletPaymentMethodInfo(parentId: string): string {
  return `${HYP_WALLET_PAYMENT_METHOD_PREFIX}${parentId.trim()}`;
}

export function parseHypWalletPaymentMethodParentId(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const value = String(raw).trim();
  const match = /^walletpaymentmethod[_:-]?([0-9a-f-]{36})$/i.exec(value);
  if (match?.[1]) return match[1].toLowerCase();
  for (const part of value.split(/[|,;]/)) {
    const nested = parseHypWalletPaymentMethodParentId(part.trim());
    if (nested) return nested;
  }
  return null;
}

export async function listParentPaymentMethods(
  supabase: SupabaseClient,
  parentId: string
): Promise<{ methods: ParentPaymentMethod[]; error: string | null; missingSchema: boolean }> {
  if (!parentId.trim()) {
    return { methods: [], error: "Missing parent id", missingSchema: false };
  }

  const { data, error } = await supabase
    .from(PARENT_PAYMENT_METHODS_TABLE)
    .select("id, parent_id, provider, last4, brand, label, exp_month, exp_year, is_default, created_at")
    .eq("parent_id", parentId)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    const missing =
      isPostgrestSchemaDriftError(error.message) ||
      /Could not find the table/i.test(error.message) ||
      /PGRST205/i.test(error.message);
    return { methods: [], error: error.message, missingSchema: missing };
  }

  return {
    methods: ((data as RawMethodRow[] | null) ?? []).map(mapMethodRow),
    error: null,
    missingSchema: false
  };
}

export async function getParentPaymentMethodSecret(
  supabase: SupabaseClient,
  parentId: string,
  methodId: string
): Promise<{
  method: (ParentPaymentMethod & { hyp_token: string; israeli_id: string | null }) | null;
  error: string | null;
}> {
  const { data, error } = await supabase
    .from(PARENT_PAYMENT_METHODS_TABLE)
    .select(
      "id, parent_id, provider, last4, brand, label, exp_month, exp_year, is_default, created_at, hyp_token, israeli_id"
    )
    .eq("parent_id", parentId)
    .eq("id", methodId)
    .maybeSingle();

  if (error) return { method: null, error: error.message };
  if (!data) return { method: null, error: "Payment method not found." };

  const row = data as RawMethodRow;
  if (!row.hyp_token) return { method: null, error: "Saved method is missing Hyp token." };

  return {
    method: {
      ...mapMethodRow(row),
      hyp_token: row.hyp_token,
      israeli_id: row.israeli_id ?? null
    },
    error: null
  };
}

export async function upsertParentHypPaymentMethod(
  supabase: SupabaseClient,
  input: {
    parentId: string;
    hypToken: string;
    expMonth: number;
    expYear: number;
    last4?: string;
    brand?: string;
    label?: string;
    israeliId?: string | null;
    hypTransId?: string | null;
    makeDefault?: boolean;
  }
): Promise<{ method: ParentPaymentMethod | null; error: string | null }> {
  const parentId = input.parentId.trim();
  const hypToken = input.hypToken.trim();
  if (!parentId || !hypToken) {
    return { method: null, error: "Missing parent or token." };
  }

  const last4 = (input.last4 || hypToken.slice(-4)).slice(-4);
  const brand = inferCardBrand(last4, input.brand);
  const label = input.label?.trim() || `${brandLabelHe(brand)} •••• ${last4}`;

  const { count } = await supabase
    .from(PARENT_PAYMENT_METHODS_TABLE)
    .select("id", { count: "exact", head: true })
    .eq("parent_id", parentId);

  const makeDefault = input.makeDefault === true || (count ?? 0) === 0;

  const payload = {
    parent_id: parentId,
    provider: "hyp",
    hyp_token: hypToken,
    exp_month: input.expMonth,
    exp_year: input.expYear,
    last4,
    brand,
    label,
    israeli_id: input.israeliId?.trim() || null,
    hyp_trans_id: input.hypTransId?.trim() || null,
    is_default: makeDefault,
    updated_at: new Date().toISOString()
  };

  const { data, error } = await supabase
    .from(PARENT_PAYMENT_METHODS_TABLE)
    .upsert(payload, { onConflict: "parent_id,hyp_token" })
    .select("id, parent_id, provider, last4, brand, label, exp_month, exp_year, is_default, created_at")
    .maybeSingle();

  if (error) {
    return { method: null, error: error.message };
  }

  return { method: data ? mapMethodRow(data as RawMethodRow) : null, error: null };
}

/** After Hyp success: getToken + persist method for this parent. */
export async function saveHypPaymentMethodFromTransId(
  supabase: SupabaseClient,
  params: {
    parentId: string;
    transId: string;
    israeliId?: string | null;
    brandHint?: string | null;
    makeDefault?: boolean;
  }
): Promise<{ method: ParentPaymentMethod | null; error: string | null }> {
  try {
    const token = await fetchHypCardToken({ transId: params.transId, allowFalse: true });
    return upsertParentHypPaymentMethod(supabase, {
      parentId: params.parentId,
      hypToken: token.token,
      expMonth: token.expMonth,
      expYear: token.expYear,
      last4: token.last4,
      brand: params.brandHint ?? undefined,
      israeliId: params.israeliId,
      hypTransId: token.transId,
      makeDefault: params.makeDefault
    });
  } catch (error) {
    return {
      method: null,
      error: error instanceof Error ? error.message : "Failed to save Hyp payment method."
    };
  }
}

export async function setDefaultParentPaymentMethod(
  supabase: SupabaseClient,
  parentId: string,
  methodId: string
): Promise<{ error: string | null }> {
  const { error: clearError } = await supabase
    .from(PARENT_PAYMENT_METHODS_TABLE)
    .update({ is_default: false, updated_at: new Date().toISOString() })
    .eq("parent_id", parentId);
  if (clearError) return { error: clearError.message };

  const { error } = await supabase
    .from(PARENT_PAYMENT_METHODS_TABLE)
    .update({ is_default: true, updated_at: new Date().toISOString() })
    .eq("parent_id", parentId)
    .eq("id", methodId);

  return { error: error?.message ?? null };
}

export async function deleteParentPaymentMethod(
  supabase: SupabaseClient,
  parentId: string,
  methodId: string
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from(PARENT_PAYMENT_METHODS_TABLE)
    .delete()
    .eq("parent_id", parentId)
    .eq("id", methodId);
  return { error: error?.message ?? null };
}
