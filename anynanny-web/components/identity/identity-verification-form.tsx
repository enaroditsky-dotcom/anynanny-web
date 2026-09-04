"use client";

import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { startDiditVerification } from "@/app/verify/VerifyButton";
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
  onFlowFinished?: () => void | Promise<void>;
};

export function IdentityVerificationForm({
  open,
  role,
  initialIdNumber = "",
  nextPath,
  onClose,
  onSaved,
  onFlowFinished
}: IdentityVerificationFormProps) {
  const [idNumber, setIdNumber] = useState(initialIdNumber);
  const [consent, setConsent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setIdNumber(initialIdNumber);
    setConsent(false);
    setError(null);
  }, [open, initialIdNumber]);

  const handleSave = async () => {
    const idError = validateIdentityIdNumber(idNumber);
    if (idError) {
      setError(idError);
      return;
    }
    if (!consent) {
      setError("יש לאשר את תנאי האימות לפני פתיחת התהליך.");
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
      const verifyRes = await fetch("/api/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          role,
          next: nextPath
        })
      });
      const verifyJson = (await verifyRes.json().catch(() => ({}))) as {
        url?: string;
        error?: string;
      };
      if (!verifyRes.ok || !verifyJson.url) {
        setSaving(false);
        setError(verifyJson.error || "לא ניתן לפתוח את תהליך אימות הזהות.");
        return;
      }
      await startDiditVerification(verifyJson.url, async () => {
        await onFlowFinished?.();
      });
      setSaving(false);
      onClose();
    } catch {
      setSaving(false);
      setError("פתיחת אימות הזהות נכשלה. אפשר לנסות שוב מהאזור האישי.");
    }
  };

  return (
    <PersonalEditModal
      open={open}
      title="אימות זהות"
      onClose={onClose}
      onSave={handleSave}
      saving={saving}
      error={error}
      saveLabel="התחלת אימות"
      savingLabel="פותחים אימות…"
    >
      <div className="space-y-3 text-right">
        <p className="text-xs leading-relaxed text-slate-600">
          לאחר שמירת תעודת הזהות ואישור ההסכמה ייפתח תהליך אימות מאובטח של Didit. תתבקשו לצלם מסמך
          זיהוי ולבצע בדיקת חיות (סלפי). ההחלטה הסופית מתקבלת בשרת — סיום המסך אינו אישור שהזהות
          אומתה.
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
          <li>האימות כולל צילום תעודת זהות או דרכון ובדיקת פנים מול המסמך.</li>
          <li>המצלמה והמיקרופון עשויים להיות בשימוש במהלך התהליך.</li>
          <li>Didit מעבדת את המסמכים והביומטריה. AnyNanny שומרת את סטטוס האימות ומזהה המשתמש בלבד.</li>
        </ul>

        <label className="flex cursor-pointer items-start gap-2 text-right text-[13px] leading-relaxed text-[#001F3F]">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
          />
          <span>
            אני מאשר/ת למסור מסמך זיהוי ותמונת פנים לספק האימות Didit לצורך אימות זהות ב-AnyNanny,
            ומבין/ה שהסטטוס יתעדכן רק אחרי החלטת האימות.
          </span>
        </label>

        <p className="flex items-start gap-1.5 text-[13px] text-slate-500">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-700" aria-hidden />
          סימון &quot;משתמש מאומת&quot; יופיע רק אחרי החלטת Approved מהשרת (webhook), לא אחרי סגירת
          החלון.
        </p>
      </div>
    </PersonalEditModal>
  );
}
