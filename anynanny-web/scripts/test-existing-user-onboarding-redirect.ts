import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  classifyOnboardingRead,
  classifySitterOnboardingRead,
  isForcedOnboardingNext,
  isOnboardingUnavailablePath,
  onboardingUnreadableHref
} from "../lib/auth/onboarding-state";
import {
  getParentOnboardingGateRedirect,
  getSitterOnboardingGateRedirect,
  resolvePostAuthPath
} from "../lib/auth/post-auth-destination";
import {
  classifyPortalAccess,
  interpretProductProfileOwnership
} from "../lib/auth/product-profiles";
import { PARENT_CHARTER_VERSION, SITTER_CHARTER_VERSION } from "../lib/charter/versions";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
function read(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), "utf8");
}

const USER = "11111111-1111-1111-1111-111111111111";
const PARENT_DONE = "2024-06-01T00:00:00.000Z";
const SITTER_DONE = "2024-06-02T00:00:00.000Z";
const PERMISSION_ERROR = { message: "permission denied for table profiles" };
const NETWORK_ERROR = { message: "Failed to fetch" };
const PARENT_SCHEMA_ERROR = {
  message: "Could not find the 'parent_onboarding_completed_at' column of 'profiles' in the schema cache"
};
const SITTER_SCHEMA_ERROR = {
  message: "Could not find the 'onboarding_completed_at' column of 'sitter_profiles' in the schema cache"
};

type Step = { table: string; data: unknown; error?: { message: string } | null };

function scripted(steps: Step[]) {
  let index = 0;
  const client = {
    auth: {
      getUser: async () => ({
        data: { user: { id: USER, email: "member@example.com" } },
        error: null
      })
    },
    from(table: string) {
      const step = steps[index];
      if (!step) throw new Error(`unexpected query ${table}`);
      if (step.table !== table) {
        throw new Error(`query ${index}: expected ${step.table}, received ${table}`);
      }
      index += 1;
      const payload = { data: step.data, error: step.error ?? null };
      const builder = {
        select() {
          return builder;
        },
        eq() {
          return builder;
        },
        maybeSingle: async () => payload
      };
      return builder;
    }
  };
  return {
    client: client as unknown as SupabaseClient,
    done() {
      assert.equal(index, steps.length);
    }
  };
}

function profile(role: string, completedAt: string | null): Step {
  return { table: "profiles", data: { role, parent_onboarding_completed_at: completedAt } };
}

function sitter(completedAt: string | null): Step {
  return { table: "sitter_profiles", data: { onboarding_completed_at: completedAt } };
}

function sitterMissing(): Step {
  return { table: "sitter_profiles", data: null };
}

function charter(role: "parent" | "sitter", accepted: boolean, error?: { message: string }): Step {
  const version = role === "parent" ? PARENT_CHARTER_VERSION : SITTER_CHARTER_VERSION;
  return {
    table: "user_charter_acceptances",
    data: accepted ? { id: "acc", charter_version: version } : null,
    error: error ?? null
  };
}

const asParent = { userEmail: "parent@example.com", requestedRole: "parent" as const };
const asSitter = { userEmail: "sitter@example.com", requestedRole: "sitter" as const };

async function destination(steps: Step[], next: string | null, options: typeof asParent | typeof asSitter) {
  const script = scripted(steps);
  const dest = await resolvePostAuthPath(script.client, USER, next, options);
  script.done();
  return dest;
}

function assertUnavailable(dest: string, role: "parent" | "sitter") {
  assert.equal(dest, onboardingUnreadableHref(role));
  assert.equal(isOnboardingUnavailablePath(dest), true);
  assert.equal(dest.includes("/parent/onboarding"), false);
  assert.equal(dest.includes("/sitter/onboarding"), false);
  assert.equal(dest.includes("/charter"), false);
  assert.equal(dest.includes("/welcome"), false);
}

async function main() {
  assert.equal(
    classifySitterOnboardingRead({ error: null, completedAt: SITTER_DONE, isPublic: false }).state,
    "complete"
  );
  assert.equal(
    classifySitterOnboardingRead({ error: null, completedAt: null, isPublic: true }).state,
    "complete"
  );
  assert.equal(
    classifySitterOnboardingRead({ error: null, completedAt: null, isPublic: true }).completedAt,
    null
  );
  assert.equal(
    classifySitterOnboardingRead({ error: null, completedAt: null, isPublic: false }).state,
    "incomplete"
  );
  assert.equal(
    classifySitterOnboardingRead({ error: null, completedAt: null, isPublic: null }).state,
    "incomplete"
  );
  assert.equal(
    classifySitterOnboardingRead({ error: PERMISSION_ERROR, completedAt: null, isPublic: true }).state,
    "unreadable"
  );

  assert.equal(classifyOnboardingRead({ error: null, completedAt: PARENT_DONE }).state, "complete");
  assert.equal(classifyOnboardingRead({ error: null, completedAt: null }).state, "incomplete");
  assert.equal(classifyOnboardingRead({ error: null, completedAt: "  " }).state, "incomplete");
  assert.equal(classifyOnboardingRead({ error: PERMISSION_ERROR, completedAt: null }).state, "unreadable");
  assert.equal(classifyOnboardingRead({ error: NETWORK_ERROR, completedAt: PARENT_DONE }).state, "unreadable");
  assert.notEqual(classifyOnboardingRead({ error: SITTER_SCHEMA_ERROR, completedAt: null }).state, "incomplete");

  assert.equal(isForcedOnboardingNext("/parent/onboarding"), true);
  assert.equal(isForcedOnboardingNext("/parent/onboarding?step=3"), true);
  assert.equal(isForcedOnboardingNext("/sitter/onboarding/"), true);
  assert.equal(isForcedOnboardingNext("/charter?role=parent"), true);
  assert.equal(isForcedOnboardingNext("/welcome?role=sitter"), true);
  assert.equal(isForcedOnboardingNext("/parent/dashboard"), false);
  assert.equal(isForcedOnboardingNext("/parent/profile"), false);
  assert.equal(isForcedOnboardingNext("/sitter/dashboard"), false);

  const unreadableParent = interpretProductProfileOwnership({
    role: "parent",
    parent_onboarding_completed_at: PARENT_DONE,
    parentOnboardingState: "unreadable",
    sitterOnboardingState: "incomplete"
  });
  assert.equal(unreadableParent.parentOnboardingState, "unreadable");
  assert.equal(unreadableParent.parentOnboardingComplete, false);
  assert.equal(unreadableParent.hasParent, true);
  assert.equal(
    classifyPortalAccess({ status: "ready", ownership: unreadableParent }, "parent"),
    "unreadable"
  );
  assert.equal(classifyPortalAccess({ status: "unreadable" }, "sitter"), "unreadable");
  assert.equal(classifyPortalAccess({ status: "missing" }, "parent"), "unowned");

  assert.equal(
    await destination(
      [profile("parent", PARENT_DONE), sitter(null)],
      "/parent/onboarding?step=2",
      asParent
    ),
    "/parent/dashboard"
  );
  assert.equal(
    await destination([profile("parent", PARENT_DONE), sitter(null)], "/charter?role=parent", asParent),
    "/parent/dashboard"
  );
  assert.equal(
    await destination([profile("parent", PARENT_DONE), sitter(null)], "/welcome?role=parent", asParent),
    "/parent/dashboard"
  );
  assert.equal(
    await destination([profile("parent", PARENT_DONE), sitter(null)], "/parent/profile", asParent),
    "/parent/profile"
  );
  assert.equal(
    await destination(
      [profile("parent", PARENT_DONE), { table: "sitter_profiles", data: null, error: NETWORK_ERROR }],
      "/parent/onboarding",
      asParent
    ),
    "/parent/dashboard"
  );

  assert.equal(
    await destination(
      [profile("parent", null), sitter(null), charter("parent", false)],
      "/parent/dashboard",
      asParent
    ),
    "/charter?role=parent"
  );
  assert.equal(
    await destination(
      [profile("parent", null), sitter(null), charter("parent", true)],
      "/parent/dashboard",
      asParent
    ),
    "/parent/onboarding"
  );
  assertUnavailable(
    await destination(
      [profile("parent", null), sitter(null), charter("parent", false, NETWORK_ERROR)],
      "/parent/dashboard",
      asParent
    ),
    "parent"
  );

  assertUnavailable(
    await destination([{ table: "profiles", data: null, error: PERMISSION_ERROR }], "/parent/onboarding", asParent),
    "parent"
  );
  assertUnavailable(
    await destination(
      [
        { table: "profiles", data: null, error: PARENT_SCHEMA_ERROR },
        { table: "profiles", data: { role: "parent" } },
        sitter(null)
      ],
      "/parent/dashboard",
      asParent
    ),
    "parent"
  );
  assertUnavailable(
    await destination([{ table: "profiles", data: null, error: NETWORK_ERROR }], null, asParent),
    "parent"
  );

  assert.equal(
    await destination(
      [profile("sitter", null), { table: "sitter_profiles", data: { onboarding_completed_at: null, is_public: true } }],
      "/sitter/onboarding",
      asSitter
    ),
    "/sitter/dashboard"
  );
  assert.equal(
    await destination(
      [
        profile("sitter", null),
        { table: "sitter_profiles", data: { onboarding_completed_at: null, is_public: false } },
        charter("sitter", false)
      ],
      "/sitter/dashboard",
      asSitter
    ),
    "/charter?role=sitter"
  );

  assert.equal(
    await destination([profile("sitter", null), sitter(SITTER_DONE)], "/sitter/onboarding", asSitter),
    "/sitter/dashboard"
  );
  assert.equal(
    await destination([profile("sitter", null), sitter(SITTER_DONE)], "/charter?role=sitter", asSitter),
    "/sitter/dashboard"
  );
  assert.equal(
    await destination([profile("sitter", null), sitter(SITTER_DONE)], "/welcome?role=sitter", asSitter),
    "/sitter/dashboard"
  );
  assert.equal(
    await destination(
      [profile("sitter", null), { table: "sitter_profiles", data: null, error: PERMISSION_ERROR }],
      "/sitter/onboarding",
      asSitter
    ),
    onboardingUnreadableHref("sitter")
  );
  assertUnavailable(
    await destination(
      [profile("sitter", null), { table: "sitter_profiles", data: null, error: SITTER_SCHEMA_ERROR }],
      "/sitter/dashboard",
      asSitter
    ),
    "sitter"
  );

  assert.equal(
    await destination(
      [profile("sitter", null), sitter(null), charter("sitter", false)],
      "/sitter/dashboard",
      asSitter
    ),
    "/charter?role=sitter"
  );
  assert.equal(
    await destination(
      [profile("sitter", null), sitterMissing(), charter("sitter", true)],
      "/sitter/dashboard",
      asSitter
    ),
    "/sitter/onboarding"
  );
  assertUnavailable(
    await destination(
      [profile("sitter", null), sitter(null), charter("sitter", false, { message: "permission denied for table user_charter_acceptances" })],
      "/sitter/onboarding",
      asSitter
    ),
    "sitter"
  );

  const exploding = {
    auth: { getUser: async () => { throw new Error("network down"); } },
    from() {
      throw new Error("network down");
    }
  } as unknown as SupabaseClient;
  assertUnavailable(
    await resolvePostAuthPath(exploding, USER, "/parent/onboarding", asParent),
    "parent"
  );
  assertUnavailable(
    await resolvePostAuthPath(exploding, USER, "/sitter/onboarding", asSitter),
    "sitter"
  );
  assert.equal(
    await resolvePostAuthPath(exploding, "", "/parent/onboarding", asParent),
    "/auth/login?next=/auth/role-selection"
  );

  const parentDashboard = scripted([profile("parent", PARENT_DONE), sitter(null)]);
  assert.equal(
    await getParentOnboardingGateRedirect(parentDashboard.client, USER, "/parent/dashboard"),
    null
  );
  parentDashboard.done();

  const parentLeaveWizard = scripted([profile("parent", PARENT_DONE), sitter(null)]);
  assert.equal(
    await getParentOnboardingGateRedirect(parentLeaveWizard.client, USER, "/parent/onboarding"),
    "/parent/dashboard"
  );
  parentLeaveWizard.done();

  const parentNeedsCharter = scripted([profile("parent", null), sitter(null), charter("parent", false)]);
  assert.equal(
    await getParentOnboardingGateRedirect(parentNeedsCharter.client, USER, "/parent/dashboard"),
    "/charter?role=parent"
  );
  parentNeedsCharter.done();

  const parentStayOnboarding = scripted([profile("parent", null), sitter(null), charter("parent", true)]);
  assert.equal(
    await getParentOnboardingGateRedirect(parentStayOnboarding.client, USER, "/parent/onboarding"),
    null
  );
  parentStayOnboarding.done();

  const parentUnreadableGate = scripted([{ table: "profiles", data: null, error: PERMISSION_ERROR }]);
  assertUnavailable(
    (await getParentOnboardingGateRedirect(parentUnreadableGate.client, USER, "/parent/onboarding")) ?? "",
    "parent"
  );
  parentUnreadableGate.done();

  const parentMissing = scripted([{ table: "profiles", data: null }]);
  assert.equal(
    await getParentOnboardingGateRedirect(parentMissing.client, USER, "/parent/dashboard"),
    "/auth/role-selection"
  );
  parentMissing.done();

  const sitterDashboard = scripted([sitter(SITTER_DONE)]);
  assert.equal(
    await getSitterOnboardingGateRedirect(sitterDashboard.client, USER, "/sitter/dashboard"),
    null
  );
  sitterDashboard.done();

  const sitterLeaveWizard = scripted([sitter(SITTER_DONE)]);
  assert.equal(
    await getSitterOnboardingGateRedirect(sitterLeaveWizard.client, USER, "/sitter/onboarding"),
    "/sitter/dashboard"
  );
  sitterLeaveWizard.done();

  const legacyPublicGate = scripted([
    { table: "sitter_profiles", data: { onboarding_completed_at: null, is_public: true } }
  ]);
  assert.equal(
    await getSitterOnboardingGateRedirect(legacyPublicGate.client, USER, "/sitter/onboarding"),
    "/sitter/dashboard"
  );
  legacyPublicGate.done();

  const sitterNeedsCharter = scripted([sitter(null), charter("sitter", false)]);
  assert.equal(
    await getSitterOnboardingGateRedirect(sitterNeedsCharter.client, USER, "/sitter/dashboard"),
    "/charter?role=sitter"
  );
  sitterNeedsCharter.done();

  const sitterStayOnboarding = scripted([sitterMissing(), charter("sitter", true)]);
  assert.equal(
    await getSitterOnboardingGateRedirect(sitterStayOnboarding.client, USER, "/sitter/onboarding"),
    null
  );
  sitterStayOnboarding.done();

  const sitterUnreadableGate = scripted([{ table: "sitter_profiles", data: null, error: NETWORK_ERROR }]);
  assertUnavailable(
    (await getSitterOnboardingGateRedirect(sitterUnreadableGate.client, USER, "/sitter/onboarding")) ?? "",
    "sitter"
  );
  sitterUnreadableGate.done();

  const sitterSchemaGate = scripted([{ table: "sitter_profiles", data: null, error: SITTER_SCHEMA_ERROR }]);
  assertUnavailable(
    (await getSitterOnboardingGateRedirect(sitterSchemaGate.client, USER, "/sitter/dashboard")) ?? "",
    "sitter"
  );
  sitterSchemaGate.done();

  const page = read("app/auth/onboarding-unavailable/page.tsx");
  const panel = read("components/auth/onboarding-unavailable-panel.tsx");
  const gate = read("components/auth/product-portal-gate.tsx");
  const mismatch = read("app/auth/role-mismatch/page.tsx");
  assert.match(panel, /נסו שוב/);
  assert.match(page, /resolvePostAuthPath\(supabase, user\.id, null/);
  assert.doesNotMatch(`${page}\n${panel}`, /\/parent\/onboarding|\/sitter\/onboarding|\/charter|\/welcome/);
  assert.match(gate, /onboardingUnreadableHref/);
  assert.match(gate, /classifyPortalAccess/);
  assert.match(mismatch, /onboardingUnreadableHref/);
  assert.match(mismatch, /resolvePostAuthPath/);
  assert.doesNotMatch(mismatch, /sitterOnboardingComplete \? SITTER_DASHBOARD_PATH : SITTER_ONBOARDING_PATH/);
  assert.doesNotMatch(mismatch, /parentOnboardingComplete \? PARENT_DASHBOARD_PATH : PARENT_ONBOARDING_PATH/);

  console.log("existing-user-onboarding-redirect: ok");
}

void main();
