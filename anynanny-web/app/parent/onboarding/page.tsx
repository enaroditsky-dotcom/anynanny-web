'use client';
import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';

export default function ParentOnboarding() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    phone: '',
    idNumber: '',
    parentType: 'זוג'
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return alert("שגיאת חיבור למערכת");

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return alert("לא נמצא משתמש מחובר");

    // עדכון הפרופיל בבסיס הנתונים עם השדות הנכונים
    const { error } = await supabase
      .from('profiles')
      .update({
        first_name: formData.firstName,
        last_name: formData.lastName,
        phone: formData.phone,
        id_number: formData.idNumber,
        parent_type: formData.parentType,
        // שימוש בעמודה המדויקת שמופיעה ב-DB כדי שהדשבורד יזהה סיום
        parent_onboarding_completed_at: new Date().toISOString()
      })
      .eq('id', user.id);

    if (error) {
      console.error("Supabase Update Error:", error);
      alert("שגיאה בשמירה: " + error.message);
    } else {
      // מעבר ישיר לדשבורד לאחר עדכון מוצלח
      router.push('/parent/dashboard');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="p-6 max-w-sm mx-auto">
      <h1 className="text-2xl font-bold mb-4">ברוכים הבאים ל-AnyNanny</h1>
      <input 
        type="text" placeholder="שם פרטי" className="block w-full mb-2 p-2 border rounded" 
        onChange={(e) => setFormData({...formData, firstName: e.target.value})} required 
      />
      <input 
        type="text" placeholder="שם משפחה" className="block w-full mb-2 p-2 border rounded" 
        onChange={(e) => setFormData({...formData, lastName: e.target.value})} required 
      />
      <input 
        type="tel" placeholder="טלפון" className="block w-full mb-2 p-2 border rounded" 
        onChange={(e) => setFormData({...formData, phone: e.target.value})} required 
      />
      <input 
        type="text" placeholder="מספר זהות" className="block w-full mb-2 p-2 border rounded" 
        onChange={(e) => setFormData({...formData, idNumber: e.target.value})} 
      />
      <select 
        className="block w-full mb-4 p-2 border rounded" 
        onChange={(e) => setFormData({...formData, parentType: e.target.value})}
      >
        <option value="זוג">זוג</option>
        <option value="הורה יחיד">הורה יחיד</option>
      </select>
      <button type="submit" className="w-full bg-emerald-700 text-white p-3 rounded-xl hover:bg-emerald-800 transition">
        סיום
      </button>
    </form>
  );
}