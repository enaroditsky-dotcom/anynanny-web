import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { WelcomeTopicPage } from "@/components/marketing/welcome-topic-page";
import {
  WELCOME_TOPICS,
  welcomeTopicBySlug,
  welcomeTopicCanonical
} from "@/lib/marketing/welcome-topics";

type TopicPageProps = {
  params: Promise<{ topic: string }>;
};

export function generateStaticParams() {
  return WELCOME_TOPICS.map((topic) => ({ topic: topic.slug }));
}

export async function generateMetadata({ params }: TopicPageProps): Promise<Metadata> {
  const { topic: slug } = await params;
  const topic = welcomeTopicBySlug(slug);
  if (!topic) return {};
  const canonical = welcomeTopicCanonical(topic.slug);
  return {
    title: `${topic.title} | AnyNanny`,
    description: topic.description,
    alternates: { canonical },
    robots: { index: true, follow: true },
    openGraph: {
      title: `${topic.title} | AnyNanny`,
      description: topic.description,
      url: canonical,
      siteName: "AnyNanny",
      locale: "he_IL",
      type: "website"
    }
  };
}

export default async function MarketingTopicPage({ params }: TopicPageProps) {
  const { topic: slug } = await params;
  const topic = welcomeTopicBySlug(slug);
  if (!topic) notFound();
  return <WelcomeTopicPage topic={topic} />;
}
