'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { User, Baby } from 'lucide-react';

export default function SignUpPage() {
  const router = useRouter();
  const supabase = createClientComponentClient();

  const [role, setRole] = useState<'parent' | 'sitter' | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const brandColor = '#008080';
  const darkColor = '#0B243B';

  // "השוטר": בכל פעם שהדף נטען, נבדוק אם המשתמש כבר מחובר ונשלח אותו למקום הנכון
  useEffect(() => {
    const checkUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        const userRole = session.user.user_metadata?.role;
        if (userRole === 'parent') router.push('/parent/onboarding');
        else if (userRole === 'sitter') router.push('/sitter/onboarding');
      }
    };
    checkUser();
  }, [supabase, router]);

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!role) {
      setErrorMsg('אנא בחר/י תפקיד (הורה או בייביסיטר) כדי להמשיך.');
      return;
    }
    
    setLoading(true);
    setErrorMsg(null);

    try {
      const { error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
          data: { role: role }
        },
      });

      if (authError) throw authError;

      // הודעה פשוטה למשתמש. הניווט יקרה אוטומטית ע"י ה-useEffect ברגע שה-Session יתעדכן
      alert("נרשמת בהצלחה! אם נדרש אישור אימייל, אנא אשר אותו כדי להמשיך.");
      
    } catch (err: any) {
      setErrorMsg(err.message || 'חלה שגיאה בתהליך הרישום.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-stone-50 flex flex-col items-center justify-center p-4 font-sans dir-rtl" dir="rtl">
      <div className="w-full max-w-sm bg-white border border-stone-100 rounded-3xl p-8 shadow-sm">
        
        <div className="flex flex-col items-center mb-8">
          <img 
            src="/anynanny-clean-transparent.png.jpg" 
            alt="Logo" 
            className="w-28 h-28 rounded-full object-cover border border-stone-100 shadow-sm mb-6" 
          />
          <h1 className="text-4xl font-black tracking-tight">
            <span style={{ color: darkColor }}>Any</span>
            <span style={{ color: brandColor }}>Nanny</span>
          </h1>
        </div>

        <div className="text-center space-y-1 mb-8">
          <h2 className="text-2xl font-bold text-stone-900">יצירת חשבון</h2>
          <p className="text-sm text-stone-500">הצטרפו לקהילת AnyNanny</p>
        </div>

        {errorMsg && (
          <div className="p-3 mb-6 bg-red-50 text-red-700 text-xs rounded-lg text-center font-medium">
            {errorMsg}
          </div>
        )}

        <div className="space-y-4 mb-8">
          <div className="grid grid-cols-2 gap-4">
            <button 
              type="button"
              onClick={() => setRole('sitter')}
              className={`p-4 border-2 rounded-2xl flex flex-col items-center gap-2 transition-all ${role === 'sitter' ? 'bg-emerald-50' : 'border-stone-100'}`}
              style={{ borderColor: role === 'sitter' ? brandColor : '#f5f5f4' }}
            >
              <Baby size={32} style={{ color: role === 'sitter' ? brandColor : '#78716c' }} />
              <span className="font-bold text-sm" style={{ color: role === 'sitter' ? brandColor : '#78716c' }}>בייביסיטר</span>
            </button>
            <button 
              type="button"
              onClick={() => setRole('parent')}
              className={`p-4 border-2 rounded-2xl flex flex-col items-center gap-2 transition-all ${role === 'parent' ? 'bg-emerald-50' : 'border-stone-100'}`}
              style={{ borderColor: role === 'parent' ? brandColor : '#f5f5f4' }}
            >
              <User size={32} style={{ color: role === 'parent' ? brandColor : '#78716c' }} />
              <span className="font-bold text-sm" style={{ color: role === 'parent' ? brandColor : '#78716c' }}>הורה</span>
            </button>
          </div>
        </div>

        {role && (
          <form onSubmit={handleSignUp} className="space-y-4 animate-in fade-in zoom-in-95">
            <input 
              type="email" required value={email} onChange={(e) => setEmail(e.target.value)} 
              className="w-full p-4 border border-stone-200 rounded-xl outline-none focus:border-[2px]" 
              style={{ outlineColor: brandColor }}
              placeholder="אימייל" 
            />
            <input 
              type="password" required value={password} onChange={(e) => setPassword(e.target.value)} 
              className="w-full p-4 border border-stone-200 rounded-xl outline-none focus:border-[2px]" 
              style={{ outlineColor: brandColor }}
              placeholder="סיסמה" 
            />
            <button type="submit" disabled={loading} className="w-full py-4 text-white font-bold rounded-xl transition-colors text-lg" style={{ backgroundColor: brandColor }}>
              {loading ? 'מייצר חשבון...' : 'יצירת חשבון'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}