import { AdminBroadcastComposer } from "@/components/admin/admin-broadcast-composer";
import { AdminBroadcastQuestionResults } from "@/components/admin/admin-broadcast-question-results";
import { requireAdminPage } from "@/lib/admin/require-admin";

export const dynamic = "force-dynamic";

export default async function AdminBroadcastPage() {
  await requireAdminPage();

  return (
    <main id="admin-broadcast" tabIndex={-1} className="mx-auto max-w-5xl scroll-mt-28 p-6 outline-none md:py-16" dir="rtl">
      <h1 className="mb-2 text-2xl font-semibold text-navy-900">שליחת הודעת Broadcast</h1>
      <p className="mb-6 text-sm text-navy-700">
        הודעה רגילה או שאלה אמריקאית. שתיהן מופיעות אצל המשתמשים בתוך AnyNanny. אין שליחת Push, SMS או אימייל.
      </p>
      <AdminBroadcastComposer />
      <AdminBroadcastQuestionResults />
    </main>
  );
}
