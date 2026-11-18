import { MarketingHome } from "@/components/marketing/marketing-home";

export function MarketingHomePage({
  openAppHref,
  campaignSearch = ""
}: {
  openAppHref: string;
  campaignSearch?: string;
}) {
  return <MarketingHome openAppHref={openAppHref} campaignSearch={campaignSearch} />;
}
