'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { Mail, Lock, ArrowLeft, User, Baby } from 'lucide-react';

export default function SignUpPage() {
  const router = useRouter();
  const supabase = createClientComponentClient();

  // סיווג מהיר וחלק בלי קשקושים
  const [role, setRole] = useState<'parent' | 'sitter' | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!role) return;
    
    setLoading(true);
    setErrorMsg(null);

    try {
      // 1. 🛡️ יצירת משתמש עם ה-Role בתוך ה-Metadata (מונע קריסות של מפתח זר ב-DB!)
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
          data: {
            role: role // נשמר בתוך raw_user_meta_data של ה-Auth
          }
        },
      });

      if (authError) throw authError;

      // 2. ניתוב אוטומטי מיידי בהתאם לבחירה שלו
      if (authData?.user) {
        if (role === 'parent') {
          router.push('/parent/onboarding');
        } else {
          router.push('/sitter/onboarding');
        }
      } else {
        // במקרה שמוגדר אישור מייל חובה ב-Supabase והמשתמש לא מחובר מיידית
        setErrorMsg('נשלח אלייך מייל אישור. אנא לחץ על הקישור במייל כדי להמשיך לשאלון.');
      }

    } catch (err: any) {
      console.error('Sign up error:', err);
      // טיפול ידידותי בשגיאת Rate Limit או שגיאות רישום אחרות
      if (err.message?.includes('rate limit')) {
        setErrorMsg('בוצעו יותר מדי ניסיונות רישום ברצף. אנא המתן דקה ונסה שוב.');
      } else {
        setErrorMsg(err.message || 'חלה שגיאה בתהליך הרישום.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-stone-50 text-stone-800 flex flex-col p-5 font-sans dir-rtl text-right" dir="rtl">
      
      {/* 🌟 Header האפליקציה הרשמי - Retro Boutique Style */}
      <header className="w-full max-w-md mx-auto flex items-center justify-between border-b border-stone-200 pb-3 mb-8">
        <span className="text-2xl font-serif font-black tracking-tight bg-gradient-to-r from-stone-900 via-stone-800 to-emerald-800 bg-clip-text text-transparent">
          AnyNanny
        </span>
        <div className="w-10 h-10 rounded-full border border-stone-200 overflow-hidden bg-stone-100 flex items-center justify-center shadow-sm">
          <img src="/logo-nanny.png" alt="AnyNanny Logo" className="w-full h-full object-cover" />
        </div>
      </header>

      {/* 📱 כרטיס הרישום המרכזי */}
      <div className="w-full max-w-md mx-auto bg-white border border-stone-200 p-6 rounded-2xl shadow-sm space-y-6">
        
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-serif text-stone-900 font-bold">יצירת חשבון חדש</h1>
          <p className="text-xs text-stone-400">הצטרפו לקהילת AnyNanny בקליק</p>
        </div>

        {errorMsg && (
          <div className={`p-3 border text-xs rounded-xl font-medium ${errorMsg.includes('נשלח אלייך') ? 'bg-emerald-50 border-emerald-100 text-emerald-800' : 'bg-red-50 border-red-100 text-red-700'}`}>
            {errorMsg}
          </div>
        )}

        {/* 1️⃣ שלב א': בחירה מהירה בלי קשקושים */}
        {!role ? (
          <div className="space-y-4 py-2">
            <label className="text-sm font-semibold text-stone-700 block text-center">מי אתם?</label>
            <div className="grid grid-cols-2 gap-3">
              
              {/* כפתור הורה */}
              <button
                type="button"
                onClick={() => setRole('parent')}
                className="flex flex-col items-center justify-center p-5 border border-stone-200 rounded-2xl bg-stone-50 hover:bg-stone-900 hover:text-white hover:border-stone-900 transition-all group shadow-sm"
              >
                <User size={32} className="text-stone-600 group-hover:text-white mb-2 transition-colors" />
                <span className="text-sm font-bold">אני הורה</span>
              </button>

              {/* כפתור בייביסיטר */}
              <button
                type="button"
                onClick={() => setRole('sitter')}
                className="flex flex-col items-center justify-center p-5 border border-stone-200 rounded-2xl bg-stone-50 hover:bg-stone-900 hover:text-white hover:border-stone-900 transition-all group shadow-sm"
              >
                <Baby size={32} className="text-stone-600 group-hover:text-white mb-2 transition-colors" />
                <span className="text-sm font-bold">אני בייביסיטר</span>
              </button>

            </div>
          </div>
        ) : (
          
          /* 2️⃣ שלב ב': טופס אימייל וסיסמה מאובטח */
          <form onSubmit={handleSignUp} className="space-y-4 animate-fade-in">
            
            <div className="flex items-center justify-between text-xs font-medium text-stone-400">
              <span>סוג חשבון: <strong className="text-stone-700">{role === 'parent' ? 'הורה' : 'בייביסיטר'}</strong></span>
              <button 
                type="button" 
                onClick={() => setRole(null)} 
                className="text-stone-500 hover:text-stone-800 flex items-center gap-0.5"
              >
                שינוי <ArrowLeft size={12} />
              </button>
            </div>

            {/* שדה אימייל */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-stone-700">כתובת אימייל</label>
              <div className="relative">
                <span className="absolute inset-y-0 right-3 flex items-center text-stone-400 pointer-events-none">
                  <Mail size={16} />
                </span>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full p-2.5 pr-10 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:border-stone-500 text-sm"
                  placeholder="name@example.com"
                />
              </div>
            </div>

            {/* שדה סיסמה */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-stone-700">סיסמה לחשבון</label>
              <div className="relative">
                <span className="absolute inset-y-0 right-3 flex items-center text-stone-400 pointer-events-none">
                  <Lock size={16} />
                </span>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full p-2.5 pr-10 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:border-stone-500 text-sm"
                  placeholder="לפחות 6 תווים"
                />
              </div>
            </div>

            {/* כפתור הרשמה */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 bg-stone-900 hover:bg-stone-800 text-white font-medium text-sm rounded-xl transition-all shadow-sm disabled:opacity-50"
              >
                {loading ? 'מייצר חשבון...' : 'המשך לשאלון ההצטרפות'}
              </button>
            </div>

          </form>
        )}

      </div>
    </div>
  );
}