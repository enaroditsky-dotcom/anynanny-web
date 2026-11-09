"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  BookOpen,
  ChevronDown,
  Download,
  Gift,
  Globe,
  LayoutGrid,
  LifeBuoy,
  MessageSquare,
  Search,
  ShieldCheck,
  ShoppingBag,
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
import { sidebarHeebo } from "@/components/marketing/sidebar-heebo";
import styles from "./marketing-home.module.css";

const ICONS: Record<Exclude<SiteNavIconName, "android" | "iphone">, LucideIcon> = {
  globe: Globe,
  app: LayoutGrid,
  users: Users,
  messages: MessageSquare,
  store: ShoppingBag,
  book: BookOpen,
  shield: ShieldCheck,
  sparkles: Sparkles,
  help: LifeBuoy,
  parent: Users,
  sitter: Users,
  buy: ShoppingBag,
  giveaway: Gift
};

function AppleMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden fill="currentColor">
      <path d="M16.365 12.84c.03 3.23 2.83 4.31 2.86 4.32-.02.08-.445 1.52-1.47 3.01-.88 1.28-1.8 2.56-3.24 2.59-1.42.03-1.88-.84-3.5-.84-1.63 0-2.13.82-3.48.87-1.39.05-2.45-1.39-3.34-2.67C2.3 17.4.91 12.57 2.79 9.31c.93-1.62 2.59-2.65 4.39-2.68 1.37-.03 2.66.92 3.5.92.84 0 2.41-1.14 4.06-.97.69.03 2.63.28 3.88 2.11-.1.06-2.32 1.35-2.29 4.15zm-2.15-6.32c.74-.9 1.24-2.14 1.1-3.38-1.07.04-2.36.71-3.12 1.61-.68.79-1.28 2.05-1.12 3.26 1.18.09 2.39-.6 3.14-1.49z" />
    </svg>
  );
}

function AndroidMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden fill="currentColor">
      <path d="M17.6 9.48 19.44 6.3c.16-.31.04-.69-.26-.85-.29-.15-.65-.06-.83.22l-1.88 3.24c-2.86-1.21-6.08-1.21-8.94 0L5.65 5.67c-.19-.29-.54-.37-.85-.22-.3.16-.42.54-.26.85l1.84 3.18C3.86 11.17 2.5 13.58 2.5 16.2v.3c0 .83.67 1.5 1.5 1.5h16c.83 0 1.5-.67 1.5-1.5v-.3c0-2.62-1.36-5.03-3.9-6.72ZM7 14.5c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1Zm10 0c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1Z" />
    </svg>
  );
}

const DOWNLOAD_LABELS: Record<"android" | "iphone", string> = {
  android: "Android להורדה",
  iphone: "iPhone להורדה"
};

function NavGlyph({ name }: { name: SiteNavIconName }) {
  if (name === "iphone") return <AppleMark className={styles.sidebarIcon} />;
  if (name === "android") return <AndroidMark className={styles.sidebarIcon} />;
  const Icon = ICONS[name];
  return <Icon aria-hidden className={styles.sidebarIcon} />;
}

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
  const infoIndex = visibleItems.findIndex((item) => item.id === "info");
  const itemsBeforeSearch = infoIndex === -1 ? visibleItems : visibleItems.slice(0, infoIndex);
  const itemsFromInfo = infoIndex === -1 ? [] : visibleItems.slice(infoIndex);

  const toggleSearch = () => {
    if (showSearchField) {
      setSearchOpen(false);
      setQuery("");
      return;
    }
    setSearchOpen(true);
  };

  const searchControls = (
    <div className={styles.sidebarSearchBlock} data-sidebar-search="">
      <button
        ref={searchButtonRef}
        type="button"
        className={`${styles.sidebarAccordion} ${styles.sidebarTopItem}`}
        aria-label="חיפוש בתפריט"
        aria-expanded={showSearchField}
        aria-controls={showSearchField ? searchId : undefined}
        onClick={toggleSearch}
      >
        <Search aria-hidden className={styles.sidebarIcon} />
        <span className={styles.sidebarLabel}>חיפוש</span>
      </button>
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
        className={`${styles.sidebar} ${sidebarHeebo.className} ${sidebarHeebo.variable}`}
        data-marketing-sidebar
        data-open={open ? "true" : "false"}
        aria-label="ניווט האתר"
        aria-hidden={isCompact && !open ? true : undefined}
        inert={isCompact && !open ? true : undefined}
      >
        <div className={styles.sidebarBrand}>
          <div className={styles.sidebarBrandRow} dir="ltr">
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
        </div>

        <nav className={styles.sidebarScroll} aria-label="ניווט AnyNanny">
          {itemsBeforeSearch.map((item) => (
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

          {searchControls}

          {itemsFromInfo.map((item) => (
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
                <DownloadRow key={item.id} item={item} />
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
        nested={depth > 0}
        activeChapterId={activeChapterId}
        onDestination={onDestination}
      />
    );
  }

  const open = isSectionOpen(node.id);
  const panelId = `${node.id}-panel`;
  const children = node.children.filter((child) => nodeMatchesQuery(child, query));
  const isOrgChapters = node.id === "org";

  return (
    <div className={depth > 0 ? styles.sidebarNested : undefined}>
      <button
        type="button"
        className={`${styles.sidebarAccordion} ${styles.sidebarFolder}`}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => onToggle(node.id)}
      >
        <NavGlyph name={node.icon} />
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
  nested = false,
  activeChapterId,
  onDestination
}: {
  item: SiteNavLink;
  nested?: boolean;
  activeChapterId: MarketingChapterId;
  onDestination: (destination: SiteNavDestination) => void;
}) {
  const destination = item.destination;
  const href = destinationHref(destination);
  const active =
    destination.kind === "chapter" && destination.chapterId === activeChapterId;
  const rowClass = nested
    ? `${styles.sidebarLink} ${styles.sidebarChild}`
    : `${styles.sidebarLink} ${styles.sidebarTopItem}`;
  const soonClass = nested
    ? `${styles.sidebarSoon} ${styles.sidebarChild}`
    : `${styles.sidebarSoon} ${styles.sidebarTopItem}`;
  const content = (
    <>
      {item.icon ? <NavGlyph name={item.icon} /> : null}
      <span className={styles.sidebarLabel}>{item.label}</span>
      {destination.kind === "soon" ? (
        <span className={styles.soonBadge}>{COMING_SOON_LABEL}</span>
      ) : null}
    </>
  );

  if (destination.kind === "soon" || !href) {
    return (
      <div className={soonClass} aria-disabled="true">
        {content}
      </div>
    );
  }

  return (
    <a
      href={href}
      className={rowClass}
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

function DownloadRow({ item }: { item: SiteNavLink }) {
  const platform = item.icon === "iphone" ? "iphone" : "android";
  const label = DOWNLOAD_LABELS[platform];

  return (
    <div className={styles.sidebarDownload} dir="ltr" aria-disabled="true">
      <span className={styles.soonBadge}>{COMING_SOON_LABEL}</span>
      <Download aria-hidden className={styles.sidebarDownloadGlyph} />
      <span className={styles.sidebarDownloadLabel}>{label}</span>
      {platform === "iphone" ? (
        <AppleMark className={styles.sidebarIcon} />
      ) : (
        <AndroidMark className={styles.sidebarIcon} />
      )}
    </div>
  );
}
