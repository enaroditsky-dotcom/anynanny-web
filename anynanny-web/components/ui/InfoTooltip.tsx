'use client';

import React, { useState } from 'react';
import { HelpCircle } from 'lucide-react';

interface InfoTooltipProps {
  content: string;
}

export default function InfoTooltip({ content }: InfoTooltipProps) {
  const [isVisible, setIsVisible] = useState(false);

  return (
    <div className="relative inline-block ml-1.5 align-middle select-none">
      {/* אייקון סימן השאלה */}
      <button
        type="button"
        onMouseEnter={() => setIsVisible(true)}
        onMouseLeave={() => setIsVisible(false)}
        onClick={() => setIsVisible(!isVisible)}
        className="text-stone-400 hover:text-stone-600 transition-colors focus:outline-none"
        aria-label="מידע נוסף"
      >
        <HelpCircle size={16} />
      </button>

      {/* בועת הטקסט הנסתרת/גלויה */}
      {isVisible && (
        <div className="absolute z-50 bottom-full left-1/2 transform -translate-x-1/2 mb-2 w-64 p-3 bg-stone-900 text-stone-100 text-xs rounded-lg shadow-xl border border-stone-700 text-right leading-relaxed animate-fade-in animate-duration-200">
          {content}
          {/* חץ קטן בתחתית הבועה */}
          <div className="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-stone-900" />
        </div>
      )}
    </div>
  );
}