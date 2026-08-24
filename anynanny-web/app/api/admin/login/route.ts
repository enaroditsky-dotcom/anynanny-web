import { adminAuthCookieOptions, isValidAdminPassword } from "@/lib/admin/auth";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const body = (await request.json()) as { password?: string };
  const password = String(body.password ?? "");

  if (!isValidAdminPassword(password)) {
    return NextResponse.json({ error: "Invalid admin password." }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(adminAuthCookieOptions(60 * 60 * 8));

  return response;
}
