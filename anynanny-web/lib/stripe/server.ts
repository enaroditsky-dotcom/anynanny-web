import Stripe from "stripe";

let stripe: Stripe | null = null;

export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY is not set.");
  }
  if (!stripe) {
    stripe = new Stripe(key, {
      apiVersion: "2026-05-27.dahlia",
      typescript: true
    });
  }
  return stripe;
}