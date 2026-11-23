import type { Metadata } from "next";
import { GeneralAcquisitionLanding } from "@/components/marketing/general-acquisition-landing";
import {
  GENERAL_ACQUISITION_CANONICAL,
  GENERAL_ACQUISITION_DESCRIPTION,
  GENERAL_ACQUISITION_TITLE,
  buildGeneralAcquisitionStructuredData,
  generalIosStoreHref,
  generalPlayStoreHref,
  generalParentDemoHref,
  generalParentSearchHref,
  generalSitterDemoHref,
  generalSitterSignupHref,
  generalWebAppHref,
  utmSearchFromRecord
} from "@/lib/marketing/general-acquisition";
import {
  MARKETING_HOME_OG_ALT,
  MARKETING_HOME_OG_HEIGHT,
  MARKETING_HOME_OG_URL,
  MARKETING_HOME_OG_WIDTH
} from "@/lib/marketing/marketing-home";

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
        url: MARKETING_HOME_OG_URL,
        width: MARKETING_HOME_OG_WIDTH,
        height: MARKETING_HOME_OG_HEIGHT,
        alt: MARKETING_HOME_OG_ALT,
        type: "image/png"
      }
    ]
  },
  twitter: {
    card: "summary_large_image",
    title: GENERAL_ACQUISITION_TITLE,
    description: GENERAL_ACQUISITION_DESCRIPTION,
    images: [MARKETING_HOME_OG_URL]
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
  const parentSearchHref = generalParentSearchHref(utm);
  const sitterSignupHref = generalSitterSignupHref(utm);
  const iosHref = generalIosStoreHref(utm);
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
        parentSearchHref={parentSearchHref}
        sitterSignupHref={sitterSignupHref}
        iosHref={iosHref}
        playHref={generalPlayStoreHref(utm)}
      />
    </>
  );
}
