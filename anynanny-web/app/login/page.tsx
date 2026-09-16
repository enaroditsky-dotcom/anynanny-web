import { redirect } from "next/navigation";
import { AppLoginLanding } from "@/components/auth/app-login-landing";
import { isAppLoginLandingRequest } from "@/lib/auth/password-reset";

export const dynamic = "force-dynamic";

type LoginPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function toQueryString(params: Record<string, string | string[] | undefined>): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") qs.set(key, value);
    else if (Array.isArray(value)) value.forEach((v) => qs.append(key, v));
  }
  const s = qs.toString();
  return s ? `?${s}` : "";
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  if (isAppLoginLandingRequest(params)) {
    return <AppLoginLanding />;
  }
  redirect(`/auth/login${toQueryString(params)}`);
}
