'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

export default function SitterOnboarding() {
  const router = useRouter();
  const supabase = createClientComponentClient();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [allCities, setAllCities] = useState<string[]>([]);
  
  const [formData, setFormData] = useState({
    fullName: '', phone: '', idNumber: '', birthday: '', hourlyRate: '', 
    experienceYears: '', hasCar: false, bio: '', serviceType: '', education: ''
  });
  const [selectedCities, setSelectedCities] = useState<string[]>([]);
  const [specialities, setSpecialities] = useState<string[]>([]);

  const availableSpecialities = ['עזרה ראשונה', 'ניו-בורן', 'תאומים', 'בישול', 'הכנת שיעורי בית'];
  const educationOptions = ['תיכונית', 'מקצועית', 'אקדמאית', 'סטודנטית', 'תלמידת תיכון'];

  useEffect(() => {
    const fetchCities = async () => {
      const { data } = await supabase.from('cities').select('name_he');
      if (data) setAllCities(data.map(c => c.name_he));
    };
    fetchCities();
  }, [supabase]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type, checked } = e.target as HTMLInputElement;
    setFormData(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  };

  const handleSubmit = async () => {
    setLoading(true);
    
    // 1. ניסיון לקבל סשן ישירות מה-SDK
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session || !session.user) {
      console.error("No active session found");
      alert('נראה שהחיבור לא תקין. נסה לבצע ריענון דף מלא (F5) או להתחבר שוב.');
      setLoading(false);
      return;
    }

    // 2. עדכון הנתונים עם ה-ID מהסשן
    const { error } = await supabase.from('profiles').update({
      full_name: formData.fullName, 
      phone: formData.phone, 
      id_number: formData.idNumber,
      birthday: formData.birthday, 
      service_status: formData.serviceType, 
      education: formData.education,
      city: selectedCities.join(','), 
      hourly_rate: parseInt(formData.hourlyRate) || 0,
      experience_years: formData.experienceYears, 
      "hasCar": formData.has_car, 
      specialities, 
      bio: formData.bio, 
      onboarding_completed_at: new Date().toISOString(),
    }).eq('id', session.user.id); // משתמשים ב-ID מהסשן המאומת

    if (error) {
      console.error("Supabase Error:", error);
      alert('שגיאה בשמירה: ' + error.message);
    } else {
      router.push('/sitter/dashboard');
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-stone-50 p-5" dir="rtl">
      <div className="w-full max-w-xl mx-auto bg-white p-8 rounded-3xl shadow-sm border border-stone-100">
        <h1 className="text-2xl font-bold mb-6">שלב {step} מתוך 3</h1>

        {step === 1 && (
          <div className="space-y-4">
            <input name="fullName" placeholder="שם מלא" value={formData.fullName} onChange={handleChange} className="w-full p-4 border rounded-xl" />
            <input name="phone" placeholder="טלפון" value={formData.phone} onChange={handleChange} className="w-full p-4 border rounded-xl" />
            <div className="space-y-1">
              <label className="text-sm text-stone-600 mr-1">תאריך לידה</label>
              <input name="birthday" type="date" value={formData.birthday} onChange={handleChange} className="w-full p-4 border rounded-xl" />
            </div>
            <input name="idNumber" placeholder="תעודת זהות" value={formData.idNumber} onChange={handleChange} className="w-full p-4 border rounded-xl" />
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <select name="serviceType" onChange={handleChange} className="w-full p-4 border rounded-xl">
              <option value="">שירות צבאי/לאומי</option>
              <option value="yes">כן</option>
              <option value="no">לא</option>
            </select>
            <select name="education" onChange={handleChange} className="w-full p-4 border rounded-xl">
              <option value="">השכלה</option>
              {educationOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
            </select>
            <select className="w-full p-4 border rounded-xl" onChange={(e) => {
              if (e.target.value && !selectedCities.includes(e.target.value)) setSelectedCities([...selectedCities, e.target.value]);
            }}>
              <option>בחר עיר עבודה...</option>
              {allCities.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <div className="flex flex-wrap gap-2">
              {selectedCities.map(c => <span key={c} className="bg-teal-100 p-2 rounded-lg text-sm">{c} <button onClick={() => setSelectedCities(selectedCities.filter(s => s !== c))}>x</button></span>)}
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <div className="font-bold">מומחיות מיוחדת:</div>
            <div className="grid grid-cols-2 gap-2">
              {availableSpecialities.map(s => (
                <button key={s} onClick={() => setSpecialities(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s])} className={`p-2 rounded-xl border ${specialities.includes(s) ? 'bg-teal-600 text-white' : 'bg-stone-100'}`}>
                  {s}
                </button>
              ))}
            </div>
            <textarea name="bio" placeholder="קצת על עצמך..." value={formData.bio} onChange={handleChange} className="w-full p-4 border rounded-xl h-32" />
          </div>
        )}

        <div className="flex justify-between mt-8">
          <button onClick={() => setStep(Math.max(1, step - 1))} disabled={step === 1} className="text-stone-500">חזרה</button>
          {step < 3 ? (
            <button onClick={() => setStep(step + 1)} className="px-6 py-3 bg-teal-800 text-white rounded-xl">המשך</button>
          ) : (
            <button onClick={handleSubmit} disabled={loading} className="px-6 py-3 bg-emerald-700 text-white rounded-xl">סיום והרשמה</button>
          )}
        </div>
      </div>
    </div>
  );
}