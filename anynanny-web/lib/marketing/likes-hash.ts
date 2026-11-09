import { createHash } from "node:crypto";
import { normalizeMarketingLikeToken } from "@/lib/marketing/likes";

export function hashMarketingLikeToken(token: string, pepper = ""): string {
  const normalized = normalizeMarketingLikeToken(token);
  const material = pepper ? `${pepper}:${normalized}` : normalized;
  return createHash("sha256").update(material).digest("hex");
}

export function likePepperFromEnv(env: NodeJS.ProcessEnv = process.env): string {
  return (env.MARKETING_LIKES_PEPPER || "").trim();
}
