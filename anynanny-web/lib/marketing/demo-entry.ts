import { readStudentJobsUtm } from "@/lib/marketing/student-jobs";

export const MARKETING_DEMO_PATH = "/marketing/demo/index.html";

export type MarketingDemoRole = "parent" | "sitter";

/**
 * Opens the existing “בואו נציץ פנימה” experience on one side.
 * Only campaign UTM params are copied. Auth callback params are not.
 */
export function marketingDemoHref(
  role: MarketingDemoRole,
  search: string | URLSearchParams = ""
): string {
  const utm = readStudentJobsUtm(search);
  const params = new URLSearchParams();
  params.set("role", role);
  utm.forEach((value, key) => {
    params.set(key, value);
  });
  return `${MARKETING_DEMO_PATH}?${params.toString()}`;
}
