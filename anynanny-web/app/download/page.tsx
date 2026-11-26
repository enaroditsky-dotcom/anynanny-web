import type { Metadata } from "next";
import { ParentDownloadLanding } from "@/components/marketing/parent-download-landing";
import {
  DOWNLOAD_LANDING_CANONICAL,
  DOWNLOAD_LANDING_DESCRIPTION,
  DOWNLOAD_LANDING_OG_URL,
  DOWNLOAD_LANDING_POSTER_ALT,
  DOWNLOAD_LANDING_POSTER_HEIGHT,
  DOWNLOAD_LANDING_POSTER_WIDTH,
  DOWNLOAD_LANDING_TITLE,
  buildDownloadLandingStructuredData,
  downloadAppStoreHref,
  downloadGooglePlayHref,
  utmSearchFromRecord
} from "@/lib/marketing/parent-download";

export const metadata: Metadata = {
  title: DOWNLOAD_LANDING_TITLE,
  description: DOWNLOAD_LANDING_DESCRIPTION,
  alternates: {
    canonical: DOWNLOAD_LANDING_CANONICAL
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
    title: DOWNLOAD_LANDING_TITLE,
    description: DOWNLOAD_LANDING_DESCRIPTION,
    url: DOWNLOAD_LANDING_CANONICAL,
    siteName: "AnyNanny",
    locale: "he_IL",
    type: "website",
    images: [
      {
        url: DOWNLOAD_LANDING_OG_URL,
        width: DOWNLOAD_LANDING_POSTER_WIDTH,
        height: DOWNLOAD_LANDING_POSTER_HEIGHT,
        alt: DOWNLOAD_LANDING_POSTER_ALT
      }
    ]
  },
  twitter: {
    card: "summary_large_image",
    title: DOWNLOAD_LANDING_TITLE,
    description: DOWNLOAD_LANDING_DESCRIPTION,
    images: [DOWNLOAD_LANDING_OG_URL]
  }
};

type DownloadLandingPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function DownloadLandingPage({ searchParams }: DownloadLandingPageProps) {
  const params = await searchParams;
  const utm = utmSearchFromRecord(params);
  const structuredData = buildDownloadLandingStructuredData();

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(structuredData).replace(/</g, "\\u003c")
        }}
      />
      <ParentDownloadLanding
        appStoreHref={downloadAppStoreHref(utm)}
        playHref={downloadGooglePlayHref(utm)}
      />
    </>
  );
}
