"use strict";
/**
 * Public download destinations for the demo.
 * iPhone opens the official App Store listing, without campaign query params.
 * Android opens the Web App. Google Play is not offered.
 */
const APP_STORE_URL = "https://apps.apple.com/il/app/anynanny/id6813214477";
const WEB_APP_URL = "https://app.anynanny.org/";
/** Keep aligned with DOMAIN_SEPARATION_ENABLED in lib/hosts/site-classifier.ts. */
const DOMAIN_SEPARATION_ENABLED = true;

const STORE_UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"];

function liveStoreUrl(value) {
  if (typeof value !== "string" || !value.trim()) return "";
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:") return "";
    return url.toString();
  } catch (_err) {
    return "";
  }
}

function withCampaignParams(value) {
  const url = new URL(value);
  if (url.origin === "https://apps.apple.com") return url.toString();
  const incoming = new URLSearchParams(window.location.search);
  STORE_UTM_KEYS.forEach((key) => {
    const raw = incoming.get(key);
    if (!raw) return;
    const trimmed = raw.trim();
    if (!trimmed || trimmed.length > 120) return;
    url.searchParams.set(key, trimmed);
  });
  return url.toString();
}

function sitterSignupHref() {
  const utm = new URLSearchParams();
  const incoming = new URLSearchParams(window.location.search);
  STORE_UTM_KEYS.forEach((key) => {
    const raw = incoming.get(key);
    if (!raw) return;
    const trimmed = raw.trim();
    if (!trimmed || trimmed.length > 120) return;
    utm.set(key, trimmed);
  });
  const next = new URLSearchParams({ role: "sitter", track: "babysitter" });
  utm.forEach((value, key) => next.set(key, value));
  const welcome = new URLSearchParams({
    role: "sitter",
    next: `/register?${next.toString()}`
  });
  utm.forEach((value, key) => welcome.set(key, value));
  const path = `/welcome?${welcome.toString()}`;
  return DOMAIN_SEPARATION_ENABLED ? `https://app.anynanny.org${path}` : path;
}

document.querySelectorAll("[data-sitter-web-app]").forEach((link) => {
  link.setAttribute("href", sitterSignupHref());
});

function armStoreLink(link, value) {
  if (!link || link.tagName !== "A") return false;
  const live = liveStoreUrl(value);
  if (!live) return false;
  link.href = withCampaignParams(live);
  return true;
}

document.querySelectorAll(".demo-store").forEach((block) => {
  const apple = block.querySelector('[data-store="apple"]');
  const web = block.querySelector('[data-store="web"]');
  const appleLive = armStoreLink(apple, APP_STORE_URL);
  const webLive = armStoreLink(web, WEB_APP_URL);
  if (appleLive || webLive) block.classList.add("is-live");
});
