'use client';

import React from 'react';
import { ParentOnboardingWizard } from '@/components/parent/parent-onboarding-wizard';

export default function ParentOnboardingPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#FDFBF6] p-4" dir="rtl">
      <ParentOnboardingWizard />
    </main>
  );
}