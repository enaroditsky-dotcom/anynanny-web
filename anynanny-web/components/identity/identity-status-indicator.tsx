"use client";

import { useCallback, useEffect, useState } from "react";
import { IdentityVerificationForm } from "@/components/identity/identity-verification-form";
import { VerifiedUserBadge } from "@/components/identity/verified-user-badge";
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

  const className = pending
    ? "inline-flex items-center gap-1 rounded-md border border-amber-200/70 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800"
    : "inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-0.5 text-xs font-medium text-slate-700";

  return (
    <>
      <div className="inline-flex max-w-full items-center justify-end">
        {loading ? (
          <span className="inline-block h-8 w-36 animate-pulse rounded-xl bg-slate-100" aria-hidden />
        ) : verified ? (
          <VerifiedUserBadge size="lg" />
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
