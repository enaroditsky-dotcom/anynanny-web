import type { Metadata } from "next";
import { headers } from "next/headers";
import {
  DOMAIN_SEPARATION_ENABLED,
  classifySiteHost,
  resolvePublicSiteHost
} from "@/lib/hosts/site-classifier";

/**
 * Marketing documents on any host other than the application origin.
 * A browser manifest is not installable, and iOS is not told this page is the app.
 * The application origin keeps the root manifest and Home Screen metadata.
 *
 * `app/manifest.ts` is intentionally absent. Next applies that file after page
 * metadata and would replace this link with the installable application manifest.
 */
export function resolveMarketingDocumentMetadata(input: {
  domainSeparationEnabled?: boolean;
  host?: string | null;
}): Metadata {
  const domainSeparationEnabled = input.domainSeparationEnabled ?? DOMAIN_SEPARATION_ENABLED;
  if (!domainSeparationEnabled) return {};
  if (classifySiteHost(input.host) === "app") return {};
  return {
    manifest: "/marketing-site.webmanifest",
    appleWebApp: {
      capable: false,
      title: "AnyNanny",
      statusBarStyle: "default"
    }
  };
}

export async function marketingDocumentMetadata(): Promise<Metadata> {
  if (!DOMAIN_SEPARATION_ENABLED) return {};
  const headerList = await headers();
  return resolveMarketingDocumentMetadata({
    domainSeparationEnabled: true,
    host: resolvePublicSiteHost({
      host: headerList.get("host"),
      forwardedHost: headerList.get("x-forwarded-host")
    })
  });
}
