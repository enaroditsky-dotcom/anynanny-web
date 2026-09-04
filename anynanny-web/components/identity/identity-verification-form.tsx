"use client";

import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import {
  PersonalEditModal,
  PersonalField,
  personalInputClassName
} from "@/components/personal-area/personal-area-ui";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  saveIdentityVerificationDraft,
  validateIdentityIdNumber,
  type IdentityVerificationRecord
} from "@/lib/identity/identity-verification";

type IdentityVerificationFormProps = {
  open: boolean;
  role: "parent" | "sitter";
  initialIdNumber?: string;
  nextPath?: string;
  onClose: () => void;
  onSaved: (record: IdentityVerificationRecord) => void | Promise<void>;
};

export function IdentityVerificationForm({
  open,
  role,
  initialIdNumber = "",
  nextPath,
  onClose,
  onSaved
}: IdentityVerificationFormProps) {
  const [idNumber, setIdNumber] = useState(initialIdNumber);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setIdNumber(initialIdNumber);
    setError(null);
  }, [open, initialIdNumber]);

  const handleSave = async () => {
    const idError = validateIdentityIdNumber(idNumber);
    if (idError) {
      setError(idError);
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setError("Supabase לא מוגדר.");
      return;
    }

    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) {
      setError("יש להתחבר מחדש.");
      return;
    }

    setSaving(true);
    setError(null);

    const result = await saveIdentityVerificationDraft(supabase, {
      userId: user.id,
      idNumber,
      role
    });

    if (!result.ok || !result.record) {
      setSaving(false);
      setError(
        result.missingSchema
          ? "עמודות האימות חסרות. הריצו את מיגרציית identity verification ב-Supabase."
          : result.error || "שמירת פרטי האימות נכשלה."
      );
      return;
    }

    await onSaved(result.record);

    try {
      const hypRes = await fetch("/api/identity-verification/hyp-register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          role,
          next: nextPath
        })
      });
      const hypJson = (await hypRes.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!hypRes.ok || !hypJson.url) {
        setSaving(false);
        setError(hypJson.error || "לא ניתן לפתוח את דף האימות של HYP.");
        return;
      }
      window.location.assign(hypJson.url);
      return;
    } catch {
      setSaving(false);
      setError("פתיחת אימות HYP נכשלה. אפשר לנסות שוב מהאזור האישי.");
    }
  };

  return (
    <PersonalEditModal
      open={open}
      title="אימות זהות ואמצעי תשלום"
      onClose={onClose}
      onSave={handleSave}
      saving={saving}
      error={error}
    >
      <div className="space-y-3 text-right">
        <p className="text-xs leading-relaxed text-slate-600">
          לאחר שמירת תעודת הזהות תועברו לדף מאובטח של HYP לרישום כרטיס אשראי אישי. האימות מסתיים רק
          אחרי בדיקת ת.ז. מול SHVA — AnyNanny לא שומרת מספר כרטיס מלא או CVV.
        </p>

        <PersonalField label="תעודת זהות">
          <input
            className={personalInputClassName}
            dir="ltr"
            inputMode="numeric"
            maxLength={9}
            placeholder="XXXXXXXXX"
            value={idNumber}
            onChange={(e) => setIdNumber(e.target.value.replace(/\D/g, "").slice(0, 9))}
            autoFocus
          />
        </PersonalField>

        <ul className="space-y-1.5 rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2.5 text-[13px] leading-relaxed text-slate-600">
          <li>הכרטיס חייב להיות על שם המשתמש שמבצע את האימות.</li>
          <li>פרטי הכרטיס יטופלו באופן מאובטח על ידי ספק התשלומים (HYP).</li>
          <li>AnyNanny אינה שומרת מספר כרטיס מלא או CVV.</li>
        </ul>

        <p className="flex items-start gap-1.5 text-[13px] text-slate-500">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-700" aria-hidden />
          סימון &quot;משתמש מאומת&quot; יופיע רק אחרי בדיקת idStatus בשרת מול HYP (inquireTransactions).
        </p>
      </div>
    </PersonalEditModal>
  );
}
