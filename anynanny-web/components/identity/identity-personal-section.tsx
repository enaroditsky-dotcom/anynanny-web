"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { IdentityVerificationForm } from "@/components/identity/identity-verification-form";
import { VerifiedUserBadge } from "@/components/identity/verified-user-badge";
import { PersonalAreaSection } from "@/components/personal-area/personal-area-ui";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  EMPTY_IDENTITY_VERIFICATION,
  fetchIdentityVerification,
  identityStatusCta,
  identityStatusLabel,
  isIdentityVerified,
  maskIsraeliId,
  type IdentityVerificationRecord
} from "@/lib/identity/identity-verification";

type IdentityPersonalSectionProps = {
  role: "parent" | "sitter";
  userId: string | null;
};

export function IdentityPersonalSection({ role, userId }: IdentityPersonalSectionProps) {
  const [loading, setLoading] = useState(true);
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
    setLoading(true);
    const result = await fetchIdentityVerification(supabase, userId, { role });
    setRecord(result.record);
    setMissingSchema(result.missingSchema);
    setLoading(false);
  }, [role, userId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const onPageShow = () => {
      void load();
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, [load]);

  const cta = identityStatusCta(record.status);
  const verified = isIdentityVerified(record.status);

  return (
    <>
      <PersonalAreaSection
        title="אימות זהות"
        accent="emerald"
        description="האימות מתבצע מול Didit באמצעות מסמך זיהוי ובדיקת חיות. ניתן לעדכן או לנסות שוב בכל עת."
        summary={
          loading
            ? "טוען…"
            : missingSchema
              ? "לא הוגדר"
              : identityStatusLabel(record.status)
        }
        action={
          cta && !missingSchema ? (
            <button
              type="button"
              onClick={() => setFormOpen(true)}
              className="text-[14px] font-semibold text-[#0B6BCB] underline decoration-[#0B6BCB]/35 underline-offset-2 transition hover:text-[#08529a]"
            >
              {cta}
            </button>
          ) : undefined
        }
      >
        {loading ? (
          <div className="flex items-center justify-end gap-2 py-1 text-xs text-slate-500">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            טוען סטטוס אימות…
          </div>
        ) : missingSchema ? (
          <p className="text-xs text-slate-500">סטטוס האימות עדיין לא זמין במסד הנתונים.</p>
        ) : (
          <div className="space-y-2 text-right">
            <div className="flex flex-wrap items-center justify-end gap-2">
              {verified ? <VerifiedUserBadge /> : null}
              <p
                className={`text-[16px] font-semibold ${
                  record.status === "failed"
                    ? "text-rose-700"
                    : record.status === "pending"
                      ? "text-amber-800"
                      : record.status === "verified"
                        ? "text-emerald-800"
                        : "text-slate-600"
                }`}
              >
                {identityStatusLabel(record.status)}
              </p>
            </div>
            {record.idNumber ? (
              <p className="text-xs text-slate-500" dir="ltr">
                ת.ז. {maskIsraeliId(record.idNumber)}
              </p>
            ) : (
              <p className="text-xs italic text-slate-400">לא נשמר מספר תעודת זהות עדיין</p>
            )}
          </div>
        )}
      </PersonalAreaSection>

      <IdentityVerificationForm
        open={formOpen}
        role={role}
        initialIdNumber={record.idNumber}
        nextPath={role === "sitter" ? "/sitter/profile" : "/parent/profile"}
        onClose={() => setFormOpen(false)}
        onSaved={(next) => {
          setRecord(next);
        }}
        onFlowFinished={() => {
          void load();
        }}
      />
    </>
  );
}
