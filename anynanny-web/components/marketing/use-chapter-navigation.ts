"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  MARKETING_CHAPTERS,
  chapterIdFromHash,
  type MarketingChapterId
} from "@/lib/marketing/chapters";
import { computeChapterScrollTop } from "@/lib/marketing/chapter-scroll";

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function useChapterNavigation(headerSelector = "[data-marketing-header]") {
  const [activeId, setActiveId] = useState<MarketingChapterId>("home");
  const scrollingProgrammatically = useRef(false);

  const measureAndScroll = useCallback((id: MarketingChapterId) => {
    const header = document.querySelector(headerSelector) as HTMLElement | null;
    const section = document.getElementById(id);
    if (!section) return;
    const content =
      (section.querySelector("[data-chapter-content]") as HTMLElement | null) || section;
    const heading =
      (section.querySelector("[data-chapter-heading]") as HTMLElement | null) || content;
    const headerHeight = header?.getBoundingClientRect().height ?? 0;
    const contentRect = content.getBoundingClientRect();
    const headingRect = heading.getBoundingClientRect();
    const maxScroll = Math.max(
      0,
      document.documentElement.scrollHeight - window.innerHeight
    );
    const top = computeChapterScrollTop({
      scrollY: window.scrollY,
      headerHeight,
      viewportHeight: window.innerHeight,
      contentTop: contentRect.top,
      contentHeight: contentRect.height,
      headingTop: headingRect.top,
      maxScroll
    });
    scrollingProgrammatically.current = true;
    window.scrollTo({
      top,
      behavior: prefersReducedMotion() ? "auto" : "smooth"
    });
    window.setTimeout(() => {
      scrollingProgrammatically.current = false;
    }, prefersReducedMotion() ? 50 : 700);
  }, [headerSelector]);

  const goToChapter = useCallback(
    (id: MarketingChapterId, updateHash = true) => {
      if (updateHash) {
        const next = `#${id}`;
        if (window.location.hash !== next) {
          history.pushState(null, "", next);
        }
      }
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => measureAndScroll(id));
      });
      setActiveId(id);
    },
    [measureAndScroll]
  );

  useEffect(() => {
    const applyHash = () => {
      const id = chapterIdFromHash(window.location.hash);
      if (!id) return;
      setActiveId(id);
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => measureAndScroll(id));
      });
    };
    applyHash();
    window.addEventListener("hashchange", applyHash);
    window.addEventListener("popstate", applyHash);
    return () => {
      window.removeEventListener("hashchange", applyHash);
      window.removeEventListener("popstate", applyHash);
    };
  }, [measureAndScroll]);

  useEffect(() => {
    const header = document.querySelector(headerSelector) as HTMLElement | null;
    const headerHeight = header?.getBoundingClientRect().height ?? 72;
    const observer = new IntersectionObserver(
      (entries) => {
        if (scrollingProgrammatically.current) return;
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        const id = visible?.target.getAttribute("id");
        if (id && MARKETING_CHAPTERS.some((chapter) => chapter.id === id)) {
          setActiveId(id as MarketingChapterId);
        }
      },
      {
        rootMargin: `-${headerHeight + 8}px 0px -35% 0px`,
        threshold: [0.15, 0.35, 0.55]
      }
    );
    for (const chapter of MARKETING_CHAPTERS) {
      const el = document.getElementById(chapter.id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [headerSelector]);

  return { activeId, goToChapter };
}
