'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import InfoTooltip from '@/components/ui/InfoTooltip';
import { Plus, ArrowRight, ArrowLeft, Check, Upload, Sparkles } from 'lucide-react';

export default function SitterOnboarding() {
  const router = useRouter();
  const supabase = createClientComponentClient();
  const [step, setStep] = useState(0); // 0 = מסך פתיחה, 1 = אישי וביטחון, 2 = פרופיל מקצועי, 3 = התמחויות ותמונה
  const [loading, setLoading] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  // מצב שדות הטופס
  const [formData, setFormData] = useState({
    fullName: '',
    phone: '',
    birthday: '',
    idNumber: '',
    city: '',
    hourlyRate: '',
    experienceYears: '',
    hasCar: false,
    bio: '',
  });

  // רשימת התמחויות (הצ'קבוקסים החדשים שהגדרת)
  const [specialities, setSpecialities] = useState<string[]>([]);

  const availableSpecialities = [
    { id: 'first_aid', label: 'עזרה ראשונה' },
    { id: 'new_born', label: 'ניו-בורן (תינוקות)' },
    { id: 'twins', label: 'תאומים ושלישיות' },
    { id: 'cooking', label: 'בישול וארוחות ערב' },
    { id: 'homework', label: 'הכנת שיעורי בית' }
  ];

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    if (type === 'checkbox') {
      const target = e.target as HTMLInputElement;
      setFormData((prev) => ({ ...prev, [name]: target.checked }));
    } else {
      setFormData((prev) => ({ ...prev, [name]: value }));
    }
  };

  const handleSpecialityChange = (label: string) => {
    setSpecialities((prev) =>
      prev.includes(label) ? prev.filter((item) => item !== label) : [...prev, label]
    );
  };

  // סימולציית העלאת תמונה (בפיתוח נשמור כ-Preview, בלייב זה יעלה ל-Storage Bucket)
  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  // שמירת הנתונים עם הלקחים שיושמו מההורה
  const handleSubmit = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      // 🛡️ לקח מיושם: מניעת קריסה ב-localhost ללא משתמש מחובר
      if (!user && window.location.hostname === 'localhost') {
        console.log('סביבת פיתוח (ללא משתמש) - נתוני שאלון נני שנאספו:', {
          ...formData,
          specialities,
          avatar_url: imagePreview ? 'base64_image_data_here' : null
        });
        router.push('/sitter/dashboard');
        return;
      }

      if (!user) throw new Error('User not found');

      // כאן תתבצע העלאת התמונה ל-Supabase Storage במידה ויש קובץ
      let finalAvatarUrl = '';
      if (imagePreview) {
        // בעתיד נשלב כאן את ה-upload ל-bucket 'nanny-avatars'
        finalAvatarUrl = imagePreview; 
      }

      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: formData.fullName,
          phone: formData.phone,
          birthday: formData.birthday || null,
          id_number: formData.idNumber,
          city: formData.city,
          hourly_rate: parseInt(formData.hourlyRate, 10) || null,
          experience_years: formData.experienceYears,
          has_car: formData.hasCar,
          specialities: specialities,
          bio: formData.bio,
          avatar_url: finalAvatarUrl,
        })
        .eq('id', user.id);

      if (error) throw error;

      router.push('/sitter/dashboard');
    } catch (error) {
      console.error('Error saving sitter onboarding:', error);
      alert('חלה שגיאה בשמירת הנתונים. אנא נסה שוב.');
    } finally {
      setLoading(false);
    }
  };

  const nextStep = () => setStep((prev) => prev + 1);
  const prevStep = () => setStep((prev) => prev - 1);

  return (
    <div className="min-h-screen bg-stone-50 text-stone-800 flex flex-col p-5 font-sans dir-rtl text-right" dir="rtl">
      
      {/* 🌟 Header האפליקציה הרשמי */}
      <header className="w-full max-w-xl mx-auto flex items-center justify-between border-b border-stone-200 pb-3 mb-4">
        <span className="text-2xl font-serif font-black tracking-tight bg-gradient-to-r from-stone-900 via-stone-800 to-emerald-800 bg-clip-text text-transparent">
          AnyNanny
        </span>
        <div className="w-10 h-10 rounded-full border border-stone-200 overflow-hidden bg-stone-100 flex items-center justify-center shadow-sm">
          <img src="/logo-nanny.png" alt="AnyNanny Logo" className="w-full h-full object-cover" />
        </div>
      </header>

      {/* 📍 לקח מיושם: פס התקדמות עדין שלוקח בחשבון גובה מובייל */}
      {step > 0 && (
        <div className="w-full max-w-xl mx-auto mb-6">
          <div className="flex justify-between text-xs text-stone-400 mb-1.5 font-medium">
            <span>פרטים וביטחון</span>
            <span>פרופיל מקצועי</span>
            <span>תמונה והתמחויות</span>
          </div>
          <div className="w-full h-1 bg-stone-200 rounded-full overflow-hidden">
            <div className="h-full bg-stone-700 transition-all duration-300" style={{ width: `${(step / 3) * 100}%` }} />
          </div>
        </div>
      )}

      {/* 📱 לקח מיושם: הצמדה לחלק העליון (pt-2) למניעת גלילה מעיקה */}
      <div className="w-full max-w-xl mx-auto flex-1 pt-2">
        <div className="w-full bg-white border border-stone-200 p-6 rounded-2xl shadow-sm space-y-6">
          
          {/* 👋 מסך פתיחה - ללא צורך בגלילה */}
          {step === 0 && (
            <div className="text-center space-y-5 py-2 animate-fade-in">
              <h1 className="text-2xl font-serif text-stone-900 font-bold leading-snug tracking-tight">
                ברוכים הבאים למשפחת
                <br />
                <span className="text-3xl font-black bg-gradient-to-r from-stone-900 to-stone-700 bg-clip-text text-transparent">AnyNanny!</span>
              </h1>
              <p className="text-sm font-sans text-stone-600 leading-relaxed max-w-sm mx-auto">
                איזה כיף שאתם כאן איתנו. נשמח להכיר אתכם קצת יותר לעומק, כדי שנוכל להפתיע אתכם בימים המיוחדים שלכם במהלך השנה, או סתם לפנק אתכם בדברים קטנים שאתם הכי אוהבים.
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

          {/* 📋 שלב 1: פרטים אישיים וביטחון קשיח */}
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
                  className="w-full p-2.5 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:border-stone-500 text-sm"
                  placeholder="השם המלא שלך"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-stone-700">מספר טלפון</label>
                <input
                  type="tel"
                  name="phone"
                  value={formData.phone}
                  onChange={handleChange}
                  className="w-full p-2.5 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:border-stone-500 text-sm"
                  placeholder="050-1234567"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-stone-700">תאריך לידה</label>
                <input
                  type="date"
                  name="birthday"
                  value={formData.birthday}
                  onChange={handleChange}
                  className="w-full p-2.5 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:border-stone-500 text-sm"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <div className="flex items-center">
                  <label className="text-sm font-medium text-stone-700">מספר תעודת זהות</label>
                  <InfoTooltip content="הביטחון של הקהילה שלנו הוא מעל הכל. מספר תעודת הזהות משמש אותנו לאימות פרופיל קשיח ובדיקת רקע פנימית, כדי להבטיח סביבה בטוחה לך ולהורים המארחים." />
                </div>
                <input
                  type="text"
                  name="idNumber"
                  value={formData.idNumber}
                  onChange={handleChange}
                  className="w-full p-2.5 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:border-stone-500 text-sm"
                  placeholder="9 ספרות"
                />
              </div>
            </div>
          )}

          {/* 💼 שלב 2: כרטיס הביקור המקצועי (היתרונות שלך) */}
          {step === 2 && (
            <div className="space-y-5 animate-fade-in">
              <h2 className="text-xl font-serif text-stone-900 font-bold border-b border-stone-100 pb-2">הפרופיל המקצועי שלך</h2>
              <p className="text-xs text-emerald-700 bg-emerald-50 p-2 rounded-lg font-medium flex items-center gap-1">
                <Sparkles size={14} /> המידע הזה יעזור להורים להכיר אותך ויעניק לך יתרון בסינונים שלהם!
              </p>

              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-stone-700">באילו ערים את/ה מוכנ/ה לעבוד?</label>
                <input
                  type="text"
                  name="city"
                  value={formData.city}
                  onChange={handleChange}
                  className="w-full p-2.5 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:border-stone-500 text-sm"
                  placeholder="למשל: חיפה, קריות"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-stone-700">תעריף שעתי מבוקש (ב-₪)</label>
                <input
                  type="number"
                  name="hourlyRate"
                  value={formData.hourlyRate}
                  onChange={handleChange}
                  className="w-full p-2.5 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:border-stone-500 text-sm"
                  placeholder="₪ לשעה (למשל: 60)"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-stone-700">כמה שנות ניסיון יש לך בעבודה עם ילדים?</label>
                <select
                  name="experienceYears"
                  value={formData.experienceYears}
                  onChange={handleChange}
                  className="w-full p-2.5 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:border-stone-500 text-sm"
                >
                  <option value="">בחרי שנות ניסיון...</option>
                  <option value="0">ללא ניסיון מקצועי</option>
                  <option value="1">שנה אחת</option>
                  <option value="2">שנתיים</option>
                  <option value="3-5">3 עד 5 שנים</option>
                  <option value="5+">מעל 5 שנים</option>
                </select>
              </div>

              <div className="flex items-center gap-3 p-3 bg-stone-50 border border-stone-200 rounded-xl cursor-pointer">
                <input
                  type="checkbox"
                  id="hasCar"
                  name="hasCar"
                  checked={formData.hasCar}
                  onChange={handleChange}
                  className="w-4 h-4 rounded text-stone-900 border-stone-300 focus:ring-stone-500"
                />
                <label htmlFor="hasCar" className="text-sm font-medium text-stone-700 cursor-pointer select-none">
                  יש לי רכב זמין לנסיעות / איסוף מהמסגרות (יתרון עצום אצל הורים!)
                </label>
              </div>
            </div>
          )}

          {/* ✨ שלב 3: תמונת פרופיל והתמחויות מיוחדות */}
          {step === 3 && (
            <div className="space-y-5 max-h-[60vh] overflow-y-auto px-1 animate-fade-in">
              <h2 className="text-xl font-serif text-stone-900 font-bold border-b border-stone-100 pb-2">התמחויות ומראה הפרופיל</h2>

              {/* העלאת תמונת פרופיל חכמה */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-stone-700 block">תמונת פרופיל ברורה</label>
                <p className="text-xs text-stone-400">צוות העיצוב שלנו ידאג לערוך לך רקע מותגי חגיגי ואחיד כדי שהפרופיל שלך ייראה הכי מקצועי שיש!</p>
                <div className="flex items-center gap-4 pt-1">
                  <div className="w-16 h-16 rounded-full border-2 border-dashed border-stone-300 bg-stone-50 overflow-hidden flex items-center justify-center shadow-inner flex-shrink-0">
                    {imagePreview ? (
                      <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
                    ) : (
                      <Upload size={20} className="text-stone-400" />
                    )}
                  </div>
                  <label className="cursor-pointer bg-white border border-stone-200 hover:bg-stone-50 px-4 py-2 rounded-xl text-xs font-medium text-stone-700 transition-colors shadow-sm">
                    בחירת תמונת פנים
                    <input type="file" accept="image/*" onChange={handleImageChange} className="hidden" />
                  </label>
                </div>
              </div>

              {/* צ'קבוקסים מורחבים להתמחויות */}
              <div className="space-y-2.5 pt-2">
                <label className="text-sm font-medium text-stone-700 block">יש לך התמחויות או מיומנויות מיוחדות? <span className="text-xs text-stone-400">(סמני את כל מה שמתאים)</span></label>
                <div className="grid grid-cols-1 gap-2">
                  {availableSpecialities.map((spec) => (
                    <div
                      key={spec.id}
                      onClick={() => handleSpecialityChange(spec.label)}
                      className={`flex items-center justify-between p-2.5 border rounded-xl text-xs font-medium transition-all cursor-pointer ${
                        specialities.includes(spec.label)
                          ? 'bg-stone-900 border-stone-900 text-white'
                          : 'bg-stone-50 border-stone-200 text-stone-700 hover:border-stone-400'
                      }`}
                    >
                      <span>{spec.label}</span>
                      {specialities.includes(spec.label) && <Check size={14} />}
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-1.5 pt-1">
                <label className="text-sm font-medium text-stone-700">ספרי קצת על עצמך והגישה שלך לילדים</label>
                <textarea
                  name="bio"
                  value={formData.bio}
                  onChange={handleChange}
                  rows={3}
                  className="w-full p-2.5 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:border-stone-500 text-xs resize-none"
                  placeholder="הורים אוהבים לקרוא על הניסיון שלך, תחביבים, או למה את/ה נהנ/ה לעבוד עם ילדים..."
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
                  {loading ? 'שומר נתונים...' : 'סיום והצטרפות כנני'} <Check size={14} />
                </button>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}