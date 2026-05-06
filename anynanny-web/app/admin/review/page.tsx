import { getPendingVerifications } from "@/lib/verifications/service";

export default async function AdminReviewPage() {
  const pending = await getPendingVerifications();

  return (
    <main className="mx-auto max-w-4xl p-6 md:py-16">
      <h1 className="mb-2 text-2xl font-semibold text-navy-900">Pending Verification Requests</h1>
      <p className="mb-6 text-sm text-navy-700">Review incoming sitter identity and consent documents.</p>

      {pending.length === 0 ? (
        <div className="rounded-xl border border-navy-200 bg-white p-6 text-sm text-navy-700 shadow-sm">
          No pending verification requests yet.
        </div>
      ) : (
        <div className="space-y-3">
          {pending.map((item, index) => (
            <article className="rounded-xl border border-navy-200 bg-white p-5 shadow-sm" key={`${item.sitterName}-${item.submittedAt}-${index}`}>
              <h2 className="text-lg font-semibold text-navy-900">{item.sitterName}</h2>
              <p className="mt-2 text-sm text-navy-700">
                <span className="font-medium text-navy-900">ID file:</span> {item.idPhotoFileName}
              </p>
              <p className="text-sm text-navy-700">
                <span className="font-medium text-navy-900">Consent form:</span> {item.consentFormFileName}
              </p>
              <p className="mt-2 text-xs text-navy-700">Submitted: {new Date(item.submittedAt).toLocaleString()}</p>
            </article>
          ))}
        </div>
      )}
    </main>
  );
}
