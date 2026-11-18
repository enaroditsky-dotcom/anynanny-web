"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { MarketingHeader } from "@/components/marketing/marketing-header";
import { MarketingSidebar } from "@/components/marketing/marketing-sidebar";
import { chapterIdFromHash, storyChapterHref, type MarketingChapterId } from "@/lib/marketing/chapters";
import { generalWebAppHref } from "@/lib/marketing/general-acquisition";
import homeStyles from "./conversion-home.module.css";
import "./marketing-press.css";
import shellStyles from "./marketing-portal.module.css";
import storyStyles from "./marketing-home.module.css";

export function MarketingPortal({ children }: { children: ReactNode }) {
  const pathname = usePathname() || "/";
  const router = useRouter();
  const [campaignSearch, setCampaignSearch] = useState("");
  const [navOpen, setNavOpen] = useState(false);
  const [activeChapterId, setActiveChapterId] = useState<MarketingChapterId | null>(null);
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);
  const home = pathname === "/";

  useEffect(() => {
    setCampaignSearch(window.location.search.replace(/^\?/, ""));
  }, [pathname]);

  useEffect(() => {
    const sync = () => {
      if (pathname !== "/story") {
        setActiveChapterId(null);
        return;
      }
      setActiveChapterId(chapterIdFromHash(window.location.hash));
    };
    const onChapter = (event: Event) => {
      if (pathname !== "/story") return;
      const id = (event as CustomEvent<MarketingChapterId>).detail;
      if (id) setActiveChapterId(id);
    };
    sync();
    window.addEventListener("hashchange", sync);
    window.addEventListener("popstate", sync);
    window.addEventListener("anynanny-active-chapter", onChapter);
    return () => {
      window.removeEventListener("hashchange", sync);
      window.removeEventListener("popstate", sync);
      window.removeEventListener("anynanny-active-chapter", onChapter);
    };
  }, [pathname]);

  useEffect(() => {
    setNavOpen(false);
  }, [pathname]);

  return (
    <div
      className={`${storyStyles.page} ${shellStyles.shell}`}
      data-marketing-portal
      data-single-screen={home ? "true" : undefined}
      style={home ? { paddingBottom: 0 } : undefined}
      dir="rtl"
    >
      <MarketingSidebar
        open={navOpen}
        onClose={() => setNavOpen(false)}
        activeChapterId={pathname === "/story" ? activeChapterId : null}
        activePath={pathname}
        onChapter={(id) => {
          if (pathname === "/story") {
            const next = `#${id}`;
            if (window.location.hash !== next) window.location.hash = id;
            return;
          }
          router.push(storyChapterHref(id));
        }}
        campaignSearch={campaignSearch}
      />
      <div className={`${storyStyles.contentColumn} ${shellStyles.column}`}>
        <MarketingHeader
          navOpen={navOpen}
          onToggleNav={() => setNavOpen((current) => !current)}
          menuButtonRef={menuButtonRef}
          onHome={() => {
            if (home) {
              window.scrollTo({ top: 0 });
              return;
            }
            router.push("/");
          }}
          homeHref="/"
          loginHref={generalWebAppHref(campaignSearch)}
          headerClassName={home ? homeStyles.overlayHeader : undefined}
        />
        <div className={shellStyles.stage}>{children}</div>
      </div>
    </div>
  );
}
