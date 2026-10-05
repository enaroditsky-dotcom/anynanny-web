import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GeneralAcquisitionLanding } from "@/components/marketing/general-acquisition-landing";
import {
  babysitterCityMetadata,
  babysitterCityStaticParams,
  buildBabysitterCityStructuredData,
  getBabysitterCity
} from "@/lib/marketing/babysitter-cities";
import {
  generalParentDemoHref,
  generalSitterDemoHref,
  generalWebAppHref,
  utmSearchFromRecord
} from "@/lib/marketing/general-acquisition";

export const dynamicParams = false;

export function generateStaticParams() {
  return babysitterCityStaticParams();
}

type BabysitterCityPageProps = {
  params: Promise<{ city: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: BabysitterCityPageProps): Promise<Metadata> {
  const { city: slug } = await params;
  const city = getBabysitterCity(slug);
  if (!city) notFound();
  return babysitterCityMetadata(city);
}

export default async function BabysitterCityPage({ params, searchParams }: BabysitterCityPageProps) {
  const { city: slug } = await params;
  const city = getBabysitterCity(slug);
  if (!city) notFound();

  const utm = utmSearchFromRecord(await searchParams);
  const structuredData = buildBabysitterCityStructuredData(city);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(structuredData).replace(/</g, "\\u003c")
        }}
      />
      <GeneralAcquisitionLanding
        city={city}
        webAppHref={generalWebAppHref(utm)}
        parentDemoHref={generalParentDemoHref(utm)}
        sitterDemoHref={generalSitterDemoHref(utm)}
      />
    </>
  );
}
