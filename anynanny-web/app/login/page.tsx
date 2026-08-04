import { redirect } from "next/navigation";

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
  redirect(`/auth/login${toQueryString(params)}`);
}
