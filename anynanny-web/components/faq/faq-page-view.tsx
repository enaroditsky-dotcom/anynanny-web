"use client";

import { useState } from "react";
import { PageBackLink, PageBackRow } from "@/components/navigation/page-back-link";
import { SettingsFaqAccordion } from "@/components/settings/mobile-settings-ui";
import {
  FAQ_PAGE_SUBTITLE,
  FAQ_PAGE_TITLE,
  faqItemsForRole,
  type FaqRole
} from "@/lib/faq/faq-items";

export function FaqPageView({ backHref, role }: { backHref: string; role: FaqRole }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const items = faqItemsForRole(role);

  return (
    <main
      className="mx-auto flex min-h-[calc(100dvh-8rem)] w-full max-w-md flex-col bg-[#FDFBF6] py-2 pb-8 px-3"
      dir="rtl"
    >
      <header className="text-right">
        <h1 className="text-xl font-bold text-[#001F3F]">{FAQ_PAGE_TITLE}</h1>
        <p className="mt-1 text-sm leading-relaxed text-slate-600">{FAQ_PAGE_SUBTITLE}</p>
      </header>

      <PageBackRow className="mt-4">
        <PageBackLink href={backHref} />
      </PageBackRow>

      <div className="mt-6">
        <SettingsFaqAccordion
          items={items}
          openId={openId}
          onToggle={(id) => setOpenId(id ? id : null)}
        />
      </div>
    </main>
  );
}
