'use client';

import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

export default function EmailVerifiedPage() {
  const searchParams = useSearchParams();
  const errorCode = searchParams.get('error_code');
  const [isError, setIsError] = useState(false);

  useEffect(() => {
    if (errorCode) {
      setIsError(true);
    }
  }, [errorCode]);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-start bg-[#FDFBF6] px-4 pt-12 pb-6 text-center" dir="rtl">
      
      {/* לוגו ומותג */}
      <div className="mb-6 flex items-center gap-2">
        <span className="text-xl font-bold text-[#001F3F]">AnyNanny</span>
      </div>

      {/* כרטיס ההודעה */}
      <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-soft border border-slate-100 space-y-4">
        
        {isError ? (
          <>
            {/* אייקון שגיאה / פג תוקף */}
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 shadow-sm ring-1 ring-amber-600/10">
              <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>

            <h1 className="text-lg font-bold text-[#001F3F]">הקישור פג תוקף או שגוי</h1>
            
            <p className="text-sm leading-relaxed text-slate-600">
              נראה שקישור האימות כבר נוצל או שעבר הזמן הקצוב שלו. אנא נסה להתחבר מחדש או לבקש מייל אימות חדש.
            </p>
          </>
        ) : (
          <>
            {/* אייקון הצלחה ירוק */}
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 shadow-sm ring-1 ring-emerald-600/10">
              <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>

            <h1 className="text-lg font-bold text-[#001F3F]">האימייל אומת בהצלחה!</h1>
            
            <p className="text-sm leading-relaxed text-slate-600">
              החשבון שלך הופעל בהצלחה. כעת ניתן לסגור חלון זה, לחזור לאפליקציה ולהתחבר מחדש.
            </p>

            <div className="pt-1">
              <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-500 border border-slate-100">
                טיפ: לאחר ההתחברות מחדש, הכל יהיה מוכן לעבודה.
              </div>
            </div>
          </>
        )}

      </div>
    </main>
  );
}