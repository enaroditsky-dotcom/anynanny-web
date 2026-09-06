import { AdminBroadcastForm } from "@/components/admin/admin-broadcast-form";
import { requireAdminPage } from "@/lib/admin/require-admin";

export const dynamic = "force-dynamic";

export default async function AdminBroadcastPage() {
  await requireAdminPage();

  return (
    <main className="mx-auto max-w-5xl p-6 md:py-16" dir="rtl">
      <h1 className="mb-2 text-2xl font-semibold text-navy-900">שליחת הודעת Broadcast</h1>
      <p className="mb-6 text-sm text-navy-700">
        הודעת מערכת פנימית שתופיע אצל המשתמשים בחוויית ההודעות הקיימת של AnyNanny. אין שליחת Push, SMS או אימייל.
      </p>
      <AdminBroadcastForm />
    </main>
  );
}
