/** @deprecated Use `@/lib/billing/post-checkout-session` — Cardcom checkout is frozen. */
export {
  postParentCheckoutSession as postCardcomCheckoutSession,
  type ParentCheckoutRequest as CardcomCheckoutRequest,
  type ParentCheckoutResponse as CardcomCheckoutResponse
} from "@/lib/billing/post-checkout-session";
