import { createServerClient } from "@supabase/ssr";
import type { User } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { BOOKINGS_TABLE } from "@/lib/bookings/constants";
import { isProfileRole, PROFILES_TABLE } from "@/lib/supabase/profiles";

export const dynamic = "force-dynamic";

type BookingAccessRow = {
  id: string;
  parent_id: string | null;
  sitter_id: string | null;
  status: string | null;
};

type ParentProfileRow = {
  id?: string;
  user_id?: string;
  address?: string | null;
  children_count?: number | null;
  children_ages?: string | null;
  is_verified?: boolean | null;
};

function userIsSitter(
  profile: { role?: string | null } | null | undefined,
  user: User
): boolean {
  let role = profile?.role;

  if (!isProfileRole(role)) {
    const metadataRole = user.user_metadata?.role;

    role =
      typeof metadataRole === "string" && isProfileRole(metadataRole)
        ? metadataRole
        : undefined;
  }

  return role === "sitter";
}

async function supabaseFromCookies() {
  const cookieStore = await cookies();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anon) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY"
    );
  }

  return createServerClient(url, anon, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },

      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          cookieStore.set(name, value, options);
        });
      }
    }
  });
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ bookingId: string }> }
) {
  try {
    const { bookingId } = await context.params;

    if (!bookingId) {
      return NextResponse.json(
        { error: "Missing booking id" },
        { status: 400 }
      );
    }

    const supabase = await supabaseFromCookies();

    /*
     * 1. מי המשתמש המחובר?
     */
    const {
      data: { user },
      error: authError
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    /*
     * 2. רק נני יכולה להשתמש ב-endpoint הזה
     */
    const { data: viewerProfile } = await supabase
      .from(PROFILES_TABLE)
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    if (!userIsSitter(viewerProfile, user)) {
      return NextResponse.json(
        { error: "Forbidden" },
        { status: 403 }
      );
    }

    /*
     * 3. שליפת ההזמנה עצמה
     */
    const { data: bookingData, error: bookingError } = await supabase
      .from(BOOKINGS_TABLE)
      .select("id, parent_id, sitter_id, status")
      .eq("id", bookingId)
      .maybeSingle();

    if (bookingError) {
      console.error(
        "[parent-preview] booking:",
        bookingError.message
      );

      return NextResponse.json(
        { error: "טעינת ההזמנה נכשלה." },
        { status: 400 }
      );
    }

    if (!bookingData) {
      return NextResponse.json(
        { error: "Booking not found" },
        { status: 404 }
      );
    }

    const booking = bookingData as BookingAccessRow;

    /*
     * 4. בדיקת הרשאה קריטית:
     * הנני יכולה לראות רק הורה של הזמנה ששייכת לה.
     */
    if (booking.sitter_id !== user.id) {
      return NextResponse.json(
        { error: "Forbidden" },
        { status: 403 }
      );
    }

    if (!booking.parent_id) {
      return NextResponse.json(
        { error: "Parent not found" },
        { status: 404 }
      );
    }

    /*
     * כרגע endpoint זה מיועד להזמנה ממתינה או מאושרת.
     */
    const status = String(booking.status ?? "").toLowerCase();

    if (status !== "pending" && status !== "approved") {
      return NextResponse.json(
        {
          error:
            "Parent preview is not available for this booking"
        },
        { status: 403 }
      );
    }

    const parentId = booking.parent_id;

    /*
     * 5. מידע כללי ובטוח מטבלת profiles.
     */
    const { data: publicParentProfile } = await supabase
      .from(PROFILES_TABLE)
      .select("first_name, last_name, avatar_url")
      .eq("id", parentId)
      .maybeSingle();

    /*
     * 6. מידע משפחתי.
     *
     * משתמשים בטיפוס מפורש כדי למנוע את שגיאת
     * ה-TypeScript שנוצרה בין הקריאה הראשית ל-fallback.
     */
    const primaryParentRead = await supabase
      .from("parent_profiles")
      .select(
        "id, address, children_count, children_ages, is_verified"
      )
      .eq("id", parentId)
      .maybeSingle();

    let parentDetails: ParentProfileRow | null =
      (primaryParentRead.data as ParentProfileRow | null) ?? null;

    let parentDetailsError = primaryParentRead.error;

    /*
     * fallback למקרה שהקישור לטבלת parent_profiles
     * מבוסס user_id במקום id.
     */
    if (parentDetailsError || !parentDetails) {
      const fallback = await supabase
        .from("parent_profiles")
        .select(
          "user_id, address, children_count, children_ages, is_verified"
        )
        .eq("user_id", parentId)
        .maybeSingle();

      if (!fallback.error) {
        parentDetails =
          (fallback.data as ParentProfileRow | null) ?? null;

        parentDetailsError = null;
      }
    }

    if (parentDetailsError) {
      console.warn(
        "[parent-preview] parent_profiles:",
        parentDetailsError.message
      );
    }

    const details: ParentProfileRow = parentDetails ?? {};

    /*
     * 7. כתובת מלאה נחשפת רק לאחר שהנני אישרה.
     */
    const bookingApproved = status === "approved";

    return NextResponse.json({
      parent: {
        first_name:
          String(
            publicParentProfile?.first_name ?? ""
          ).trim() || null,

        avatar_url:
          String(
            publicParentProfile?.avatar_url ?? ""
          ).trim() || null,

        children_count:
          details.children_count != null
            ? Number(details.children_count)
            : null,

        children_ages:
          String(details.children_ages ?? "").trim() || null,

        identity_verified:
          details.is_verified === true,

        address:
          bookingApproved
            ? String(details.address ?? "").trim() || null
            : null,

        address_visible: bookingApproved
      }
    });
  } catch (error) {
    console.error(
      "[parent-preview] exception:",
      error
    );

    return NextResponse.json(
      { error: "Server error" },
      { status: 500 }
    );
  }
}