"use client";
import { useState } from "react";

export function SitterOnboardingWizard({ onSaved }: { onSaved: () => void }) {
  const [step, setStep] = useState(1);

  return (
    <div className="bg-[#FDFBF6] border-2 border-[#C5A059] p-8 rounded-[2rem] shadow-2xl text-center max-w-sm mx-auto">
      <h2 className="text-2xl font-bold text-[#001F3F] mb-6">ברוכה הבאה ל-AnyNanny</h2>
      
      {step === 1 && (
        <div className="space-y-4">
          <p className="text-navy-800 font-medium">כמה שנות ניסיון יש לך בטיפול בילדים?</p>
          <input type="number" className="w-full border-2 border-[#C5A059]/30 rounded-2xl p-4 bg-white" placeholder="מספר שנים" />
          <button onClick={() => setStep(2)} className="w-full bg-[#001F3F] text-white py-4 rounded-2xl font-bold hover:bg-blue-900 transition">הבא</button>
        </div>
      )}
      
      {step === 2 && (
        <div className="space-y-4">
          <p className="text-navy-800 font-medium">האם יש לך הסמכת עזרה ראשונה?</p>
          <select className="w-full border-2 border-[#C5A059]/30 rounded-2xl p-4 bg-white">
            <option>כן</option>
            <option>לא</option>
          </select>
          <button onClick={onSaved} className="w-full bg-[#B8860B] text-white py-4 rounded-2xl font-bold hover:bg-yellow-700 transition">סיום ושמירה</button>
        </div>
      )}
    </div>
  );
}