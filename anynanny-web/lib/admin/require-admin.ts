import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { ADMIN_AUTH_COOKIE, isValidAdminSessionValue } from "@/lib/admin/auth";

export async function hasValidAdminSession(): Promise<boolean> {
  const store = await cookies();
  return isValidAdminSessionValue(store.get(ADMIN_AUTH_COOKIE)?.value);
}

export async function requireAdminPage(): Promise<void> {
  if (!(await hasValidAdminSession())) {
    redirect("/admin/login");
  }
}

export async function requireAdminApi(): Promise<NextResponse | null> {
  if (await hasValidAdminSession()) return null;
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
