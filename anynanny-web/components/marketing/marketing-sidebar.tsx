"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  BookOpen,
  ChevronDown,
  Gift,
  Globe,
  House,
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
import { type MarketingChapterId } from "@/lib/marketing/chapters";
import {
  COMING_SOON_LABEL,
  DEFAULT_OPEN_NAV_IDS,
  MARKETING_SITE_NAV_ID,
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
  home: House,
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

function NavGlyph({ name }: { name: SiteNavIconName }) {
  if (name === "iphone" || name === "android") return null;
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

const OFFICIAL_ANNY_SRC = "/brand/AnyNanny%20logo%20new.png";
const EXPLORE_PATHS = ["/story", "/marketing/trust", "/marketing/respect", "/marketing/preview"];

function initialOpenIds(activePath: string): Record<string, boolean> {
  const open: Record<string, boolean> = Object.fromEntries(DEFAULT_OPEN_NAV_IDS.map((id) => [id, true]));
  if (EXPLORE_PATHS.some((path) => activePath === path || activePath.startsWith(`${path}/`))) {
    open.explore = true;
  }
  return open;
}

export function MarketingSidebar({
  open,
  onClose,
  activeChapterId,
  activePath = "",
  onChapter
}: {
  open: boolean;
  onClose: () => void;
  activeChapterId: MarketingChapterId | null;
  activePath?: string;
  onChapter: (id: MarketingChapterId) => void;
  campaignSearch?: string;
}) {
  const searchId = useId();
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const searchButtonRef = useRef<HTMLButtonElement | null>(null);
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [openIds, setOpenIds] = useState<Record<string, boolean>>(() => initialOpenIds(activePath));
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

  useEffect(() => {
    if (!EXPLORE_PATHS.some((path) => activePath === path || activePath.startsWith(`${path}/`))) return;
    setOpenIds((current) => (current.explore ? current : { ...current, explore: true }));
  }, [activePath]);

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
            <Link
              href="/"
              className={styles.sidebarLogoLink}
              onClick={() => {
                if (isCompact) onClose();
              }}
            >
              <AnyNannyLogo variant="header" />
            </Link>
            <img
              src={OFFICIAL_ANNY_SRC}
              alt=""
              aria-hidden
              draggable={false}
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
          {visibleItems.map((item) => (
            <NavNode
              key={item.id}
              node={item}
              depth={0}
              isSectionOpen={isSectionOpen}
              onToggle={toggleOpen}
              activeChapterId={activeChapterId}
              activePath={activePath}
              onDestination={handleDestination}
              query={normalizedQuery}
            />
          ))}

          {searchControls}
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
  activePath,
  onDestination,
  query
}: {
  node: SiteNavNode;
  depth: number;
  isSectionOpen: (id: string) => boolean;
  onToggle: (id: string) => void;
  activeChapterId: MarketingChapterId | null;
  activePath: string;
  onDestination: (destination: SiteNavDestination) => void;
  query: string;
}) {
  if (node.type === "link") {
    return (
      <NavLeafRow
        item={node}
        nested={depth > 0}
        activeChapterId={activeChapterId}
        activePath={activePath}
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
              activePath={activePath}
              onDestination={onDestination}
              query={query}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function isCurrentMarketingPath(href: string, pathname: string): boolean {
  const path = href.split("#")[0]?.split("?")[0] ?? "";
  if (!path.startsWith("/") || path.startsWith("//")) return false;
  if (path === "/") return pathname === "/";
  return pathname === path || pathname.startsWith(`${path}/`);
}

function NavLeafRow({
  item,
  nested = false,
  activeChapterId,
  activePath,
  onDestination
}: {
  item: SiteNavLink;
  nested?: boolean;
  activeChapterId: MarketingChapterId | null;
  activePath: string;
  onDestination: (destination: SiteNavDestination) => void;
}) {
  const destination = item.destination;
  if (item.tone === "offer") {
    return (
      <div className={styles.sidebarOffer} aria-disabled="true" data-press="">
        <span className={styles.sidebarOfferGlow} aria-hidden="true" />
        <Gift aria-hidden className={styles.sidebarOfferIcon} />
        <span className={styles.sidebarOfferLabel}>{item.label}</span>
        <Sparkles aria-hidden className={styles.sidebarOfferSparkle} />
      </div>
    );
  }
  const href = destinationHref(destination);
  const active =
    (destination.kind === "chapter" && destination.chapterId === activeChapterId) ||
    (destination.kind === "href" && Boolean(href) && isCurrentMarketingPath(href ?? "", activePath));
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

  if (destination.kind !== "chapter" && href?.startsWith("/") && !href.startsWith("//")) {
    return (
      <Link
        href={href}
        className={rowClass}
        aria-current={active ? "location" : undefined}
        onClick={() => onDestination(destination)}
      >
        {content}
      </Link>
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
