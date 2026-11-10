import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { BABYSITTER_CITY_SLUGS } from "../lib/marketing/babysitter-cities";
import {
  DOMAIN_SEPARATION_ENABLED,
  DOMAIN_SEPARATION_REDIRECT_STATUS,
  SITE_HOSTS,
  WWW_MARKETING_ROOT_ENABLED,
  classifySiteHost,
  classifySitePath,
  classifySiteRequest,
  domainSeparationRedirectTarget,
  isSiteAuthCallback,
  resolvePublicSiteHost
} from "../lib/hosts/site-classifier";
import { resolveRootEntry } from "../lib/hosts/root-entry";
import { resolveMarketingDocumentMetadata } from "../lib/marketing/marketing-document";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), "utf8");
}

assert.equal(DOMAIN_SEPARATION_ENABLED, true);
assert.equal(WWW_MARKETING_ROOT_ENABLED, true);
assert.equal(DOMAIN_SEPARATION_REDIRECT_STATUS, 308);
assert.equal(SITE_HOSTS.www, "www.anynanny.org");
assert.equal(SITE_HOSTS.app, "app.anynanny.org");
assert.equal(SITE_HOSTS.apex, "anynanny.org");

assert.equal(classifySiteHost("WWW.anynanny.org:443"), "www");
assert.equal(classifySiteHost("www.anynanny.org."), "www");
assert.equal(classifySiteHost("https://app.anynanny.org/parents?utm=1"), "app");
assert.equal(classifySiteHost("anynanny.org:443"), "apex");
assert.equal(classifySiteHost("app.anynanny.org.evil.com"), "unknown");
assert.equal(classifySiteHost("www.anynanny.org.attacker.test"), "unknown");
assert.equal(classifySiteHost("not-anynanny.org"), "unknown");
assert.equal(classifySiteHost("localhost:3000"), "unknown");
assert.equal(classifySiteHost("anynanny-preview.vercel.app"), "unknown");
assert.equal(classifySiteHost(""), "unknown");
assert.equal(classifySiteHost(null), "unknown");

assert.equal(classifySitePath("/"), "entry");
assert.equal(classifySitePath("/parents/"), "marketing");
assert.equal(classifySitePath("/babysitter"), "marketing");
assert.equal(classifySitePath("/jobs/students"), "marketing");
assert.equal(classifySitePath("/app"), "marketing");
assert.equal(classifySitePath("/privacy"), "marketing");
assert.equal(classifySitePath("/terms"), "marketing");
assert.equal(classifySitePath("/delete-account"), "marketing");
assert.equal(classifySitePath("/marketing/demo/index.html"), "marketing");
assert.equal(classifySitePath("/application"), "other");
assert.equal(classifySitePath("/parents-extra"), "other");
assert.equal(classifySitePath("/babysitter/haifa/extra"), "other");

for (const slug of BABYSITTER_CITY_SLUGS) {
  assert.equal(classifySitePath(`/babysitter/${slug}`), "marketing");
}

assert.equal(classifySitePath("/parent/dashboard"), "app");
assert.equal(classifySitePath("/sitter/settings"), "app");
assert.equal(classifySitePath("/welcome"), "app");
assert.equal(classifySitePath("/charter/full"), "app");
assert.equal(classifySitePath("/admin/login"), "app");
assert.equal(classifySitePath("/billing/test"), "app");
assert.equal(classifySitePath("/verify/done"), "app");
assert.equal(classifySitePath("/identity/verification/return"), "app");
assert.equal(classifySitePath("/session"), "app");
assert.equal(classifySitePath("/broadcast/questions"), "app");

assert.equal(classifySitePath("/api/webhooks/didit"), "api");
assert.equal(classifySitePath("/api/verify"), "api");
assert.equal(classifySitePath("/api/billing/israel-deposit"), "api");

assert.equal(classifySitePath("/login"), "auth");
assert.equal(classifySitePath("/register"), "auth");
assert.equal(classifySitePath("/reset-password"), "auth");
assert.equal(classifySitePath("/auth/verified"), "auth");
assert.equal(classifySitePath("/auth/reset-password"), "auth");
assert.equal(classifySitePath("/auth/forgot-password"), "auth");

assert.equal(isSiteAuthCallback("/", "?type=recovery"), true);
assert.equal(isSiteAuthCallback("/", "?type=Recovery"), true);
assert.equal(isSiteAuthCallback("/", "?Type=recovery"), false);
assert.equal(isSiteAuthCallback("/auth/verified", "?token_hash=abc&type=signup"), true);
assert.equal(isSiteAuthCallback("/auth/verified", "code=abc"), true);
assert.equal(isSiteAuthCallback("/auth/reset-password", "?code=abc"), true);
assert.equal(isSiteAuthCallback("/auth/verified", "?error=access_denied&error_code=otp_expired"), true);
assert.equal(isSiteAuthCallback("/parents", "?utm_source=ig&utm_campaign=parents"), false);
assert.equal(isSiteAuthCallback("/parent/dashboard", "?booking=1"), false);

const hosts = [
  "www.anynanny.org",
  "app.anynanny.org",
  "anynanny.org",
  "localhost",
  "anynanny-preview.vercel.app",
  ""
];
const samples: Array<[string, string]> = [
  ["/", ""],
  ["/", "?type=recovery"],
  ["/parents", "?utm_source=ig"],
  ["/babysitter/haifa", ""],
  ["/jobs/students", "?utm_campaign=students"],
  ["/app", ""],
  ["/parent/dashboard", "?booking=1"],
  ["/sitter/dashboard", ""],
  ["/login", "?role=parent"],
  ["/auth/verified", "?token_hash=abc&type=signup"],
  ["/auth/reset-password", "?code=abc"],
  ["/marketing/demo/index.html", "?role=parent"]
];

for (const host of hosts) {
  for (const [pathname, search] of samples) {
    const result = classifySiteRequest({ host, pathname, search, domainSeparationEnabled: false });
    assert.equal(result.domainSeparationEnabled, false);
    assert.deepEqual(result.serving, { mode: "combined" });
    assert.equal(result.search, search);
  }
}

const omitted = classifySiteRequest({
  host: "app.anynanny.org",
  pathname: "/parents",
  search: "?utm_source=ig"
});
assert.equal(omitted.domainSeparationEnabled, true);
assert.equal(omitted.hostRole, "app");
assert.equal(omitted.pathKind, "marketing");
assert.deepEqual(omitted.serving, {
  mode: "redirect-to-www",
  location: "https://www.anynanny.org/parents?utm_source=ig"
});

const explicitOff = classifySiteRequest({
  host: "anynanny.org",
  pathname: "/parent/dashboard",
  search: "?booking=1",
  domainSeparationEnabled: false
});
assert.deepEqual(explicitOff.serving, { mode: "combined" });
assert.equal(explicitOff.hostRole, "apex");
assert.equal(explicitOff.pathKind, "app");
assert.equal(explicitOff.search, "?booking=1");

function enabled(host: string, pathname: string, search = "") {
  return classifySiteRequest({
    host,
    pathname,
    search,
    domainSeparationEnabled: true,
    wwwMarketingRootEnabled: false
  });
}

const wwwHome = enabled("www.anynanny.org", "/");
assert.equal(wwwHome.hostRole, "www");
assert.equal(wwwHome.pathKind, "entry");
assert.equal(wwwHome.authCallback, false);
assert.deepEqual(wwwHome.serving, { mode: "application" });
assert.equal(domainSeparationRedirectTarget({
  host: "www.anynanny.org",
  pathname: "/",
  domainSeparationEnabled: true
}), null);

const wwwHomeUtm = enabled("www.anynanny.org", "/", "?utm_source=ig&utm_campaign=parents");
assert.equal(wwwHomeUtm.authCallback, false);
assert.equal(wwwHomeUtm.search, "?utm_source=ig&utm_campaign=parents");
assert.deepEqual(wwwHomeUtm.serving, { mode: "application" });

const wwwParents = enabled("www.anynanny.org", "/parents/", "?utm_source=ig&utm_campaign=parents");
assert.equal(wwwParents.pathKind, "marketing");
assert.equal(wwwParents.authCallback, false);
assert.deepEqual(wwwParents.serving, { mode: "marketing" });
assert.equal(wwwParents.search, "?utm_source=ig&utm_campaign=parents");

const wwwRecovery = enabled("www.anynanny.org", "/", "?type=recovery");
assert.equal(wwwRecovery.authCallback, true);
assert.deepEqual(wwwRecovery.serving, { mode: "auth" });

const wwwVerified = enabled(
  "www.anynanny.org",
  "/auth/verified",
  "?token_hash=abc&type=signup"
);
assert.equal(wwwVerified.pathKind, "auth");
assert.equal(wwwVerified.authCallback, true);
assert.deepEqual(wwwVerified.serving, { mode: "auth" });

const wwwReset = enabled("www.anynanny.org", "/auth/reset-password", "?code=abc");
assert.deepEqual(wwwReset.serving, { mode: "auth" });
assert.equal(wwwReset.search, "?code=abc");

const wwwDashboard = enabled("www.anynanny.org", "/parent/dashboard", "?booking=1");
assert.equal(wwwDashboard.pathKind, "app");
assert.deepEqual(wwwDashboard.serving, { mode: "application" });

const appHome = enabled("app.anynanny.org", "/");
assert.equal(appHome.hostRole, "app");
assert.deepEqual(appHome.serving, { mode: "application" });

const appParents = enabled("app.anynanny.org", "/parents", "?utm_source=ig");
assert.deepEqual(appParents.serving, {
  mode: "redirect-to-www",
  location: "https://www.anynanny.org/parents?utm_source=ig"
});

const appCity = enabled("app.anynanny.org", "/babysitter/haifa");
assert.deepEqual(appCity.serving, {
  mode: "redirect-to-www",
  location: "https://www.anynanny.org/babysitter/haifa"
});

const appLogin = enabled("app.anynanny.org", "/login", "?role=parent");
assert.equal(appLogin.pathKind, "auth");
assert.equal(appLogin.authCallback, false);
assert.deepEqual(appLogin.serving, { mode: "auth" });

const appRecovery = enabled("app.anynanny.org", "/", "?type=recovery&code=abc");
assert.equal(appRecovery.authCallback, true);
assert.deepEqual(appRecovery.serving, { mode: "auth" });
assert.equal(appRecovery.search, "?type=recovery&code=abc");

const apexParents = enabled("anynanny.org", "/parents", "?utm_source=ig");
assert.equal(apexParents.hostRole, "apex");
assert.deepEqual(apexParents.serving, {
  mode: "redirect-to-www",
  location: "https://www.anynanny.org/parents?utm_source=ig"
});

const apexDashboard = enabled("anynanny.org", "/parent/dashboard", "?booking=1");
assert.deepEqual(apexDashboard.serving, {
  mode: "redirect-to-www",
  location: "https://www.anynanny.org/parent/dashboard?booking=1"
});

const apexRecovery = enabled("anynanny.org", "/", "?type=recovery");
assert.equal(apexRecovery.authCallback, true);
assert.deepEqual(apexRecovery.serving, { mode: "auth" });
assert.equal(domainSeparationRedirectTarget({
  host: "anynanny.org",
  pathname: "/",
  search: "?type=recovery",
  domainSeparationEnabled: true
}), null);

const apexVerified = enabled("anynanny.org", "/auth/verified", "?token_hash=abc&type=signup");
assert.deepEqual(apexVerified.serving, { mode: "auth" });
assert.equal(apexVerified.search, "?token_hash=abc&type=signup");

const apexReset = enabled("anynanny.org", "/auth/reset-password", "?code=abc");
assert.deepEqual(apexReset.serving, { mode: "auth" });

const apexRegister = enabled("anynanny.org", "/register", "?role=parent&utm_source=ig");
assert.equal(apexRegister.pathKind, "auth");
assert.deepEqual(apexRegister.serving, { mode: "auth" });
assert.equal(apexRegister.search, "?role=parent&utm_source=ig");

const preview = enabled("anynanny-preview.vercel.app", "/parent/dashboard", "?booking=1");
assert.equal(preview.hostRole, "unknown");
assert.deepEqual(preview.serving, { mode: "combined" });

const localhost = enabled("localhost:3000", "/", "?type=recovery");
assert.equal(localhost.hostRole, "unknown");
assert.equal(localhost.authCallback, true);
assert.deepEqual(localhost.serving, { mode: "combined" });

const legacyWwwRoutes = [
  "/parent/dashboard",
  "/sitter/dashboard",
  "/sitter/settings",
  "/welcome",
  "/login",
  "/register",
  "/verify/done",
  "/parent/checkout/complete"
];
for (const pathname of legacyWwwRoutes) {
  const onWww = enabled("www.anynanny.org", pathname, "?booking=1");
  assert.notEqual(onWww.serving.mode, "redirect-to-www");
  assert.equal(onWww.search, "?booking=1");
  assert.equal(domainSeparationRedirectTarget({
    host: "www.anynanny.org",
    pathname,
    search: "?booking=1",
    domainSeparationEnabled: true
  }), null);
}

for (const host of ["www.anynanny.org", "app.anynanny.org", "anynanny.org"]) {
  for (const pathname of ["/api/webhooks/didit", "/api/verify", "/api/billing/israel-deposit"]) {
    const disabled = classifySiteRequest({
      host,
      pathname,
      search: "?attempt=1",
      domainSeparationEnabled: false
    });
    assert.equal(disabled.pathKind, "api");
    assert.deepEqual(disabled.serving, { mode: "combined" });
    const active = enabled(host, pathname, "?attempt=1");
    assert.equal(active.pathKind, "api");
    assert.deepEqual(active.serving, { mode: "api" });
    assert.equal(active.search, "?attempt=1");
    assert.equal(domainSeparationRedirectTarget({
      host,
      pathname,
      search: "?attempt=1",
      domainSeparationEnabled: true
    }), null);
  }
}

const preparedRoot = classifySiteRequest({
  host: "www.anynanny.org",
  pathname: "/",
  domainSeparationEnabled: true,
  wwwMarketingRootEnabled: true
});
assert.deepEqual(preparedRoot.serving, { mode: "marketing" });

const preparedRootStillOff = classifySiteRequest({
  host: "www.anynanny.org",
  pathname: "/",
  domainSeparationEnabled: false,
  wwwMarketingRootEnabled: true
});
assert.deepEqual(preparedRootStillOff.serving, { mode: "combined" });

const preparedRecovery = classifySiteRequest({
  host: "www.anynanny.org",
  pathname: "/",
  search: "?type=recovery",
  domainSeparationEnabled: true,
  wwwMarketingRootEnabled: true
});
assert.deepEqual(preparedRecovery.serving, { mode: "auth" });

const preparedDoesNotMoveApp = classifySiteRequest({
  host: "app.anynanny.org",
  pathname: "/",
  domainSeparationEnabled: true,
  wwwMarketingRootEnabled: true
});
assert.deepEqual(preparedDoesNotMoveApp.serving, { mode: "application" });

const embeddedQuery = classifySiteRequest({
  host: "www.anynanny.org",
  pathname: "/jobs/students?utm_campaign=students"
});
assert.equal(embeddedQuery.pathname, "/jobs/students");
assert.equal(embeddedQuery.search, "?utm_campaign=students");
assert.equal(embeddedQuery.pathKind, "marketing");
assert.deepEqual(embeddedQuery.serving, { mode: "marketing" });

const middleware = read("middleware.ts");
assert.match(middleware, /if \(DOMAIN_SEPARATION_ENABLED\)/);
assert.match(middleware, /classifySiteRequest/);
assert.match(middleware, /DOMAIN_SEPARATION_REDIRECT_STATUS/);
assert.match(middleware, /shouldForwardRootAuthCallback/);
assert.doesNotMatch(middleware, /DOMAIN_SEPARATION_ENABLED\s*=\s*true/);
assert.doesNotMatch(middleware, /wwwMarketingRootEnabled/);
assert.doesNotMatch(middleware, /userAgent|user-agent|WebView/);

const untouched = ["app/layout.tsx", "public/manifest.webmanifest", "next.config.ts", "public/sw.js"]
  .map(read)
  .join("\n");
assert.doesNotMatch(untouched, /site-classifier|classifySiteRequest|DOMAIN_SEPARATION_ENABLED|WWW_MARKETING_ROOT_ENABLED/);
assert.equal(existsSync(resolve(root, "app/manifest.ts")), false);
const appManifest = JSON.parse(read("public/manifest.webmanifest")) as {
  display?: string;
  start_url?: string;
  icons?: unknown[];
};
assert.equal(appManifest.display, "standalone");
assert.equal(appManifest.start_url, "/");
assert.ok((appManifest.icons?.length ?? 0) >= 2);
const marketingManifest = JSON.parse(read("public/marketing-site.webmanifest")) as {
  display?: string;
  icons?: unknown;
};
assert.equal(marketingManifest.display, "browser");
assert.equal(marketingManifest.icons, undefined);
assert.match(read("app/layout.tsx"), /manifest: "\/manifest\.webmanifest"/);
const wwwMarketingMetadata = resolveMarketingDocumentMetadata({
  domainSeparationEnabled: true,
  host: "www.anynanny.org"
});
assert.equal(wwwMarketingMetadata.manifest, "/marketing-site.webmanifest");
const appleWebApp = wwwMarketingMetadata.appleWebApp;
assert.equal(typeof appleWebApp, "object");
assert.ok(appleWebApp);
if (typeof appleWebApp !== "object" || appleWebApp === null) {
  throw new Error("Expected an Apple web app metadata object.");
}
assert.equal(appleWebApp.capable, false);
assert.deepEqual(
  resolveMarketingDocumentMetadata({
    domainSeparationEnabled: true,
    host: "app.anynanny.org"
  }),
  {}
);
assert.deepEqual(
  resolveMarketingDocumentMetadata({
    domainSeparationEnabled: false,
    host: "www.anynanny.org"
  }),
  {}
);

const home = read("app/page.tsx");
assert.match(home, /resolveRootEntry/);
assert.match(home, /DOMAIN_SEPARATION_ENABLED/);
assert.match(home, /WWW_MARKETING_ROOT_ENABLED/);
assert.match(home, /ApplicationHomePage/);
assert.match(home, /MarketingHomePage/);
assert.doesNotMatch(home, /DOMAIN_SEPARATION_ENABLED\s*=\s*true/);
assert.doesNotMatch(home, /WWW_MARKETING_ROOT_ENABLED\s*=\s*true/);
assert.doesNotMatch(home, /userAgent|user-agent|WebView/);

const source = read("lib/hosts/site-classifier.ts");
assert.equal(source.includes("userAgent"), false);
assert.equal(source.includes("user-agent"), false);
assert.equal(source.includes("WebView"), false);
assert.equal(source.includes("process.env"), false);
assert.match(source, /DOMAIN_SEPARATION_ENABLED = true/);
assert.match(source, /WWW_MARKETING_ROOT_ENABLED = true/);

const storeLinks = read("public/marketing/demo/store-links.js");
assert.match(storeLinks, /const DOMAIN_SEPARATION_ENABLED = true/);
assert.match(storeLinks, /const APP_STORE_URL = ""/);
assert.match(storeLinks, /const path = `\/welcome\?\$\{welcome\.toString\(\)\}`;/);
assert.match(storeLinks, /DOMAIN_SEPARATION_ENABLED \? `https:\/\/app\.anynanny\.org\$\{path\}` : path/);

assert.equal(
  resolvePublicSiteHost({
    host: "www.anynanny.org",
    forwardedHost: "www.anynanny.org"
  }),
  "www.anynanny.org"
);
assert.equal(resolvePublicSiteHost({ host: "app.anynanny.org:443" }), "app.anynanny.org");
assert.equal(
  resolvePublicSiteHost({ forwardedHost: "www.anynanny.org, app.anynanny.org" }),
  "www.anynanny.org"
);
assert.equal(
  resolvePublicSiteHost({
    host: "app.anynanny.org",
    forwardedHost: "www.anynanny.org, evil.example"
  }),
  "app.anynanny.org"
);
assert.equal(
  resolvePublicSiteHost({
    host: "www.anynanny.org",
    forwardedHost: "app.anynanny.org"
  }),
  "www.anynanny.org"
);

const flagsOn = {
  domainSeparationEnabled: true,
  wwwMarketingRootEnabled: true
};
assert.equal(
  resolveRootEntry({
    host: resolvePublicSiteHost({
      host: "www.anynanny.org",
      forwardedHost: "www.anynanny.org"
    }),
    ...flagsOn
  }),
  "marketing"
);
assert.equal(
  resolveRootEntry({
    host: resolvePublicSiteHost({
      host: "app.anynanny.org",
      forwardedHost: "www.anynanny.org"
    }),
    ...flagsOn
  }),
  "application"
);
assert.equal(
  resolveRootEntry({
    host: resolvePublicSiteHost({
      host: "www.anynanny.org",
      forwardedHost: "app.anynanny.org"
    })
  }),
  "marketing"
);

assert.match(middleware, /resolvePublicSiteHost/);
assert.match(middleware, /req\.headers\.get\("host"\) \|\| req\.nextUrl\.host/);
assert.match(home, /resolvePublicSiteHost/);
assert.doesNotMatch(home, /x-forwarded-host"\) \?\?/);
assert.match(read("lib/marketing/marketing-document.ts"), /resolvePublicSiteHost/);

console.log("domain separation classifier: ok");
