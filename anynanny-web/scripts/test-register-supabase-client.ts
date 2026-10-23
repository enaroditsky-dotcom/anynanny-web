import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), "utf8");
}

const register = read("app/register/page.tsx");
const login = read("app/auth/login/page.tsx");
const signUp = read("app/auth/sign-up/page.tsx");
const client = read("lib/supabase/client.ts");

assert.match(register, /getSupabaseBrowserClient/);
assert.match(login, /getSupabaseBrowserClient/);
assert.match(signUp, /getSupabaseBrowserClient/);
assert.doesNotMatch(register, /createBrowserClient/);
assert.doesNotMatch(register, /supabase\.co/);
assert.doesNotMatch(register, /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\./);

assert.match(client, /NEXT_PUBLIC_SUPABASE_URL/);
assert.match(client, /NEXT_PUBLIC_SUPABASE_ANON_KEY/);
assert.match(client, /if \(browserClient\) return browserClient/);

assert.match(register, /AgeGateStep/);
assert.match(register, /MarketingConsentCheckbox/);
assert.match(register, /createRegistrationMarketingConsent\(marketingConsent\)/);
assert.match(register, /upsertProfileOnSignup\(supabase/);
assert.match(register, /emailRedirectTo: `\$\{window\.location\.origin\}\/auth\/verified`/);
assert.match(register, /\/login\?role=sitter&track=expert/);
assert.match(register, /if \(!acceptedLegal\)/);
assert.doesNotMatch(register, /if \(!marketingConsent\)/);

console.log("register supabase client: ok");
