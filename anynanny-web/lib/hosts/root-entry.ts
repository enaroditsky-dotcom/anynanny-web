import { classifySiteRequest } from "@/lib/hosts/site-classifier";

export type RootEntry = "marketing" | "application";

/**
 * What `/` renders.
 *
 * Both domain-separation flags are on for the approved marketing launch.
 * While either flag is off, www `/` stays the application entry.
 *
 * The decision uses only the host and the flags. A released iOS client that
 * opens www `/` cannot be recognized, so both flags replace that entry with
 * the marketing homepage. The homepage link to https://app.anynanny.org/ is
 * the entry for people who already have the app.
 */
export function resolveRootEntry(input: {
  host?: string | null;
  pathname?: string | null;
  search?: string | null;
  domainSeparationEnabled?: boolean;
  wwwMarketingRootEnabled?: boolean;
} = {}): RootEntry {
  const decision = classifySiteRequest({
    host: input.host,
    pathname: input.pathname ?? "/",
    search: input.search,
    domainSeparationEnabled: input.domainSeparationEnabled,
    wwwMarketingRootEnabled: input.wwwMarketingRootEnabled
  });
  return decision.serving.mode === "marketing" ? "marketing" : "application";
}
