/* AnyNanny Web Push service worker.
 * Handles push, notificationclick, and app badge.
 * No offline caching in this phase.
 */
const DEFAULT_TITLE = "AnyNanny";
const ICON = "/icon-192.png";
const DEFAULT_BODY = "יש לכם עדכון חדש ב-AnyNanny";

self.addEventListener("install", function (event) {
  self.skipWaiting();
});

self.addEventListener("activate", function (event) {
  event.waitUntil(self.clients.claim());
});

function parsePushData(event) {
  try {
    if (!event.data) return {};
    return event.data.json();
  } catch (_jsonErr) {
    try {
      return JSON.parse(event.data.text());
    } catch (_textErr) {
      return {};
    }
  }
}

function safePath(url) {
  if (typeof url !== "string" || !url.trim()) return "/";
  const trimmed = url.trim();
  if (!trimmed.startsWith("/")) return "/";
  if (trimmed.startsWith("//")) return "/";
  return trimmed;
}

async function applyBadge(count) {
  try {
    if (typeof self.registration.setAppBadge === "function") {
      if (!count) await self.registration.clearAppBadge();
      else await self.registration.setAppBadge(count);
      return;
    }
  } catch (_err) {
    /* ignore */
  }
}

async function handlePush(event) {
  const data = parsePushData(event);
  const title =
    typeof data.title === "string" && data.title.trim() ? data.title.trim() : DEFAULT_TITLE;
  const body =
    typeof data.body === "string" && data.body.trim() ? data.body.trim() : DEFAULT_BODY;
  const url = safePath(data.url);
  const notificationId = typeof data.notificationId === "string" ? data.notificationId : "";
  const kind = typeof data.kind === "string" ? data.kind : "";
  const badge = Number.isFinite(data.badge) ? Math.max(0, Math.floor(data.badge)) : null;

  await Promise.all([
    self.registration.showNotification(title, {
      body: body,
      icon: ICON,
      badge: ICON,
      lang: "he",
      dir: "rtl",
      data: { url: url, notificationId: notificationId, kind: kind },
      tag: notificationId || kind || "anynanny",
      renotify: true
    }),
    badge === null ? Promise.resolve() : applyBadge(badge)
  ]);
}

self.addEventListener("push", function (event) {
  event.waitUntil(handlePush(event));
});

async function openOrFocus(path) {
  const dest = new URL(safePath(path), self.location.origin);
  const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  for (let i = 0; i < windows.length; i += 1) {
    const client = windows[i];
    try {
      const clientUrl = new URL(client.url);
      if (clientUrl.origin === dest.origin && typeof client.focus === "function") {
        await client.focus();
        if (typeof client.navigate === "function") {
          try {
            await client.navigate(dest.href);
          } catch (_navErr) {
            client.postMessage({ type: "ANYNANNY_PUSH_NAVIGATE", url: dest.pathname + dest.search });
          }
        } else {
          client.postMessage({ type: "ANYNANNY_PUSH_NAVIGATE", url: dest.pathname + dest.search });
        }
        return;
      }
    } catch (_clientErr) {
      /* try next */
    }
  }
  await self.clients.openWindow(dest.href);
}

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  const data = event.notification.data || {};
  event.waitUntil(openOrFocus(data.url || "/"));
});
