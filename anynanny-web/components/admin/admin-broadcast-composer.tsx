"use client";

import { Suspense } from "react";
import { AdminBroadcastForm } from "@/components/admin/admin-broadcast-form";
import { AdminBroadcastQuestionForm } from "@/components/admin/admin-broadcast-question-form";
import { useAdminQuery } from "@/components/admin/use-admin-query";

type BroadcastComposerMode = "message" | "question";

const MODES: Array<{ value: BroadcastComposerMode; label: string }> = [
  { value: "message", label: "Broadcast רגיל" },
  { value: "question", label: "Broadcast — שאלה אמריקאית" }
];

function AdminBroadcastComposerBody() {
  const { params, replaceQuery } = useAdminQuery();
  const mode: BroadcastComposerMode = params.get("composer") === "question" ? "question" : "message";

  return (
    <div className="space-y-5" dir="rtl" id="admin-broadcast-composer">
      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-medium text-navy-900">סוג Broadcast</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {MODES.map((item) => {
            const selected = mode === item.value;
            return (
              <label
                key={item.value}
                className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold ${
                  selected ? "border-navy-800 bg-navy-800 text-white" : "border-navy-200 bg-white text-navy-900"
                }`}
              >
                <input
                  className="accent-white"
                  type="radio"
                  name="broadcastType"
                  value={item.value}
                  checked={selected}
                  onChange={() => replaceQuery({ composer: item.value })}
                />
                {item.label}
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className={mode === "message" ? undefined : "hidden"}>
        <AdminBroadcastForm />
      </div>
      <div className={mode === "question" ? undefined : "hidden"}>
        <AdminBroadcastQuestionForm />
      </div>
    </div>
  );
}

export function AdminBroadcastComposer() {
  return (
    <Suspense fallback={null}>
      <AdminBroadcastComposerBody />
    </Suspense>
  );
}
