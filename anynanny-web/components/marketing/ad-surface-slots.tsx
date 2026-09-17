import { AdSlot } from "@/components/marketing/ad-slot";

/**
 * Named mounts for surfaces that may host advertising later.
 * All placements stay disabled until the central registry is activated.
 *
 * Do not import these into login, registration, onboarding, booking,
 * payments, identity verification, or safety/reporting flows.
 */

export function KnowledgeArticleInlineAdSlot() {
  return <AdSlot placement="knowledge_article_inline" />;
}

export function KnowledgeArticleBottomAdSlot() {
  return <AdSlot placement="knowledge_article_bottom" />;
}

export function CommunitySponsorAdSlot() {
  return <AdSlot placement="community_sponsor" />;
}

export function MarketplaceSponsoredAdSlot() {
  return <AdSlot placement="marketplace_sponsored" />;
}

/**
 * In-flow break between marketing story sections. Must never be implemented
 * as a popup, autoplay unit, or full-screen interstitial.
 */
export function MarketingStoryInterstitialAdSlot() {
  return <AdSlot placement="marketing_story_interstitial" />;
}

export function FaqSponsorAdSlot() {
  return <AdSlot placement="faq_sponsor" />;
}
