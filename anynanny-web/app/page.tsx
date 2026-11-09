import type { Metadata } from "next";
import { headers } from "next/headers";
import { ApplicationHomePage } from "@/components/home/application-home-page";
import { MarketingHomeAuthHandoff } from "@/components/marketing/marketing-home-auth-handoff";
import { MarketingHomePage } from "@/components/marketing/marketing-home-page";
import {
  DOMAIN_SEPARATION_ENABLED,
  WWW_MARKETING_ROOT_ENABLED,
  resolvePublicSiteHost
} from "@/lib/hosts/site-classifier";
import { resolveRootEntry } from "@/lib/hosts/root-entry";
import { generalWebAppHref, utmSearchFromRecord } from "@/lib/marketing/general-acquisition";
import {
  MARKETING_HOME_CANONICAL,
  MARKETING_HOME_DESCRIPTION,
  MARKETING_HOME_TITLE
} from "@/lib/marketing/marketing-home";
import { marketingDocumentMetadata } from "@/lib/marketing/marketing-document";

type HomeSearch = Record<string, string | string[] | undefined>;

function searchFromRecord(params: HomeSearch): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") query.set(key, value);
    else if (Array.isArray(value) && value[0]) query.set(key, value[0]);
  }
  const rendered = query.toString();
  return rendered ? `?${rendered}` : "";
}

async function requestHost(): Promise<string> {
  const headerList = await headers();
  return resolvePublicSiteHost({
    host: headerList.get("host"),
    forwardedHost: headerList.get("x-forwarded-host")
  });
}

function marketingRootActive(): boolean {
  return DOMAIN_SEPARATION_ENABLED && WWW_MARKETING_ROOT_ENABLED;
}

async function currentRootEntry(params: HomeSearch) {
  if (!marketingRootActive()) return "application" as const;
  return resolveRootEntry({
    host: await requestHost(),
    search: searchFromRecord(params),
    domainSeparationEnabled: DOMAIN_SEPARATION_ENABLED,
    wwwMarketingRootEnabled: WWW_MARKETING_ROOT_ENABLED
  });
}

export async function generateMetadata({
  searchParams
}: {
  searchParams: Promise<HomeSearch>;
}): Promise<Metadata> {
  if (!marketingRootActive()) return {};
  const params = await searchParams;
  if ((await currentRootEntry(params)) !== "marketing") return {};
  return {
    ...(await marketingDocumentMetadata()),
    title: MARKETING_HOME_TITLE,
    description: MARKETING_HOME_DESCRIPTION,
    alternates: { canonical: MARKETING_HOME_CANONICAL }
  };
}

export default async function HomePage({
  searchParams
}: {
  searchParams: Promise<HomeSearch>;
}) {
  if (!marketingRootActive()) return <ApplicationHomePage />;
  const params = await searchParams;
  if ((await currentRootEntry(params)) === "marketing") {
    return (
      <MarketingHomeAuthHandoff>
        <MarketingHomePage openAppHref={generalWebAppHref(utmSearchFromRecord(params))} />
      </MarketingHomeAuthHandoff>
    );
  }
  return <ApplicationHomePage />;
}
