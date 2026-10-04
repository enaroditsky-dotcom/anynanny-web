import type { Metadata } from "next";
import { StudentJobsLanding } from "@/components/marketing/student-jobs-landing";
import { marketingDemoHref } from "@/lib/marketing/demo-entry";
import {
  STUDENT_JOBS_CANONICAL,
  STUDENT_JOBS_DESCRIPTION,
  STUDENT_JOBS_TITLE,
  studentSitterSignupHref,
  utmSearchFromRecord
} from "@/lib/marketing/student-jobs";

export const metadata: Metadata = {
  title: STUDENT_JOBS_TITLE,
  description: STUDENT_JOBS_DESCRIPTION,
  alternates: {
    canonical: STUDENT_JOBS_CANONICAL
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
    title: STUDENT_JOBS_TITLE,
    description: STUDENT_JOBS_DESCRIPTION,
    url: STUDENT_JOBS_CANONICAL,
    siteName: "AnyNanny",
    locale: "he_IL",
    type: "website",
    images: [
      {
        url: "/brand/anynanny-official-wordmark.png",
        alt: "AnyNanny"
      }
    ]
  },
  twitter: {
    card: "summary",
    title: STUDENT_JOBS_TITLE,
    description: STUDENT_JOBS_DESCRIPTION
  }
};

const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebPage",
      "@id": `${STUDENT_JOBS_CANONICAL}#webpage`,
      url: STUDENT_JOBS_CANONICAL,
      name: STUDENT_JOBS_TITLE,
      description: STUDENT_JOBS_DESCRIPTION,
      inLanguage: "he",
      isPartOf: {
        "@type": "WebSite",
        name: "AnyNanny",
        url: "https://www.anynanny.org/"
      }
    },
    {
      "@type": "BreadcrumbList",
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: "AnyNanny",
          item: "https://www.anynanny.org/"
        },
        {
          "@type": "ListItem",
          position: 2,
          name: "עבודה לסטודנטיות",
          item: STUDENT_JOBS_CANONICAL
        }
      ]
    }
  ]
};

type StudentJobsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function StudentJobsPage({ searchParams }: StudentJobsPageProps) {
  const params = await searchParams;
  const utm = utmSearchFromRecord(params);
  const signupHref = studentSitterSignupHref(utm);
  const demoHref = marketingDemoHref("sitter", utm);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(structuredData).replace(/</g, "\\u003c")
        }}
      />
      <StudentJobsLanding signupHref={signupHref} demoHref={demoHref} />
    </>
  );
}
