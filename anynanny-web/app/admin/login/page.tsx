"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function AdminLoginPage() {
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");

    const response = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password })
    });

    if (!response.ok) {
      setError("Invalid admin password.");
      setSubmitting(false);
      return;
    }

    router.push("/admin/review");
    router.refresh();
  };

  return (
    <main className="mx-auto max-w-md p-6 md:py-20">
      <h1 className="mb-2 text-2xl font-semibold text-navy-900">Admin Access</h1>
      <p className="mb-6 text-sm text-navy-700">Enter admin password to access review and chat logs.</p>

      <form className="space-y-3 rounded-xl border border-navy-200 bg-white p-5 shadow-sm" onSubmit={handleSubmit}>
        <label className="block text-sm text-navy-900" htmlFor="adminPassword">
          Password
        </label>
        <input
          id="adminPassword"
          className="w-full rounded-lg border border-navy-200 p-2 text-sm"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />

        <button
          className="w-full rounded-xl bg-navy-800 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
          type="submit"
          disabled={submitting}
        >
          {submitting ? "Signing in..." : "Sign in as Admin"}
        </button>

        {error ? <p className="text-sm font-medium text-red-700">{error}</p> : null}
      </form>
    </main>
  );
}
