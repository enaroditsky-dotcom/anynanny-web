import type { Metadata } from "next";
import { headers } from "next/headers";
import { ApplicationHomePage } from "@/components/home/application-home-page";
import { ConversionHome } from "@/components/marketing/conversion-home";
import { MarketingHomeAuthHandoff } from "@/components/marketing/marketing-home-auth-handoff";
import { StoryChapterHandoff } from "@/components/marketing/story-chapter-handoff";
import {
  DOMAIN_SEPARATION_ENABLED,
  WWW_MARKETING_ROOT_ENABLED,
  resolvePublicSiteHost
} from "@/lib/hosts/site-classifier";
import { resolveRootEntry } from "@/lib/hosts/root-entry";
import {
  MARKETING_HOME_CANONICAL,
  MARKETING_HOME_DESCRIPTION,
  MARKETING_HOME_OG_ALT,
  MARKETING_HOME_OG_HEIGHT,
  MARKETING_HOME_OG_TITLE,
  MARKETING_HOME_OG_URL,
  MARKETING_HOME_OG_WIDTH,
  MARKETING_HOME_TITLE,
  buildMarketingHomeStructuredData
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
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true
      }
    },
    openGraph: {
      title: MARKETING_HOME_OG_TITLE,
      description: MARKETING_HOME_DESCRIPTION,
      url: MARKETING_HOME_CANONICAL,
      siteName: "AnyNanny",
      locale: "he_IL",
      type: "website",
      images: [
        {
          url: MARKETING_HOME_OG_URL,
          width: MARKETING_HOME_OG_WIDTH,
          height: MARKETING_HOME_OG_HEIGHT,
          alt: MARKETING_HOME_OG_ALT
        }
      ]
    },
    twitter: {
      card: "summary_large_image",
      title: MARKETING_HOME_OG_TITLE,
      description: MARKETING_HOME_DESCRIPTION,
      images: [MARKETING_HOME_OG_URL]
    }
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
    const structuredData = buildMarketingHomeStructuredData();
    return (
      <>
        {/*
          Next.js metadata turns a root canonical into the origin without a
          trailing slash. This is the single self-canonical for the marketing homepage.
        */}
        <link rel="canonical" href={MARKETING_HOME_CANONICAL} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(structuredData).replace(/</g, "\\u003c")
          }}
        />
        <MarketingHomeAuthHandoff>
          <StoryChapterHandoff />
          <ConversionHome />
        </MarketingHomeAuthHandoff>
      </>
    );
  }
  return <ApplicationHomePage />;
}
