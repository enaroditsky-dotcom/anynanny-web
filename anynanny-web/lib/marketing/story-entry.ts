import { welcomeSignupHref } from "@/lib/charter/routing";
import { toAppEntryHref } from "@/lib/hosts/app-entry";
import { DOMAIN_SEPARATION_ENABLED } from "@/lib/hosts/site-classifier";
import { readStudentJobsUtm } from "@/lib/marketing/student-jobs";

export type StoryAccountAction = "login" | "register";
export type StoryAccountRole = "parent" | "sitter";

function withCampaignParams(pathAndQuery: string, search: string | URLSearchParams): string {
  const utm = readStudentJobsUtm(search);
  const url = new URL(pathAndQuery, "https://app.anynanny.org");
  utm.forEach((value, key) => {
    url.searchParams.set(key, value);
  });
  const qs = url.searchParams.toString();
  return `${url.pathname}${qs ? `?${qs}` : ""}`;
}

/**
 * Story-site login, signup, and app-opening paths.
 * While domain separation is off these stay relative. Once it is on they open
 * https://app.anynanny.org. Only the five campaign params are copied.
 */
export function storyAppPath(
  pathAndQuery: string,
  search: string | URLSearchParams = "",
  domainSeparationEnabled: boolean = DOMAIN_SEPARATION_ENABLED
): string {
  return toAppEntryHref(withCampaignParams(pathAndQuery, search), domainSeparationEnabled);
}

export function storyLoginHref(
  search: string | URLSearchParams = "",
  domainSeparationEnabled: boolean = DOMAIN_SEPARATION_ENABLED
): string {
  return storyAppPath("/login", search, domainSeparationEnabled);
}

export function storyAccountHref(
  action: StoryAccountAction,
  role: StoryAccountRole,
  search: string | URLSearchParams = "",
  domainSeparationEnabled: boolean = DOMAIN_SEPARATION_ENABLED
): string {
  const utm = readStudentJobsUtm(search);
  if (action === "login") {
    const params = new URLSearchParams({ role, track: "babysitter" });
    utm.forEach((value, key) => params.set(key, value));
    return toAppEntryHref(`/login?${params.toString()}`, domainSeparationEnabled);
  }

  const next = new URLSearchParams({ role, track: "babysitter" });
  utm.forEach((value, key) => next.set(key, value));
  return storyAppPath(welcomeSignupHref(role, `/register?${next.toString()}`), search, domainSeparationEnabled);
}
