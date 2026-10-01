/**
 * Parent-wallet launchers for external payment apps.
 *
 * No verified bit or PayBox deep-link / app-link scheme exists in this repo.
 * `paybox:` is explicitly rejected by the PayBox link validator, so these
 * shortcuts use official HTTPS sites only. They do not store a card, connect
 * an account, or process a payment.
 */

export type PaymentAppShortcutId = "bit" | "paybox";

export type PaymentAppShortcut = {
  id: PaymentAppShortcutId;
  label: string;
  /** Official public site. Not an app URI scheme. */
  href: string;
  logoSrc: string;
  logoAlt: string;
};

/** Official bit site (Bank Hapoalim). Not a custom scheme. */
const BIT_OFFICIAL_SITE = "https://www.bitpay.co.il/he";

/** Official PayBox site. Host is already allowlisted in paybox-payment-link.ts. */
const PAYBOX_OFFICIAL_SITE = "https://www.payboxapp.com/";

export const PARENT_WALLET_PAYMENT_APP_SHORTCUTS: readonly PaymentAppShortcut[] = [
  {
    id: "bit",
    label: "bit",
    href: BIT_OFFICIAL_SITE,
    logoSrc: "/wallet/bit-logo.png",
    logoAlt: "bit"
  },
  {
    id: "paybox",
    label: "PayBox",
    href: PAYBOX_OFFICIAL_SITE,
    logoSrc: "/wallet/paybox-logo.png",
    logoAlt: "PayBox"
  }
];

function allowedShortcutUrl(id: PaymentAppShortcutId, href: string): boolean {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  if (url.username || url.password) return false;
  if (id === "bit") {
    return url.hostname === "www.bitpay.co.il" && url.pathname === "/he";
  }
  if (id === "paybox") {
    return url.hostname === "www.payboxapp.com" && (url.pathname === "/" || url.pathname === "");
  }
  return false;
}

/** HTTPS official site for a shortcut, or null when the destination is not the known site. */
export function paymentAppShortcutHref(id: PaymentAppShortcutId): string | null {
  const item = PARENT_WALLET_PAYMENT_APP_SHORTCUTS.find((entry) => entry.id === id);
  if (!item || !allowedShortcutUrl(id, item.href)) return null;
  return new URL(item.href).toString();
}
