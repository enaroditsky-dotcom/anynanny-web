import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { POST as loginPost } from "../app/api/admin/login/route";
import {
  ADMIN_AUTH_COOKIE,
  adminAuthCookieOptions,
  createAdminSessionValue,
  getAdminPassword,
  getAdminSessionSecret,
  isValidAdminPassword,
  isValidAdminSessionValue
} from "../lib/admin/auth";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const authSource = readFileSync(resolve(root, "lib/admin/auth.ts"), "utf8");
const loginSource = readFileSync(resolve(root, "app/api/admin/login/route.ts"), "utf8");

const previousPassword = process.env.ADMIN_DASHBOARD_PASSWORD;
const previousSecret = process.env.ADMIN_SESSION_SECRET;

function restoreEnv() {
  if (previousPassword === undefined) delete process.env.ADMIN_DASHBOARD_PASSWORD;
  else process.env.ADMIN_DASHBOARD_PASSWORD = previousPassword;
  if (previousSecret === undefined) delete process.env.ADMIN_SESSION_SECRET;
  else process.env.ADMIN_SESSION_SECRET = previousSecret;
}

function loginRequest(password: unknown) {
  return new Request("http://127.0.0.1/api/admin/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password })
  });
}

async function main() {
  assert.doesNotMatch(authSource, /change-me/);
  assert.match(authSource, /timingSafeEqual/);
  assert.match(authSource, /createHash\("sha256"\)/);
  assert.doesNotMatch(loginSource, /console\.(log|info|debug|error|warn)/);
  assert.doesNotMatch(loginSource, /ADMIN_DASHBOARD_PASSWORD|ADMIN_SESSION_SECRET/);

  process.env.ADMIN_DASHBOARD_PASSWORD = "correct-horse";
  process.env.ADMIN_SESSION_SECRET = "dedicated-session-secret";
  assert.equal(isValidAdminPassword("correct-horse"), true);
  assert.equal(isValidAdminPassword("  correct-horse  "), true);
  assert.equal(isValidAdminPassword("correct-horsf"), false);
  assert.equal(isValidAdminPassword("wrong-password"), false);
  assert.equal(isValidAdminPassword(""), false);
  assert.equal(getAdminPassword(), "correct-horse");
  assert.equal(getAdminSessionSecret(), "dedicated-session-secret");

  const now = Date.parse("2026-10-20T12:00:00.000Z");
  const token = createAdminSessionValue(now);
  assert.equal(isValidAdminSessionValue(token, now), true);
  assert.equal(isValidAdminSessionValue(token, now + 8 * 60 * 60 * 1000), true);
  assert.equal(isValidAdminSessionValue(token, now + 8 * 60 * 60 * 1000 + 1), false);
  assert.equal(isValidAdminSessionValue("1", now), false);
  assert.equal(isValidAdminSessionValue("", now), false);
  assert.equal(isValidAdminSessionValue("v1.1.deadbeef", now), false);
  assert.equal(token.includes("correct-horse"), false);
  assert.equal(token.includes("dedicated-session-secret"), false);

  const cookie = adminAuthCookieOptions(60 * 60 * 8);
  assert.equal(cookie.name, ADMIN_AUTH_COOKIE);
  assert.equal(cookie.httpOnly, true);
  assert.equal(cookie.sameSite, "lax");
  assert.equal(cookie.path, "/");
  assert.equal(cookie.maxAge, 60 * 60 * 8);
  assert.equal(cookie.secure, process.env.NODE_ENV === "production");
  assert.match(cookie.value, /^v1\.\d+\.[0-9a-f]+$/);
  const cleared = adminAuthCookieOptions(0);
  assert.equal(cleared.value, "");
  assert.equal(cleared.maxAge, 0);

  const ok = await loginPost(loginRequest("correct-horse"));
  assert.equal(ok.status, 200);
  const okBody = (await ok.json()) as { ok?: boolean; error?: string };
  assert.equal(okBody.ok, true);
  assert.equal(okBody.error, undefined);
  const setCookie = ok.headers.get("set-cookie") ?? "";
  assert.match(setCookie, /anynanny_admin_auth=/);
  assert.match(setCookie, /HttpOnly/i);
  assert.match(setCookie, /SameSite=Lax/i);
  assert.doesNotMatch(setCookie, /correct-horse|dedicated-session-secret/);

  const near = await loginPost(loginRequest("correct-horsf"));
  const wrong = await loginPost(loginRequest("wrong-password"));
  assert.equal(near.status, 401);
  assert.equal(wrong.status, 401);
  assert.equal(near.headers.get("set-cookie"), null);
  assert.equal(wrong.headers.get("set-cookie"), null);
  const nearBody = (await near.json()) as { error?: string };
  const wrongBody = (await wrong.json()) as { error?: string };
  assert.equal(nearBody.error, "Invalid admin password.");
  assert.equal(wrongBody.error, wrongBody.error);
  assert.equal(nearBody.error, wrongBody.error);

  const malformed = await loginPost(
    new Request("http://127.0.0.1/api/admin/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{"
    })
  );
  assert.equal(malformed.status, 401);
  assert.equal(malformed.headers.get("set-cookie"), null);

  delete process.env.ADMIN_DASHBOARD_PASSWORD;
  delete process.env.ADMIN_SESSION_SECRET;
  assert.equal(getAdminPassword(), null);
  assert.equal(getAdminSessionSecret(), null);
  assert.equal(isValidAdminPassword("change-me"), false);
  assert.equal(isValidAdminPassword("correct-horse"), false);
  assert.equal(isValidAdminSessionValue(token, now), false);
  assert.throws(() => createAdminSessionValue(now), /Admin session secret is not configured/);
  assert.equal(adminAuthCookieOptions(0).value, "");

  const unconfigured = await loginPost(loginRequest("correct-horse"));
  assert.equal(unconfigured.status, 503);
  const unconfiguredBody = (await unconfigured.json()) as { error?: string };
  assert.equal(unconfiguredBody.error, "Admin login is unavailable.");
  assert.equal(unconfigured.headers.get("set-cookie"), null);
  assert.doesNotMatch(JSON.stringify(unconfiguredBody), /change-me|ADMIN_/);

  process.env.ADMIN_DASHBOARD_PASSWORD = "   ";
  process.env.ADMIN_SESSION_SECRET = "dedicated-session-secret";
  assert.equal(isValidAdminPassword("correct-horse"), false);
  const blankPassword = await loginPost(loginRequest("correct-horse"));
  assert.equal(blankPassword.status, 503);

  process.env.ADMIN_DASHBOARD_PASSWORD = "correct-horse";
  process.env.ADMIN_SESSION_SECRET = "   ";
  const blankSecret = await loginPost(loginRequest("correct-horse"));
  assert.equal(blankSecret.status, 503);
  assert.equal(blankSecret.headers.get("set-cookie"), null);
  assert.equal(isValidAdminSessionValue(token, now), false);

  console.log("admin login security checks passed");
}

void main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(restoreEnv);
