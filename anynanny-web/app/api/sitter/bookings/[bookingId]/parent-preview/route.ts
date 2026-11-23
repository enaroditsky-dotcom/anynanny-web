import { createServerClient } from "@supabase/ssr";
import type { User } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { BOOKINGS_TABLE } from "@/lib/bookings/constants";
import { fetchSitterAssignedParentContacts } from "@/lib/bookings/sitter-parent-contact";
import {
  fetchUserPublicReviews,
  fetchUserRatingSummary,
  type PublicUserReview,
  type UserRatingSummary
} from "@/lib/ratings/fetch-user-rating-summary";
import { pickProfilePublicId } from "@/lib/public/sequential-display-id";
import {
  isProfileRole,
  PROFILES_TABLE
} from "@/lib/supabase/profiles";

export const dynamic = "force-dynamic";

type BookingAccessRow = {
  id: string;
  parent_id: string | null;
  sitter_id: string | null;
  status: string | null;
};

async function readAssignedParentPublicId(
  supabase: Awaited<ReturnType<typeof supabaseFromCookies>>,
  parentId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from(PROFILES_TABLE)
    .select("parent_serial, public_id, serial_id")
    .eq("id", parentId)
    .maybeSingle();

  if (error || !data) return null;
  return pickProfilePublicId(data, "parent");
}

function userIsSitter(
  profile: { role?: string | null } | null | undefined,
  user: User
): boolean {
  let role = profile?.role;

  if (!isProfileRole(role)) {
    const metadataRole = user.user_metadata?.role;

    role =
      typeof metadataRole === "string" &&
      isProfileRole(metadataRole)
        ? metadataRole
        : undefined;
  }

  return role === "sitter";
}

async function supabaseFromCookies() {
  const cookieStore = await cookies();

  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL;

  const anon =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

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
        cookiesToSet.forEach(
          ({
            name,
            value,
            options
          }) => {
            cookieStore.set(
              name,
              value,
              options
            );
          }
        );
      }
    }
  });
}

export async function GET(
  _request: Request,
  context: {
    params: Promise<{
      bookingId: string;
    }>;
  }
) {
  try {
    const { bookingId } =
      await context.params;

    if (!bookingId) {
      return NextResponse.json(
        {
          error:
            "Missing booking id"
        },
        {
          status: 400
        }
      );
    }

    const supabase =
      await supabaseFromCookies();

    /*
     * 1.
     * מי המשתמש המחובר?
     */
    const {
      data: {
        user
      },
      error: authError
    } =
      await supabase.auth.getUser();

    if (
      authError ||
      !user
    ) {
      return NextResponse.json(
        {
          error:
            "Unauthorized"
        },
        {
          status: 401
        }
      );
    }

    /*
     * 2.
     * רק נני יכולה להשתמש ב-endpoint הזה.
     */
    const {
      data: viewerProfile
    } = await supabase
      .from(PROFILES_TABLE)
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    if (
      !userIsSitter(
        viewerProfile,
        user
      )
    ) {
      return NextResponse.json(
        {
          error:
            "Forbidden"
        },
        {
          status: 403
        }
      );
    }

    /*
     * 3.
     * שליפת ההזמנה עצמה.
     */
    const {
      data: bookingData,
      error: bookingError
    } = await supabase
      .from(BOOKINGS_TABLE)
      .select(
        "id, parent_id, sitter_id, status"
      )
      .eq("id", bookingId)
      .maybeSingle();

    if (bookingError) {
      console.error(
        "[parent-preview] booking:",
        bookingError.message
      );

      return NextResponse.json(
        {
          error:
            "טעינת ההזמנה נכשלה."
        },
        {
          status: 400
        }
      );
    }

    if (!bookingData) {
      return NextResponse.json(
        {
          error:
            "Booking not found"
        },
        {
          status: 404
        }
      );
    }

    const booking =
      bookingData as BookingAccessRow;

    /*
     * 4.
     * בדיקת הרשאה:
     * הנני יכולה לראות רק הורה
     * של הזמנה ששייכת לה.
     */
    if (
      booking.sitter_id !==
      user.id
    ) {
      return NextResponse.json(
        {
          error:
            "Forbidden"
        },
        {
          status: 403
        }
      );
    }

    if (
      !booking.parent_id
    ) {
      return NextResponse.json(
        {
          error:
            "Parent not found"
        },
        {
          status: 404
        }
      );
    }

    /*
     * Parent preview זמין רק
     * להזמנה ממתינה או מאושרת.
     */
    const status =
      String(
        booking.status ?? ""
      ).toLowerCase();

    if (
      status !== "pending" &&
      status !== "approved"
    ) {
      return NextResponse.json(
        {
          error:
            "Parent preview is not available for this booking"
        },
        {
          status: 403
        }
      );
    }

    const parentId =
      booking.parent_id;

    /*
     * 5.
     * דירוג ההורה.
     */
    let parentRatingSummary: UserRatingSummary =
      {
        average: 0,
        count: 0
      };
    let parentReviews: PublicUserReview[] = [];

    try {
      parentRatingSummary =
        await fetchUserRatingSummary(
          supabase,
          parentId
        );
      parentReviews =
        await fetchUserPublicReviews(
          supabase,
          parentId,
          5
        );
    } catch (error) {
      console.warn(
        "[parent-preview] parent rating:",
        error
      );
    }

    /*
     * Name and street come from the assigned-sitter RPC.
     * The function omits the street until the booking is approved,
     * and never returns medical details or entry notes.
     * A missing function fails closed: no street in the response.
     */
    const { contacts } =
      await fetchSitterAssignedParentContacts(
        supabase,
        [bookingId]
      );
    const contact =
      contacts.find(
        (row) =>
          row.bookingId === bookingId
      ) ?? null;
    const publicId = await readAssignedParentPublicId(supabase, parentId);

    return NextResponse.json({
      parent: {
        id: booking.parent_id,
        first_name:
          contact?.firstName || null,

        avatar_url: contact?.avatarUrl ?? null,

        rating_average:
          Number(
            parentRatingSummary.average ??
              0
          ),

        rating_count:
          Number(
            parentRatingSummary.count ??
              0
          ),

        reviews: parentReviews.map((review) => ({
          rating: review.rating,
          comment: review.comment,
          created_at: review.created_at
        })),

        children_count: null,

        children_ages: null,

        identity_verified: contact?.identityVerified === true,

        public_id: publicId,

        address:
          status === "approved"
            ? contact?.addressLine ?? null
            : null,

        address_visible:
          status === "approved" &&
          Boolean(contact?.addressLine)
      }
    });
  } catch (error) {
    console.error(
      "[parent-preview] exception:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Server error"
      },
      {
        status: 500
      }
    );
  }
}