import type { Metadata } from "next";
import { AppLanding } from "@/components/marketing/app-landing";
import {
  APP_LANDING_CANONICAL,
  APP_LANDING_DESCRIPTION,
  APP_LANDING_HERO_ALT,
  APP_LANDING_OG_DESCRIPTION,
  APP_LANDING_OG_HEIGHT,
  APP_LANDING_OG_TITLE,
  APP_LANDING_OG_URL,
  APP_LANDING_OG_WIDTH,
  APP_LANDING_TITLE,
  appLandingSignupHref,
  APP_LANDING_SITE_URL,
  buildAppLandingStructuredData,
  utmSearchFromRecord
} from "@/lib/marketing/app-landing";
import { DOMAIN_SEPARATION_ENABLED } from "@/lib/hosts/site-classifier";
import { generalWebAppHref } from "@/lib/marketing/general-acquisition";

export const metadata: Metadata = {
  title: APP_LANDING_TITLE,
  description: APP_LANDING_DESCRIPTION,
  alternates: {
    canonical: APP_LANDING_CANONICAL
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
    title: APP_LANDING_OG_TITLE,
    description: APP_LANDING_OG_DESCRIPTION,
    url: APP_LANDING_CANONICAL,
    siteName: "AnyNanny",
    locale: "he_IL",
    type: "website",
    images: [
      {
        url: APP_LANDING_OG_URL,
        width: APP_LANDING_OG_WIDTH,
        height: APP_LANDING_OG_HEIGHT,
        alt: APP_LANDING_HERO_ALT
      }
    ]
  },
  twitter: {
    card: "summary_large_image",
    title: APP_LANDING_OG_TITLE,
    description: APP_LANDING_OG_DESCRIPTION,
    images: [APP_LANDING_OG_URL]
  }
};

type AppLandingPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AppLandingPage({ searchParams }: AppLandingPageProps) {
  const params = await searchParams;
  const utm = utmSearchFromRecord(params);
  const parentHref = appLandingSignupHref("parent", utm);
  const sitterHref = appLandingSignupHref("sitter", utm);
  const webAppHref = DOMAIN_SEPARATION_ENABLED ? generalWebAppHref(utm) : APP_LANDING_SITE_URL;
  const structuredData = buildAppLandingStructuredData();

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(structuredData).replace(/</g, "\\u003c")
        }}
      />
      <AppLanding parentHref={parentHref} sitterHref={sitterHref} webAppHref={webAppHref} />
    </>
  );
}
