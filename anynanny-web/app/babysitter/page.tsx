import type { Metadata } from "next";
import { GeneralAcquisitionLanding } from "@/components/marketing/general-acquisition-landing";
import {
  GENERAL_ACQUISITION_CANONICAL,
  GENERAL_ACQUISITION_DESCRIPTION,
  GENERAL_ACQUISITION_HERO_ALT,
  GENERAL_ACQUISITION_HERO_HEIGHT,
  GENERAL_ACQUISITION_HERO_URL,
  GENERAL_ACQUISITION_HERO_WIDTH,
  GENERAL_ACQUISITION_TITLE,
  buildGeneralAcquisitionStructuredData,
  generalParentDemoHref,
  generalSitterDemoHref,
  generalWebAppHref,
  utmSearchFromRecord
} from "@/lib/marketing/general-acquisition";

export const metadata: Metadata = {
  title: GENERAL_ACQUISITION_TITLE,
  description: GENERAL_ACQUISITION_DESCRIPTION,
  alternates: {
    canonical: GENERAL_ACQUISITION_CANONICAL
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
    title: GENERAL_ACQUISITION_TITLE,
    description: GENERAL_ACQUISITION_DESCRIPTION,
    url: GENERAL_ACQUISITION_CANONICAL,
    siteName: "AnyNanny",
    locale: "he_IL",
    type: "website",
    images: [
      {
        url: GENERAL_ACQUISITION_HERO_URL,
        width: GENERAL_ACQUISITION_HERO_WIDTH,
        height: GENERAL_ACQUISITION_HERO_HEIGHT,
        alt: GENERAL_ACQUISITION_HERO_ALT
      }
    ]
  },
  twitter: {
    card: "summary_large_image",
    title: GENERAL_ACQUISITION_TITLE,
    description: GENERAL_ACQUISITION_DESCRIPTION,
    images: [GENERAL_ACQUISITION_HERO_URL]
  }
};

type BabysitterLandingPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function BabysitterLandingPage({ searchParams }: BabysitterLandingPageProps) {
  const params = await searchParams;
  const utm = utmSearchFromRecord(params);
  const webAppHref = generalWebAppHref(utm);
  const parentDemoHref = generalParentDemoHref(utm);
  const sitterDemoHref = generalSitterDemoHref(utm);
  const structuredData = buildGeneralAcquisitionStructuredData();

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(structuredData).replace(/</g, "\\u003c")
        }}
      />
      <GeneralAcquisitionLanding
        webAppHref={webAppHref}
        parentDemoHref={parentDemoHref}
        sitterDemoHref={sitterDemoHref}
      />
    </>
  );
}
