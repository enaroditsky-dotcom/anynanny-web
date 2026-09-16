"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  BookOpen,
  ChevronDown,
  Gift,
  Globe,
  LayoutGrid,
  LifeBuoy,
  MessageSquare,
  Search,
  ShieldCheck,
  ShoppingBag,
  Smartphone,
  Sparkles,
  Users,
  X
} from "lucide-react";
import { AnyNannyLogo } from "@/components/brand/anynanny-logo";
import { AnynannyMascotPortrait } from "@/components/brand/anynanny-mascot-portrait";
import type { MarketingChapterId } from "@/lib/marketing/chapters";
import {
  COMING_SOON_LABEL,
  DEFAULT_OPEN_NAV_IDS,
  MARKETING_SITE_NAV_ID,
  SITE_NAV_DOWNLOADS,
  SITE_NAV_ITEMS,
  destinationHref,
  type SiteNavDestination,
  type SiteNavIconName,
  type SiteNavLink,
  type SiteNavNode
} from "@/lib/marketing/site-nav";
import styles from "./marketing-home.module.css";

const ICONS: Record<SiteNavIconName, LucideIcon> = {
  globe: Globe,
  app: LayoutGrid,
  users: Users,
  messages: MessageSquare,
  store: ShoppingBag,
  book: BookOpen,
  shield: ShieldCheck,
  sparkles: Sparkles,
  help: LifeBuoy,
  android: Smartphone,
  iphone: Smartphone,
  parent: Users,
  sitter: Users,
  buy: ShoppingBag,
  giveaway: Gift
};

function nodeMatchesQuery(node: SiteNavNode, query: string): boolean {
  if (!query) return true;
  if (node.label.toLowerCase().includes(query)) return true;
  if (node.type === "accordion") {
    return node.children.some((child) => nodeMatchesQuery(child, query));
  }
  return false;
}

export function MarketingSidebar({
  open,
  onClose,
  activeChapterId,
  onChapter
}: {
  open: boolean;
  onClose: () => void;
  activeChapterId: MarketingChapterId;
  onChapter: (id: MarketingChapterId) => void;
}) {
  const searchId = useId();
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const searchButtonRef = useRef<HTMLButtonElement | null>(null);
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [openIds, setOpenIds] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(DEFAULT_OPEN_NAV_IDS.map((id) => [id, true]))
  );
  const [isCompact, setIsCompact] = useState(false);
  const normalizedQuery = query.trim().toLowerCase();
  const showSearchField = searchOpen || Boolean(normalizedQuery);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 63.999rem)");
    const sync = () => setIsCompact(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (!showSearchField) return;
    searchInputRef.current?.focus();
  }, [showSearchField]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (searchOpen || query) {
        event.preventDefault();
        setSearchOpen(false);
        setQuery("");
        searchButtonRef.current?.focus();
        return;
      }
      if (open && isCompact) {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, isCompact, onClose, searchOpen, query]);

  useEffect(() => {
    if (!open || !isCompact) return;
    const previouslyFocused = document.activeElement;
    closeRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
    };
  }, [open, isCompact, onClose]);

  const toggleOpen = (id: string) => {
    setOpenIds((current) => ({ ...current, [id]: !current[id] }));
  };

  const isSectionOpen = (id: string) => Boolean(openIds[id]) || Boolean(normalizedQuery);

  const handleDestination = (destination: SiteNavDestination) => {
    if (destination.kind === "chapter") {
      if (isCompact) onClose();
      onChapter(destination.chapterId);
      return;
    }
    if (destination.kind === "href" && isCompact) onClose();
  };

  const visibleItems = useMemo(
    () => SITE_NAV_ITEMS.filter((item) => nodeMatchesQuery(item, normalizedQuery)),
    [normalizedQuery]
  );
  const visibleDownloads = useMemo(
    () => SITE_NAV_DOWNLOADS.filter((item) => nodeMatchesQuery(item, normalizedQuery)),
    [normalizedQuery]
  );

  return (
    <>
      {open && isCompact ? (
        <button
          type="button"
          className={styles.sidebarBackdrop}
          aria-label="סגירת תפריט האתר"
          onClick={onClose}
        />
      ) : null}

      <aside
        id={MARKETING_SITE_NAV_ID}
        className={styles.sidebar}
        data-marketing-sidebar
        data-open={open ? "true" : "false"}
        aria-label="ניווט האתר"
        aria-hidden={isCompact && !open ? true : undefined}
        inert={isCompact && !open ? true : undefined}
      >
        <div className={styles.sidebarBrand}>
          <div className={styles.sidebarBrandRow}>
            <a
              href="#home"
              className={styles.sidebarLogoLink}
              onClick={(event) => {
                event.preventDefault();
                handleDestination({ kind: "chapter", chapterId: "home" });
              }}
            >
              <AnyNannyLogo variant="header" />
            </a>
            <AnynannyMascotPortrait
              framed={false}
              decorative
              className={styles.sidebarMascot}
            />
            <button
              ref={searchButtonRef}
              type="button"
              className={styles.sidebarSearchToggle}
              aria-label="חיפוש בתפריט"
              aria-expanded={showSearchField}
              aria-controls={showSearchField ? searchId : undefined}
              onClick={() => setSearchOpen((current) => !current)}
            >
              <Search aria-hidden className={styles.sidebarIcon} />
            </button>
            {isCompact ? (
              <button
                ref={closeRef}
                type="button"
                className={styles.sidebarClose}
                aria-label="סגירת תפריט האתר"
                onClick={onClose}
              >
                <X aria-hidden className={styles.sidebarIcon} />
              </button>
            ) : null}
          </div>
          {showSearchField ? (
            <label className={styles.sidebarSearch} htmlFor={searchId}>
              <span className={styles.srOnly}>חיפוש בתפריט</span>
              <input
                ref={searchInputRef}
                id={searchId}
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="חיפוש"
                autoComplete="off"
              />
            </label>
          ) : null}
        </div>

        <nav className={styles.sidebarScroll} aria-label="ניווט AnyNanny">
          {visibleItems.map((item) => (
            <NavNode
              key={item.id}
              node={item}
              depth={0}
              isSectionOpen={isSectionOpen}
              onToggle={toggleOpen}
              activeChapterId={activeChapterId}
              onDestination={handleDestination}
              query={normalizedQuery}
            />
          ))}

          {visibleDownloads.length > 0 ? (
            <div className={styles.sidebarDownloads}>
              {visibleDownloads.map((item) => (
                <NavLeafRow
                  key={item.id}
                  item={item}
                  activeChapterId={activeChapterId}
                  onDestination={handleDestination}
                />
              ))}
            </div>
          ) : null}
        </nav>
      </aside>
    </>
  );
}

function NavNode({
  node,
  depth,
  isSectionOpen,
  onToggle,
  activeChapterId,
  onDestination,
  query
}: {
  node: SiteNavNode;
  depth: number;
  isSectionOpen: (id: string) => boolean;
  onToggle: (id: string) => void;
  activeChapterId: MarketingChapterId;
  onDestination: (destination: SiteNavDestination) => void;
  query: string;
}) {
  if (node.type === "link") {
    return (
      <NavLeafRow
        item={node}
        activeChapterId={activeChapterId}
        onDestination={onDestination}
      />
    );
  }

  const open = isSectionOpen(node.id);
  const panelId = `${node.id}-panel`;
  const Icon = ICONS[node.icon];
  const children = node.children.filter((child) => nodeMatchesQuery(child, query));
  const isOrgChapters = node.id === "org";

  return (
    <div className={depth > 0 ? styles.sidebarNested : undefined}>
      <button
        type="button"
        className={styles.sidebarAccordion}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => onToggle(node.id)}
      >
        <Icon aria-hidden className={styles.sidebarIcon} />
        <span className={styles.sidebarLabel}>{node.label}</span>
        <ChevronDown
          aria-hidden
          className={`${styles.sidebarChevron} ${open ? styles.sidebarChevronOpen : ""}`}
        />
      </button>
      {open ? (
        <div
          id={panelId}
          className={`${styles.sidebarPanel} ${isOrgChapters ? styles.sidebarOrgPanel : ""}`}
          data-org-chapters={isOrgChapters ? "true" : undefined}
        >
          {children.map((child) => (
            <NavNode
              key={child.id}
              node={child}
              depth={depth + 1}
              isSectionOpen={isSectionOpen}
              onToggle={onToggle}
              activeChapterId={activeChapterId}
              onDestination={onDestination}
              query={query}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function NavLeafRow({
  item,
  activeChapterId,
  onDestination
}: {
  item: SiteNavLink;
  activeChapterId: MarketingChapterId;
  onDestination: (destination: SiteNavDestination) => void;
}) {
  const Icon = item.icon ? ICONS[item.icon] : null;
  const destination = item.destination;
  const href = destinationHref(destination);
  const active =
    destination.kind === "chapter" && destination.chapterId === activeChapterId;
  const content = (
    <>
      {Icon ? <Icon aria-hidden className={styles.sidebarIcon} /> : null}
      <span className={styles.sidebarLabel}>{item.label}</span>
      {destination.kind === "soon" ? (
        <span className={styles.soonBadge}>{COMING_SOON_LABEL}</span>
      ) : null}
    </>
  );

  if (destination.kind === "soon" || !href) {
    return (
      <div className={styles.sidebarSoon} aria-disabled="true">
        {content}
      </div>
    );
  }

  return (
    <a
      href={href}
      className={styles.sidebarLink}
      aria-current={active ? "location" : undefined}
      onClick={(event) => {
        if (destination.kind === "chapter") {
          event.preventDefault();
        }
        onDestination(destination);
      }}
    >
      {content}
    </a>
  );
}
