import type { Metadata } from "next";
import { MarketingHomePage } from "@/components/marketing/marketing-home-page";
import { generalWebAppHref, utmSearchFromRecord } from "@/lib/marketing/general-acquisition";
import {
  MARKETING_HOME_OG_ALT,
  MARKETING_HOME_OG_HEIGHT,
  MARKETING_HOME_OG_URL,
  MARKETING_HOME_OG_WIDTH,
  MARKETING_STORY_CANONICAL,
  MARKETING_STORY_DESCRIPTION,
  MARKETING_STORY_TITLE,
  buildMarketingStoryStructuredData
} from "@/lib/marketing/marketing-home";
import { marketingDocumentMetadata } from "@/lib/marketing/marketing-document";

type StorySearch = Record<string, string | string[] | undefined>;

export async function generateMetadata(): Promise<Metadata> {
  return {
    ...(await marketingDocumentMetadata()),
    title: MARKETING_STORY_TITLE,
    description: MARKETING_STORY_DESCRIPTION,
    alternates: {
      canonical: MARKETING_STORY_CANONICAL
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true
      }
    },
    openGraph: {
      title: MARKETING_STORY_TITLE,
      description: MARKETING_STORY_DESCRIPTION,
      url: MARKETING_STORY_CANONICAL,
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
      title: MARKETING_STORY_TITLE,
      description: MARKETING_STORY_DESCRIPTION,
      images: [MARKETING_HOME_OG_URL]
    }
  };
}

export default async function StoryPage({
  searchParams
}: {
  searchParams: Promise<StorySearch>;
}) {
  const params = await searchParams;
  const campaign = utmSearchFromRecord(params);
  const structuredData = buildMarketingStoryStructuredData();

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(structuredData).replace(/</g, "\\u003c")
        }}
      />
      <MarketingHomePage
        openAppHref={generalWebAppHref(campaign)}
        campaignSearch={campaign.toString()}
      />
    </>
  );
}
