"use client";

import { FormEvent, useState } from "react";

export default function VerificationPage() {
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setSubmitted(false);
    setErrorMessage("");

    const formElement = event.currentTarget;
    const formData = new FormData(formElement);

    const response = await fetch("/api/verifications", {
      method: "POST",
      body: formData
    });

    if (!response.ok) {
      setErrorMessage("Could not submit verification. Please check your details and try again.");
      setSubmitting(false);
      return;
    }

    setSubmitted(true);
    setSubmitting(false);
    formElement.reset();
  };

  return (
    <main className="mx-auto max-w-xl p-6 md:py-16">
      <h1 className="mb-2 text-2xl font-semibold text-navy-900">Sitter Verification</h1>
      <p className="mb-6 text-sm text-navy-700">
        Please upload your ID and signed parental consent form to complete verification.
      </p>

      <form className="space-y-4 rounded-xl border border-navy-200 bg-white p-6 shadow-sm" onSubmit={handleSubmit}>
        <div>
          <label className="mb-2 block text-sm font-medium text-navy-900" htmlFor="sitterName">
            Sitter full name
          </label>
          <input
            className="block w-full rounded-lg border border-navy-200 p-2 text-sm"
            id="sitterName"
            name="sitterName"
            type="text"
            required
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-navy-900" htmlFor="idPhoto">
            Upload photo of your ID
          </label>
          <input
            className="block w-full rounded-lg border border-navy-200 p-2 text-sm"
            id="idPhoto"
            name="idPhoto"
            type="file"
            accept="image/*,.pdf"
            required
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-navy-900" htmlFor="consentForm">
            Upload signed parental consent form
          </label>
          <input
            className="block w-full rounded-lg border border-navy-200 p-2 text-sm"
            id="consentForm"
            name="consentForm"
            type="file"
            accept="image/*,.pdf"
            required
          />
        </div>

        <button
          className="w-full rounded-xl bg-navy-800 px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
          type="submit"
          disabled={submitting}
        >
          {submitting ? "Submitting..." : "Submit"}
        </button>

        {submitted ? (
          <p className="rounded-lg bg-green-50 p-3 text-sm font-medium text-green-700">
            Submitted successfully. Your verification documents are under review.
          </p>
        ) : null}

        {errorMessage ? <p className="rounded-lg bg-red-50 p-3 text-sm font-medium text-red-700">{errorMessage}</p> : null}
      </form>
    </main>
  );
}
