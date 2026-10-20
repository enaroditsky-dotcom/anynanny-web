import { adminAuthCookieOptions, getAdminPassword, getAdminSessionSecret, isValidAdminPassword } from "@/lib/admin/auth";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  if (!getAdminPassword() || !getAdminSessionSecret()) {
    return NextResponse.json({ error: "Admin login is unavailable." }, { status: 503 });
  }

  let password = "";
  try {
    const body = (await request.json()) as { password?: unknown };
    password = typeof body?.password === "string" ? body.password : "";
  } catch {
    return NextResponse.json({ error: "Invalid admin password." }, { status: 401 });
  }

  if (!isValidAdminPassword(password)) {
    return NextResponse.json({ error: "Invalid admin password." }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(adminAuthCookieOptions(60 * 60 * 8));

  return response;
}
