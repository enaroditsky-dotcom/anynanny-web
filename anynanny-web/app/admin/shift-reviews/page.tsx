import { requireAdminPage } from "@/lib/admin/require-admin";
import { listStuckShiftReviews } from "@/lib/admin/stuck-shift-reviews";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

function formatInstant(value: string | null): string {
  if (!value) return "—";
  const ms = new Date(value).getTime();
  if (!Number.isFinite(ms)) return value;
  return new Date(ms).toLocaleString("he-IL");
}

function formatMoney(value: number | null): string {
  if (value == null) return "—";
  return `₪${value.toFixed(2)}`;
}

export default async function AdminShiftReviewsPage() {
  await requireAdminPage();

  let cases: Awaited<ReturnType<typeof listStuckShiftReviews>> = [];
  let loadError: string | null = null;

  try {
    cases = await listStuckShiftReviews(getSupabaseServiceRoleClient());
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Failed to load shift reviews.";
  }

  return (
    <main className="mx-auto max-w-5xl p-6 md:py-16">
      <h1 className="mb-2 text-2xl font-semibold text-navy-900">Shift reviews</h1>
      <p className="mb-6 text-sm text-navy-700">
        Read-only operator queue for started shifts released from a stuck live UI. No amount,
        end time, or Hyp charge can be entered here.
      </p>

      {loadError ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {loadError}
        </p>
      ) : cases.length === 0 ? (
        <p className="rounded-xl border border-dashed border-navy-200 bg-white px-4 py-8 text-center text-sm text-navy-600">
          No bookings currently require admin review.
        </p>
      ) : (
        <div className="space-y-4">
          {cases.map((item) => (
            <article
              key={item.bookingId}
              className="rounded-2xl border border-navy-200 bg-white p-4 text-sm text-navy-900 shadow-sm"
            >
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold">ממתינה לבדיקה</p>
                <p className="text-xs text-navy-600">Released {formatInstant(item.releasedAt)}</p>
              </div>
              <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div>
                  <dt className="text-xs text-navy-500">Created</dt>
                  <dd>{formatInstant(item.createdAt)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-navy-500">Booking status</dt>
                  <dd>{item.bookingStatus ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-navy-500">Released by</dt>
                  <dd>
                    {item.releasedByRole === "parent"
                      ? "Parent"
                      : item.releasedByRole === "sitter"
                        ? "Sitter"
                        : "Unknown"}
                    {item.releasedBy ? (
                      <span className="text-xs text-navy-500"> {item.releasedBy}</span>
                    ) : null}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-navy-500">Parent</dt>
                  <dd>
                    {item.parentName} <span className="text-xs text-navy-500">{item.parentId || "—"}</span>
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-navy-500">Sitter</dt>
                  <dd>
                    {item.sitterName} <span className="text-xs text-navy-500">{item.sitterId || "—"}</span>
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-navy-500">Booking ID</dt>
                  <dd className="break-all">{item.bookingId}</dd>
                </div>
                <div>
                  <dt className="text-xs text-navy-500">Session ID</dt>
                  <dd className="break-all">{item.sessionId ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-navy-500">Scheduled start / end</dt>
                  <dd>
                    {formatInstant(item.scheduledStart)} → {formatInstant(item.scheduledEnd)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-navy-500">Actual start / end</dt>
                  <dd>
                    {formatInstant(item.actualStart)} → {formatInstant(item.actualEnd)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-navy-500">Sitter start shake</dt>
                  <dd>{formatInstant(item.sitterStartShake)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-navy-500">Parent start shake</dt>
                  <dd>{formatInstant(item.parentStartShake)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-navy-500">Sitter end shake</dt>
                  <dd>{formatInstant(item.sitterEndShake)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-navy-500">Parent end shake</dt>
                  <dd>{formatInstant(item.parentEndShake)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-navy-500">Hourly rate</dt>
                  <dd>{formatMoney(item.hourlyRateNis)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-navy-500">Payment status</dt>
                  <dd>{item.paymentStatus ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-navy-500">Release reason</dt>
                  <dd>{item.releaseReason ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-navy-500">Release detail</dt>
                  <dd>{item.releaseDetail ?? "—"}</dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      )}
    </main>
  );
}
