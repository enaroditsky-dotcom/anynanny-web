import type { Metadata } from "next";
import { ParentsLanding } from "@/components/marketing/parents-landing";
import {
  PARENTS_LANDING_CANONICAL,
  PARENTS_LANDING_DESCRIPTION,
  PARENTS_LANDING_HERO_ALT,
  PARENTS_LANDING_OG_DESCRIPTION,
  PARENTS_LANDING_OG_HEIGHT,
  PARENTS_LANDING_OG_TITLE,
  PARENTS_LANDING_OG_URL,
  PARENTS_LANDING_OG_WIDTH,
  PARENTS_LANDING_TITLE,
  buildParentsLandingStructuredData,
  parentsLandingSignupHref,
  parentsWebAppFallbackHref,
  utmSearchFromRecord
} from "@/lib/marketing/parents-landing";

export const metadata: Metadata = {
  title: PARENTS_LANDING_TITLE,
  description: PARENTS_LANDING_DESCRIPTION,
  alternates: {
    canonical: PARENTS_LANDING_CANONICAL
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
    title: PARENTS_LANDING_OG_TITLE,
    description: PARENTS_LANDING_OG_DESCRIPTION,
    url: PARENTS_LANDING_CANONICAL,
    siteName: "AnyNanny",
    locale: "he_IL",
    type: "website",
    images: [
      {
        url: PARENTS_LANDING_OG_URL,
        width: PARENTS_LANDING_OG_WIDTH,
        height: PARENTS_LANDING_OG_HEIGHT,
        alt: PARENTS_LANDING_HERO_ALT
      }
    ]
  },
  twitter: {
    card: "summary_large_image",
    title: PARENTS_LANDING_OG_TITLE,
    description: PARENTS_LANDING_OG_DESCRIPTION,
    images: [PARENTS_LANDING_OG_URL]
  }
};

type ParentsLandingPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ParentsLandingPage({ searchParams }: ParentsLandingPageProps) {
  const params = await searchParams;
  const utm = utmSearchFromRecord(params);
  const parentHref = parentsLandingSignupHref(utm);
  const webAppHref = parentsWebAppFallbackHref(utm);
  const structuredData = buildParentsLandingStructuredData();

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(structuredData).replace(/</g, "\\u003c")
        }}
      />
      <ParentsLanding parentHref={parentHref} webAppHref={webAppHref} />
    </>
  );
}
