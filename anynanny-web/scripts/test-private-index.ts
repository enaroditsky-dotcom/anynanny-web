import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { classifySitePath } from "../lib/hosts/site-classifier";
import { buildPublicRobots } from "../lib/seo/public-robots";
import { NOINDEX_PREFIXES, isNoindexPath } from "../lib/seo/private-index";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const config = readFileSync(resolve(root, "next.config.ts"), "utf8");
const robots = buildPublicRobots();
const rules = Array.isArray(robots.rules) ? robots.rules[0] : robots.rules;

for (const prefix of NOINDEX_PREFIXES) {
  const kind = classifySitePath(prefix);
  assert.ok(kind === "app" || kind === "auth", `${prefix} classified as ${kind}`);
  assert.equal(isNoindexPath(prefix), true);
  assert.equal(isNoindexPath(`${prefix}/dashboard`), true);
}

const publicPaths = [
  "/",
  "/parents",
  "/babysitter",
  "/babysitter/tel-aviv",
  "/app",
  "/story",
  "/marketing/meet",
  "/jobs/students",
  "/privacy",
  "/terms",
  "/delete-account"
];
for (const path of publicPaths) {
  assert.equal(isNoindexPath(path), false, path);
}

assert.equal(rules?.allow, "/");
assert.equal(rules?.disallow, undefined);
assert.match(config, /X-Robots-Tag/);
assert.match(config, /noindexHeaderRoutes/);
assert.match(config, /host", value: "app\.anynanny\.org"/);
assert.match(readFileSync(resolve(root, "app/page.tsx"), "utf8"), /NOINDEX_METADATA/);

console.log("private index: ok");
