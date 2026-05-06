"use client";

import { useState } from "react";

export default function GettMockPage() {
  const [status, setStatus] = useState("Idle");

  const handleMockOrder = async () => {
    setStatus("Sending request...");
    await new Promise((resolve) => setTimeout(resolve, 1200));
    setStatus("Ride request simulated successfully.");
  };

  return (
    <main className="mx-auto max-w-xl p-6 md:py-16">
      <h1 className="mb-2 text-2xl font-semibold text-navy-900">Safe Ride (Gett Mock)</h1>
      <p className="mb-6 text-sm text-navy-700">Temporary simulation until real Gett API integration.</p>
      <button
        className="rounded-xl bg-navy-800 px-5 py-3 text-sm font-semibold text-white"
        onClick={handleMockOrder}
        type="button"
      >
        Order Safe Ride
      </button>
      <p className="mt-4 text-sm text-navy-700">{status}</p>
    </main>
  );
}
