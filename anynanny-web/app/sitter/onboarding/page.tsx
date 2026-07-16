'use client';
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { IsraelCitiesMultiSelect } from '@/components/geo/israel-cities-multi-select';
import type { IsraelCity } from '@/lib/geo/israel-cities';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import {
  ensureSitterProfileRowForUser,
  SITTER_PROFILES_TABLE,
  SITTER_PROFILES_USER_COLUMN,
  SITTER_WORKING_CITIES_COLUMN
} from '@/lib/sitter/sitter-profile';
import { updateSitterWorkingCities } from '@/lib/sitter/sitter-working-cities';

export default function SitterOnboarding() {
  const router = useRouter();
  const supabase = getSupabaseBrowserClient();
  const [step, setStep] = useState(0);
  const [formData, setFormData] = useState({ firstName: '', lastName: '', phone: '', idNumber: '', exp: '', rate: '' });
  const [workingCities, setWorkingCities] = useState<IsraelCity[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        router.push('/auth/login?role=sitter');
      }
    });
  }, [supabase, router]);

  const handleSubmit = async () => {
    if (!supabase) return;
    if (workingCities.length === 0) {
      alert('יש לבחור לפחות עיר אחת שבה את עובדת.');
      return;
    }

    setIsLoading(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("פג תוקף ההתחברות");

      const user = session.user;

      const { error: pError } = await supabase.from('profiles').update({
        first_name: formData.firstName,
        last_name: formData.lastName,
        phone: formData.phone,
        id_number: formData.idNumber
      }).eq('id', user.id);
      if (pError) throw pError;

      const ensure = await ensureSitterProfileRowForUser(supabase, user.id);
      if (ensure.error) throw new Error(ensure.error);

      const citiesResult = await updateSitterWorkingCities(user.id, workingCities);
      if (!citiesResult.ok) throw new Error(citiesResult.error);

      const completedAt = new Date().toISOString();
      const years = Number(formData.exp);
      const rate = Number(formData.rate);

      const { error: sError } = await supabase.from(SITTER_PROFILES_TABLE).update({
        years_experience: Number.isFinite(years) ? Math.floor(years) : null,
        hourly_rate_nis: Number.isFinite(rate) ? rate : null,
        [SITTER_WORKING_CITIES_COLUMN]: citiesResult.cities,
        onboarding_completed_at: completedAt,
        updated_at: completedAt
      }).eq(SITTER_PROFILES_USER_COLUMN, user.id);
      if (sError) throw sError;

      router.replace('/sitter/dashboard');
      router.refresh();
    } catch (err: unknown) {
      console.error("Critical Error:", err);
      alert(err instanceof Error ? err.message : "שגיאה בשמירה. נסה להתחבר מחדש.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full max-w-sm mx-auto p-4 flex flex-col gap-6">
      <h1 className="text-2xl font-bold text-stone-900">ברוכים הבאים ל-AnyNanny!</h1>
      {step === 0 && <button onClick={() => setStep(1)} className="w-full py-3 bg-stone-900 text-white rounded-xl">נתחיל</button>}

      {step > 0 && (
        <div className="space-y-4">
          {step === 1 && (
            <>
              <input placeholder="שם פרטי" onChange={(e) => setFormData(p => ({...p, firstName: e.target.value}))} className="w-full p-3 border rounded-xl" />
              <input placeholder="שם משפחה" onChange={(e) => setFormData(p => ({...p, lastName: e.target.value}))} className="w-full p-3 border rounded-xl" />
            </>
          )}
          {step === 2 && <input placeholder="תעודת זהות" onChange={(e) => setFormData(p => ({...p, idNumber: e.target.value}))} className="w-full p-3 border rounded-xl" />}
          {step === 3 && (
            <>
              <input placeholder="ניסיון (שנים)" onChange={(e) => setFormData(p => ({...p, exp: e.target.value}))} className="w-full p-3 border rounded-xl" />
              <input placeholder="תעריף שעתי" onChange={(e) => setFormData(p => ({...p, rate: e.target.value}))} className="w-full p-3 border rounded-xl" />
            </>
          )}
          {step === 4 && (
            <div className="space-y-3 text-right">
              <p className="text-sm font-medium text-stone-800">באילו ערים את עובדת?</p>
              <IsraelCitiesMultiSelect
                value={workingCities}
                onChange={setWorkingCities}
                disabled={isLoading}
                label="בחרי ערים"
              />
              <button
                disabled={isLoading || workingCities.length === 0}
                onClick={() => void handleSubmit()}
                className="w-full py-3 bg-emerald-600 text-white rounded-xl disabled:opacity-60"
              >
                {isLoading ? 'מעדכן...' : 'סיום'}
              </button>
            </div>
          )}
          {step < 4 && <button onClick={() => setStep(s => s + 1)} className="w-full py-3 bg-emerald-600 text-white rounded-xl">המשך</button>}
          <button onClick={() => setStep(s => Math.max(0, s - 1))} className="w-full py-2 text-stone-500 text-sm">חזרה</button>
        </div>
      )}
    </div>
  );
}
