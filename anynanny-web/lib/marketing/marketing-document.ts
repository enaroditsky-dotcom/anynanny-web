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
 */
export async function marketingDocumentMetadata(): Promise<Metadata> {
  if (!DOMAIN_SEPARATION_ENABLED) return {};
  const headerList = await headers();
  const host = resolvePublicSiteHost({
    host: headerList.get("host"),
    forwardedHost: headerList.get("x-forwarded-host")
  });
  if (classifySiteHost(host) === "app") return {};
  return {
    manifest: "/marketing-site.webmanifest",
    appleWebApp: {
      capable: false,
      title: "AnyNanny",
      statusBarStyle: "default"
    }
  };
}
