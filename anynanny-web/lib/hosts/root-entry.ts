import { classifySiteRequest } from "@/lib/hosts/site-classifier";

export type RootEntry = "marketing" | "application";

/**
 * What `/` renders.
 *
 * Both domain-separation flags stay false until Preview and an explicit
 * Production approval. While they are false, every host keeps the application
 * entry, including www `/`.
 *
 * The decision uses only the host and the flags. A released iOS client that
 * opens www `/` cannot be recognized, so enabling both flags replaces that
 * entry with the marketing homepage. The homepage link to
 * https://app.anynanny.org/ is the entry for people who already have the app.
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
