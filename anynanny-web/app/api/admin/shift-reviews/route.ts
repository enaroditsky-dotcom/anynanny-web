import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin/require-admin";
import { listStuckShiftReviews } from "@/lib/admin/stuck-shift-reviews";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET() {
  const unauthorized = await requireAdminApi();
  if (unauthorized) return unauthorized;

  try {
    const cases = await listStuckShiftReviews(getSupabaseServiceRoleClient());
    return NextResponse.json({ cases });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load shift reviews.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
