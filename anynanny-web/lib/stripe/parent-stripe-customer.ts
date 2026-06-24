import type { User } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getStripe } from "@/lib/stripe/server";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/admin";
import {
  isPostgrestMissingColumnError,
  readSupabaseErrorMessage
} from "@/lib/supabase/postgrest-schema";
import { PROFILES_TABLE } from "@/lib/supabase/profiles";

type ProfileStripeLookup = {
  id: string;
  stripe_customer_id: string | null;
};

async function readStoredStripeCustomerId(
  client: SupabaseClient,
  userId: string,
  logPrefix: string
): Promise<{ stripeCustomerId: string | null; columnMissing: boolean }> {
  const { data, error } = await client
    .from(PROFILES_TABLE)
    .select("id, stripe_customer_id")
    .eq("id", userId)
    .maybeSingle();

  if (!error) {
    const row = (data as ProfileStripeLookup | null) ?? null;
    const stripeCustomerId = row?.stripe_customer_id?.trim() ?? "";
    return { stripeCustomerId: stripeCustomerId || null, columnMissing: false };
  }

  const message = readSupabaseErrorMessage(error);
  if (isPostgrestMissingColumnError(message, "stripe_customer_id")) {
    console.warn(`[${logPrefix}] stripe_customer_id column missing on ${PROFILES_TABLE}; continuing without persisted lookup.`);
    return { stripeCustomerId: null, columnMissing: true };
  }

  console.error(`[${logPrefix}] profile lookup failed:`, message);
  return { stripeCustomerId: null, columnMissing: false };
}

async function persistStripeCustomerId(
  userId: string,
  stripeCustomerId: string,
  logPrefix: string
): Promise<void> {
  try {
    const admin = getSupabaseServiceRoleClient();
    const { error: updateError } = await admin
      .from(PROFILES_TABLE)
      .update({ stripe_customer_id: stripeCustomerId })
      .eq("id", userId);

    if (!updateError) {
      return;
    }

    const message = readSupabaseErrorMessage(updateError);
    if (isPostgrestMissingColumnError(message, "stripe_customer_id")) {
      console.warn(`[${logPrefix}] stripe_customer_id column missing; skipping persist.`);
      return;
    }

    console.error(`[${logPrefix}] failed to persist stripe_customer_id:`, message);
  } catch (err) {
    console.warn(
      `[${logPrefix}] service-role persist unavailable:`,
      err instanceof Error ? err.message : err
    );
  }
}

/** Loads or creates a Stripe customer for the signed-in parent without failing on missing profile rows. */
export async function resolveParentStripeCustomerId(
  user: User,
  supabase: SupabaseClient,
  logPrefix: string
): Promise<{ stripeCustomerId: string | null; error: string | null }> {
  let stripeCustomerId =
    (await readStoredStripeCustomerId(supabase, user.id, logPrefix)).stripeCustomerId ?? "";

  if (!stripeCustomerId) {
    try {
      const admin = getSupabaseServiceRoleClient();
      const adminLookup = await readStoredStripeCustomerId(admin, user.id, logPrefix);
      stripeCustomerId = adminLookup.stripeCustomerId ?? "";
    } catch (err) {
      console.warn(
        `[${logPrefix}] service-role profile lookup skipped:`,
        err instanceof Error ? err.message : err
      );
    }
  }

  if (stripeCustomerId) {
    return { stripeCustomerId, error: null };
  }

  try {
    const stripe = getStripe();
    const customer = await stripe.customers.create({
      email: user.email ?? undefined,
      metadata: {
        supabase_user_id: user.id
      }
    });

    await persistStripeCustomerId(user.id, customer.id, logPrefix);
    return { stripeCustomerId: customer.id, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Stripe error.";
    console.error(`[${logPrefix}] customers.create failed:`, message);
    return { stripeCustomerId: null, error: message };
  }
}
