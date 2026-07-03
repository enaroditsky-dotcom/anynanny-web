'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import InfoTooltip from '@/components/ui/InfoTooltip';
import { Plus, Trash2, ArrowRight, ArrowLeft, Check } from 'lucide-react';

interface CustomEvent {
  name: string;
  date: string;
}

export default function ParentOnboarding() {
  const router = useRouter();
  const supabase = createClientComponentClient();
  const [step, setStep] = useState(0); // 0 = מסך פתיחה, 1 = אישי וביטחון, 2 = פינוקים, 3 = משפחה גרעינית
  const [loading, setLoading] = useState(false);

  // מצב שדות הטופס
  const [formData, setFormData] = useState({
    fullName: '',
    phone: '',
    city: '',
    idNumber: '',
    birthday: '',
    spouseBirthday: '',
    anniversaryDate: '',
    childrenCount: 0,
    notesForSitter: '',
  });

  const [childrenBirthdays, setChildrenBirthdays] = useState<string[]>([]);
  const [customEvents, setCustomEvents] = useState<CustomEvent[]>([]);

  // עדכון שדות רגילים
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  // עדכון כמות ילדים ופתיחת שדות דינמיים
  const handleChildrenCountChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const count = parseInt(e.target.value, 10) || 0;
    setFormData((prev) => ({ ...prev, childrenCount: count }));
    
    // התאמת אורך המערך לכמות שנבחרה
    setChildrenBirthdays((prev) => {
      const updated = [...prev];
      if (count > updated.length) {
        while (updated.length < count) updated.push('');
      } else {
        updated.splice(count);
      }
      return updated;
    });
  };

  const handleChildBirthdayChange = (index: number, value: string) => {
    setChildrenBirthdays((prev) => {
      const updated = [...prev];
      updated[index] = value;
      return updated;
    });
  };

  // ניהול אירועים מיוחדים נוספים
  const addCustomEvent = () => {
    setCustomEvents((prev) => [...prev, { name: '', date: '' }]);
  };

  const removeCustomEvent = (index: number) => {
    setCustomEvents((prev) => prev.filter((_, i) => i !== index));
  };

  const handleCustomEventChange = (index: number, field: keyof CustomEvent, value: string) => {
    setCustomEvents((prev) => {
      const updated = [...prev];
      updated[index][field] = value;
      return updated;
    });
  };

  // שליחת הנתונים ל-Supabase עם מנגנון עקיפה חכם לפיתוח
  const handleSubmit = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      // אם אין משתמש מחובר ואנחנו בסביבת לוקאל/פיתוח - נעקוף את החסימה כדי לבדוק זרימה חלקה
      if (!user && window.location.hostname === 'localhost') {
        console.log('סביבת פיתוח מקומית זוהתה (ללא משתמש מחובר) - נתוני הטופס שנאספו:', {
          ...formData,
          childrenBirthdays,
          customEvents
        });
        router.push('/parent/dashboard');
        return;
      }

      if (!user) throw new Error('User not found');

      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: formData.fullName,
          phone: formData.phone,
          city: formData.city,
          id_number: formData.idNumber,
          birthday: formData.birthday || null,
          spouse_birthday: formData.spouseBirthday || null,
          anniversary_date: formData.anniversaryDate || null,
          children_count: formData.childrenCount,
          children_birthdays: childrenBirthdays,
          custom_events: customEvents,
          notes_for_sitter: formData.notesForSitter,
        })
        .eq('id', user.id);

      if (error) throw error;

      // מעבר אוטומטי לדשבורד של ההורה בסיום
      router.push('/parent/dashboard');
    } catch (error) {
      console.error('Error saving onboarding details:', error);
      alert('חלה שגיאה בשמירת הנתונים. אנא נסה שוב.');
    } finally {
      setLoading(false);
    }
  };

  const nextStep = () => setStep((prev) => prev + 1);
  const prevStep = () => setStep((prev) => prev - 1);

  return (
    <div className="min-h-screen bg-stone-50 text-stone-800 flex flex-col p-5 font-sans dir-rtl text-right" dir="rtl">
      
      {/* 🌟 Header האפליקציה הרשמי - Retro Boutique Style */}
      <header className="w-full max-w-xl mx-auto flex items-center justify-between border-b border-stone-200 pb-3 mb-4">
        {/* השם AnyNanny בסגנון ובצבעי המותג הרשמיים */}
        <span className="text-2xl font-serif font-black tracking-tight bg-gradient-to-r from-stone-900 via-stone-800 to-emerald-800 bg-clip-text text-transparent">
          AnyNanny
        </span>

        {/* לוגו הנני בתוך עיגול מושלם */}
        <div className="w-10 h-10 rounded-full border border-stone-200 overflow-hidden bg-stone-100 flex items-center justify-center shadow-sm">
          <img 
            src="/logo-nanny.png" 
            alt="AnyNanny Logo" 
            className="w-full h-full object-cover"
          />
        </div>
      </header>

      {/* פס התקדמות עדין - מופיע רק משלב 1 והלאה */}
      {step > 0 && (
        <div className="w-full max-w-xl mx-auto mb-6">
          <div className="flex justify-between text-xs text-stone-400 mb-1.5 font-medium">
            <span>פרטים וביטחון</span>
            <span>רגעים מיוחדים</span>
            <span>משפחה גרעינית</span>
          </div>
          <div className="w-full h-1 bg-stone-200 rounded-full overflow-hidden">
            <div 
              className="h-full bg-stone-700 transition-all duration-300" 
              style={{ width: `${(step / 3) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* 📱 אזור התוכן - מיושר לחלק העליון למניעת גלילה במסך הפתיחה */}
      <div className="w-full max-w-xl mx-auto flex-1 pt-2">
        <div className="w-full bg-white border border-stone-200 p-6 rounded-2xl shadow-sm space-y-6">
          
          {/* 👋 מסך פתיחה */}
          {step === 0 && (
            <div className="text-center space-y-5 py-2 animate-fade-in">
              <h1 className="text-2xl font-serif text-stone-900 font-bold leading-snug tracking-tight">
                ברוכים הבאים למשפחת
                <br />
                <span className="text-3xl font-black bg-gradient-to-r from-stone-900 to-stone-700 bg-clip-text text-transparent">AnyNanny!</span>
              </h1>
              <p className="text-sm font-sans text-stone-600 leading-relaxed max-w-sm mx-auto">
                איזה כיף שאתם כאן איתנו. נשמח להכיר אתכם קצת יותר לעומק, כדי שנוכל להפציע אתכם בימים המיוחדים שלכם במהלך השנה, או סתם לפנק אתכם בדברים קטנים שאתם הכי אוהבים.
              </p>
              <div className="pt-2">
                <button
                  type="button"
                  onClick={nextStep}
                  className="inline-flex items-center gap-2 px-6 py-2.5 bg-stone-900 hover:bg-stone-800 text-white rounded-xl text-sm font-medium transition-all shadow-sm"
                >
                  קדימה, בואו נתחיל! ✨
                </button>
              </div>
            </div>
          )}

          {/* 📋 שלב 1: פרטים אישיים וביטחון */}
          {step === 1 && (
            <div className="space-y-5 animate-fade-in">
              <h2 className="text-xl font-serif text-stone-900 font-bold border-b border-stone-100 pb-2">פרטים אישיים וביטחון</h2>
              
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-stone-700">שם מלא</label>
                <input
                  type="text"
                  name="fullName"
                  value={formData.fullName}
                  onChange={handleChange}
                  className="w-full p-2.5 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:border-stone-500 transition-colors text-sm"
                  placeholder="ישראל ישראלי"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-stone-700">מספר טלפון</label>
                <input
                  type="tel"
                  name="phone"
                  value={formData.phone}
                  onChange={handleChange}
                  className="w-full p-2.5 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:border-stone-500 transition-colors text-sm"
                  placeholder="050-1234567"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-stone-700">עיר מגורים</label>
                <input
                  type="text"
                  name="city"
                  value={formData.city}
                  onChange={handleChange}
                  className="w-full p-2.5 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:border-stone-500 transition-colors text-sm"
                  placeholder="למשל: חיפה"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <div className="flex items-center">
                  <label className="text-sm font-medium text-stone-700">מספר תעודת זהות</label>
                  <InfoTooltip content="מכיוון שאנחנו רוצים ליצור פלטפורמה בטוחה ב-100% לשני הצדדים, חשוב לנו לוודא שכל חברי הקהילה שלנו מאומתים. כך גם המטפלת (הנני) יודעת בדיוק ובביטחון מלא לבית של מי היא נכנסת, וגם הילדים שלכם נשארים בידיים הבטוחות ביותר." />
                </div>
                <input
                  type="text"
                  name="idNumber"
                  value={formData.idNumber}
                  onChange={handleChange}
                  className="w-full p-2.5 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:border-stone-500 transition-colors text-sm"
                  placeholder="9 ספרות"
                />
              </div>
            </div>
          )}

          {/* 🎂 שלב 2: ימי הולדת ורגעים מיוחדים */}
          {step === 2 && (
            <div className="space-y-5 animate-fade-in">
              <h2 className="text-xl font-serif text-stone-900 font-bold border-b border-stone-100 pb-2">רגעים מיוחדים שלכם 🎂</h2>
              <p className="text-xs text-stone-500 -mt-2">כאן נאסוף את תאריכי החגיגות כדי שנוכל לפנק אתכם ברגע הנכון!</p>
              
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-stone-700">תאריך הלידה שלך</label>
                <input
                  type="date"
                  name="birthday"
                  value={formData.birthday}
                  onChange={handleChange}
                  className="w-full p-2.5 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:border-stone-500 transition-colors text-sm"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-stone-700">תאריך הלידה של בן/בת הזוג <span className="text-stone-400 text-xs">(אופציונלי)</span></label>
                <input
                  type="date"
                  name="spouseBirthday"
                  value={formData.spouseBirthday}
                  onChange={handleChange}
                  className="w-full p-2.5 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:border-stone-500 transition-colors text-sm"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-stone-700">תאריך יום הנישואין שלכם <span className="text-stone-400 text-xs">(כדי שנדאג לכם לערב דייט שקט!)</span></label>
                <input
                  type="date"
                  name="anniversaryDate"
                  value={formData.anniversaryDate}
                  onChange={handleChange}
                  className="w-full p-2.5 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:border-stone-500 transition-colors text-sm"
                />
              </div>
            </div>
          )}

          {/* 👶 שלב 3: המשפחה הגרעינית שלכם */}
          {step === 3 && (
            <div className="space-y-5 max-h-[60vh] overflow-y-auto px-1 animate-fade-in">
              <h2 className="text-xl font-serif text-stone-900 font-bold border-b border-stone-100 pb-2">המשפחה הגרעינית שלכם</h2>
              
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-stone-700">מספר הילדים במשפחה</label>
                <select
                  name="childrenCount"
                  value={formData.childrenCount}
                  onChange={handleChildrenCountChange}
                  className="w-full p-2.5 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:border-stone-500 transition-colors text-sm"
                >
                  {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((num) => (
                    <option key={num} value={num}>{num}</option>
                  ))}
                </select>
              </div>

              {/* שדות תאריכי לידה דינמיים לילדים */}
              {childrenBirthdays.map((birthday, index) => (
                <div key={index} className="flex flex-col gap-1.5 p-3 bg-stone-50 border border-stone-150 rounded-xl animate-fade-in">
                  <label className="text-sm font-medium text-stone-700">תאריך לידה - ילד/ה {index + 1}</label>
                  <input
                    type="date"
                    value={birthday}
                    onChange={(e) => handleChildBirthdayChange(index, e.target.value)}
                    className="w-full p-2 bg-white border border-stone-200 rounded-lg focus:outline-none focus:border-stone-500 text-sm"
                  />
                </div>
              ))}

              {/* הוספת אירועים נוספים דינמיים */}
              <div className="space-y-3 pt-1">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-stone-700">אירועים ותאריכים נוספים שתרצו שנציין?</label>
                  <button
                    type="button"
                    onClick={addCustomEvent}
                    className="text-xs flex items-center gap-1 text-stone-600 hover:text-stone-900 font-medium transition-colors"
                  >
                    <Plus size={14} /> הוספת אירוע
                  </button>
                </div>

                {customEvents.map((event, index) => (
                  <div key={index} className="flex gap-2 items-center animate-fade-in">
                    <input
                      type="text"
                      placeholder="שם האירוע (למשל: יומולדת לסבתא)"
                      value={event.name}
                      onChange={(e) => handleCustomEventChange(index, 'name', e.target.value)}
                      className="flex-1 p-2 bg-stone-50 border border-stone-200 rounded-xl text-xs"
                    />
                    <input
                      type="date"
                      value={event.date}
                      onChange={(e) => handleCustomEventChange(index, 'date', e.target.value)}
                      className="p-2 bg-stone-50 border border-stone-200 rounded-xl text-xs"
                    />
                    <button
                      type="button"
                      onClick={() => removeCustomEvent(index)}
                      className="text-stone-400 hover:text-red-600 p-1 transition-colors"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>

              <div className="flex flex-col gap-1.5 pt-1">
                <label className="text-sm font-medium text-stone-700">דברים שחשוב שהנני תדע מראש?</label>
                <textarea
                  name="notesForSitter"
                  value={formData.notesForSitter}
                  onChange={handleChange}
                  rows={3}
                  className="w-full p-2.5 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:border-stone-500 transition-colors text-xs resize-none"
                  placeholder="אלרגיות במשפחה, חיות מחמד ידידותיות בבית או כל הערה מנהלתית אחרת..."
                />
              </div>
            </div>
          )}

          {/* כפתורי ניווט תחתוניים */}
          {step > 0 && (
            <div className="flex justify-between items-center pt-4 border-t border-stone-100">
              <button
                type="button"
                onClick={prevStep}
                className="flex items-center gap-1 text-xs font-medium text-stone-500 hover:text-stone-800 transition-colors"
              >
                <ArrowRight size={14} /> חזרה
              </button>

              {step < 3 ? (
                <button
                  type="button"
                  onClick={nextStep}
                  className="flex items-center gap-1 px-4 py-2 bg-stone-900 hover:bg-stone-800 text-white text-xs font-medium rounded-xl transition-all shadow-sm"
                >
                  המשך לצעד הבא <ArrowLeft size={14} />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={loading}
                  className="flex items-center gap-1.5 px-5 py-2 bg-stone-900 hover:bg-stone-800 text-white text-xs font-medium rounded-xl transition-all shadow-sm disabled:opacity-50"
                >
                  {loading ? 'שומר נתונים...' : 'סיום והצטרפות למשפחה'} <Check size={14} />
                </button>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}