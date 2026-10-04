"use strict";
/**
 * Store listing URLs for the demo download CTA.
 * Leave empty until the real Google Play and App Store listings exist.
 * Empty values keep the buttons disabled — they must not open a search page.
 */
const GOOGLE_PLAY_URL = "";
const APP_STORE_URL = "";
const WEB_APP_URL = "";

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

function armStoreButton(button, value) {
  const live = liveStoreUrl(value);
  if (!live) {
    button.disabled = true;
    delete button.dataset.href;
    return false;
  }
  button.disabled = false;
  button.dataset.href = withCampaignParams(live);
  return true;
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
  return `/welcome?${welcome.toString()}`;
}

document.querySelectorAll("[data-sitter-web-app]").forEach((link) => {
  link.setAttribute("href", sitterSignupHref());
});

document.querySelectorAll(".demo-store").forEach((block) => {
  const google = block.querySelector('[data-store="google"]');
  const apple = block.querySelector('[data-store="apple"]');
  const web = block.querySelector('[data-store="web"]');
  const googleLive = google ? armStoreButton(google, GOOGLE_PLAY_URL) : false;
  const appleLive = apple ? armStoreButton(apple, APP_STORE_URL) : false;
  if (web) armStoreButton(web, WEB_APP_URL);
  if (googleLive && appleLive) block.classList.add("is-live");
  block.querySelectorAll("[data-store]").forEach((button) => {
    button.addEventListener("click", () => {
      if (button.disabled || !button.dataset.href) return;
      window.location.assign(button.dataset.href);
    });
  });
});
