"use client";

import { useCallback, useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { IdentityVerificationForm } from "@/components/identity/identity-verification-form";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  EMPTY_IDENTITY_VERIFICATION,
  fetchIdentityVerification,
  identityDashboardStatusLabel,
  isIdentityDashboardActionable,
  type IdentityVerificationRecord,
  type IdentityVerificationRole
} from "@/lib/identity/identity-verification";

type IdentityStatusIndicatorProps = {
  userId: string | null;
  role: IdentityVerificationRole;
  nextPath: string;
};

export function IdentityStatusIndicator({
  userId,
  role,
  nextPath
}: IdentityStatusIndicatorProps) {
  const [loading, setLoading] = useState(Boolean(userId));
  const [record, setRecord] = useState<IdentityVerificationRecord>(EMPTY_IDENTITY_VERIFICATION);
  const [missingSchema, setMissingSchema] = useState(false);
  const [formOpen, setFormOpen] = useState(false);

  const load = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setLoading(false);
      return;
    }
    const result = await fetchIdentityVerification(supabase, userId, { role });
    setRecord(result.record);
    setMissingSchema(result.missingSchema);
    setLoading(false);
  }, [role, userId]);

  useEffect(() => {
    setLoading(Boolean(userId));
    void load();
  }, [load, userId]);

  useEffect(() => {
    const onPageShow = () => {
      void load();
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, [load]);

  if (!userId || missingSchema) return null;

  const label = identityDashboardStatusLabel(record.status);
  const actionable = isIdentityDashboardActionable(record.status);
  const verified = record.status === "verified";
  const pending = record.status === "pending";

  const className = verified
    ? "inline-flex items-center gap-1 rounded-md border border-emerald-200/80 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800"
    : pending
      ? "inline-flex items-center gap-1 rounded-md border border-amber-200/70 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800"
      : "inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-0.5 text-xs font-medium text-slate-700";

  return (
    <>
      <div className="flex items-center justify-start">
        {loading ? (
          <span className="inline-block h-6 w-32 animate-pulse rounded-md bg-slate-100" aria-hidden />
        ) : actionable ? (
          <button
            type="button"
            onClick={() => setFormOpen(true)}
            className={`${className} transition hover:border-slate-300 hover:bg-slate-50`}
            aria-label={`${label}. לפתיחת אימות זהות`}
          >
            {label}
          </button>
        ) : (
          <span className={className} aria-label={label}>
            {verified ? <ShieldCheck className="h-3.5 w-3.5 shrink-0" aria-hidden /> : null}
            {label}
          </span>
        )}
      </div>

      <IdentityVerificationForm
        open={formOpen}
        role={role}
        initialIdNumber={record.idNumber}
        nextPath={nextPath}
        onClose={() => setFormOpen(false)}
        onSaved={async (next) => {
          setRecord(next);
        }}
      />
    </>
  );
}
