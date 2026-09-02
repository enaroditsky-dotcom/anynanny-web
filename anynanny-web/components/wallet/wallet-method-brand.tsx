"use client";

import Image from "next/image";
import type { ReactNode } from "react";

export type WalletMethodKind =
  | "credit_card"
  | "bit"
  | "paybox"
  | "apple_pay"
  | "google_pay"
  | "card";

export const WALLET_METHOD_ACCENT: Record<
  "credit_card" | "bit" | "paybox" | "apple_pay" | "google_pay" | "card",
  string
> = {
  credit_card: "border-[#0B3C5D]/20 bg-transparent",
  card: "border-[#0B3C5D]/20 bg-transparent",
  bit: "border-[#0A7FA8]/25 bg-transparent",
  paybox: "border-[#1E8FD6]/25 bg-transparent",
  apple_pay: "border-slate-900/20 bg-transparent",
  google_pay: "border-[#4A90E2]/20 bg-transparent"
};

export const EMPTY_METHOD_HINT = "לחצו על עדכון להגדרה מאובטחת";

/** Compact square brand mark (detail headers / legacy callers). */
export function WalletBrandIcon({
  src,
  alt,
  fit = "cover",
  size = 32
}: {
  src: string;
  alt: string;
  fit?: "cover" | "contain";
  size?: number;
}) {
  return (
    <div
      className="relative shrink-0 overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-black/5"
      style={{ width: size, height: size }}
    >
      <Image
        src={src}
        alt={alt}
        fill
        className={fit === "contain" ? "object-contain p-0.5" : "object-cover"}
        sizes={`${size}px`}
      />
    </div>
  );
}

/** Small square logo used in detail panels. */
export function WalletMethodLogo({
  kind,
  size = 44
}: {
  kind: WalletMethodKind;
  size?: number;
}) {
  if (kind === "bit") {
    return <WalletBrandIcon src="/wallet/bit-logo.png" alt="Bit" size={size} fit="cover" />;
  }
  if (kind === "paybox") {
    return <WalletBrandIcon src="/wallet/paybox-logo.png" alt="PayBox" size={size} fit="cover" />;
  }
  if (kind === "apple_pay") {
    return <WalletBrandIcon src="/wallet/apple-pay-logo.png" alt="Apple Pay" size={size} fit="contain" />;
  }
  if (kind === "google_pay") {
    return <WalletBrandIcon src="/wallet/google-pay-logo.png" alt="Google Pay" size={size} fit="contain" />;
  }
  return <AnyNannyCardMark size={size} />;
}

function AnyNannyCardMark({ size }: { size: number }) {
  return (
    <div
      className="relative flex shrink-0 items-center justify-center overflow-hidden rounded-lg bg-gradient-to-br from-[#0B3C5D] via-[#124A6E] to-[#1A6B5A] shadow-sm ring-1 ring-[#0B3C5D]/25"
      style={{ width: size, height: size }}
    >
      <Image
        src="/anynanny-clean-transparent.png.jpg"
        alt="AnyNanny"
        width={Math.round(size * 0.72)}
        height={Math.round(size * 0.72)}
        className="object-contain drop-shadow-sm"
      />
    </div>
  );
}

function CardChip({ className = "" }: { className?: string }) {
  return (
    <div
      className={`relative overflow-hidden rounded-[4px] bg-gradient-to-br from-[#F5D76E] via-[#E8C547] to-[#C9A227] shadow-inner ring-1 ring-black/10 ${className}`}
      aria-hidden
    >
      <div className="absolute inset-x-[18%] top-0 h-px bg-black/15" />
      <div className="absolute inset-y-[35%] left-0 right-0 h-px bg-black/15" />
      <div className="absolute inset-y-0 left-[45%] w-px bg-black/15" />
    </div>
  );
}

type VisualCardProps = {
  status?: string;
  ready?: boolean;
  compact?: boolean;
  className?: string;
};

function walletCardTone(ready?: boolean): string {
  return ready ? "" : "grayscale-[0.45] opacity-80";
}

function WalletCardStateBadge({ ready }: { ready?: boolean }) {
  if (ready) {
    return (
      <span className="shrink-0 rounded-full bg-emerald-400/25 px-2 py-0.5 text-[11px] font-bold text-emerald-100 ring-1 ring-emerald-300/30 backdrop-blur-sm">
        מחובר
      </span>
    );
  }
  return (
    <span className="shrink-0 rounded-full bg-black/35 px-2 py-0.5 text-[11px] font-bold text-white/90 backdrop-blur-sm">
      לא הוגדר
    </span>
  );
}

/** Official Bit brand card — blue→teal gradient + bit logo. */
export function BitWalletCard({ status, ready, compact, className = "" }: VisualCardProps) {
  return (
    <div
      className={`relative overflow-hidden rounded-2xl text-white shadow-[0_10px_28px_-12px_rgba(10,79,140,0.55)] ring-1 ring-white/20 ${
        compact ? "h-[4.75rem]" : "h-[5.5rem]"
      } ${walletCardTone(ready)} ${className}`}
      style={{
        background: "linear-gradient(135deg, #0A4F8C 0%, #0B7FA8 48%, #00B4C8 100%)"
      }}
    >
      <div
        className="pointer-events-none absolute -left-6 -top-8 h-28 w-28 rounded-full bg-white/10 blur-2xl"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -bottom-10 -right-4 h-24 w-24 rounded-full bg-[#FF3B4A]/25 blur-2xl"
        aria-hidden
      />
      <div className="relative flex h-full items-center gap-3 px-3.5 py-2.5">
        <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl shadow-md ring-2 ring-white/35">
          <Image src="/wallet/bit-logo.png" alt="Bit" fill className="object-cover" sizes="48px" />
        </div>
        <div className="min-w-0 flex-1 text-right">
          <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-white/75">bit</p>
          <p className="text-sm font-extrabold tracking-tight">Bit</p>
          {status ? (
            <p className="mt-0.5 truncate text-[12px] font-medium text-white/85" dir="ltr">
              {status}
            </p>
          ) : null}
        </div>
        <WalletCardStateBadge ready={ready} />
      </div>
    </div>
  );
}

/** Official PayBox brand card — signature blue + PayBox logo. */
export function PayboxWalletCard({ status, ready, compact, className = "" }: VisualCardProps) {
  return (
    <div
      className={`relative overflow-hidden rounded-2xl text-white shadow-[0_10px_28px_-12px_rgba(30,143,214,0.5)] ring-1 ring-white/20 ${
        compact ? "h-[4.75rem]" : "h-[5.5rem]"
      } ${walletCardTone(ready)} ${className}`}
      style={{
        background: "linear-gradient(135deg, #0E7CC0 0%, #1E8FD6 55%, #4BB4F0 100%)"
      }}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-30"
        style={{
          backgroundImage:
            "radial-gradient(circle at 85% 20%, rgba(255,255,255,0.45), transparent 40%)"
        }}
        aria-hidden
      />
      <div className="relative flex h-full items-center gap-3 px-3.5 py-2.5">
        <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl shadow-md ring-2 ring-white/35">
          <Image
            src="/wallet/paybox-logo.png"
            alt="PayBox"
            fill
            className="object-cover"
            sizes="48px"
          />
        </div>
        <div className="min-w-0 flex-1 text-right">
          <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-white/75">
            PayBox
          </p>
          <p className="text-sm font-extrabold tracking-tight">PayBox</p>
          {status ? (
            <p className="mt-0.5 truncate text-[12px] font-medium text-white/85" dir="ltr">
              {status}
            </p>
          ) : null}
        </div>
        <WalletCardStateBadge ready={ready} />
      </div>
    </div>
  );
}

function ApplePayWalletCard({
  status,
  ready,
  compact,
  className = ""
}: VisualCardProps) {
  return (
    <div
      className={`relative overflow-hidden rounded-2xl text-white shadow-[0_10px_28px_-12px_rgba(11,60,93,0.55)] ring-1 ring-white/20 ${
        compact ? "h-[4.75rem]" : "h-[5.5rem]"
      } ${walletCardTone(ready)} ${className}`}
      style={{
        background:
          "linear-gradient(135deg, #0B3C5D 0%, #111827 55%, #0A84FF 120%)"
      }}
    >
      <div
        className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-white/10 blur-2xl"
        aria-hidden
      />
      <div className="relative flex h-full items-center gap-3 px-3.5 py-2.5">
        <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-white/95 shadow-md ring-2 ring-white/25">
          <Image
            src="/wallet/apple-pay-logo.png"
            alt="Apple Pay"
            fill
            className="object-contain p-2"
            sizes="48px"
          />
        </div>
        <div className="min-w-0 flex-1 text-right">
          <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-white/75">
            Apple Pay
          </p>
          <p className="text-sm font-extrabold tracking-tight">Apple Pay</p>
          {status ? (
            <p className="mt-0.5 truncate text-[12px] font-medium text-white/85" dir="ltr">
              {status}
            </p>
          ) : null}
        </div>
        <WalletCardStateBadge ready={ready} />
      </div>
    </div>
  );
}

function GooglePayWalletCard({
  status,
  ready,
  compact,
  className = ""
}: VisualCardProps) {
  return (
    <div
      className={`relative overflow-hidden rounded-2xl text-white shadow-[0_10px_28px_-12px_rgba(74,144,226,0.35)] ring-1 ring-white/20 ${
        compact ? "h-[4.75rem]" : "h-[5.5rem]"
      } ${walletCardTone(ready)} ${className}`}
      style={{
        background:
          "linear-gradient(135deg, #2D6CDF 0%, #4A90E2 45%, #0A84FF 100%)"
      }}
    >
      <div
        className="pointer-events-none absolute -left-10 -top-10 h-28 w-28 rounded-full bg-white/10 blur-2xl"
        aria-hidden
      />
      <div className="relative flex h-full items-center gap-3 px-3.5 py-2.5">
        <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-white/95 shadow-md ring-2 ring-white/25">
          <Image
            src="/wallet/google-pay-logo.png"
            alt="Google Pay"
            fill
            className="object-contain p-2"
            sizes="48px"
          />
        </div>
        <div className="min-w-0 flex-1 text-right">
          <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-white/75">
            Google Pay
          </p>
          <p className="text-sm font-extrabold tracking-tight">Google Pay</p>
          {status ? (
            <p className="mt-0.5 truncate text-[12px] font-medium text-white/85" dir="ltr">
              {status}
            </p>
          ) : null}
        </div>
        <WalletCardStateBadge ready={ready} />
      </div>
    </div>
  );
}

/** Custom AnyNanny-branded credit card face. */
export function AnyNannyCreditCard({
  status,
  ready,
  compact,
  className = "",
  title = "כרטיס אשראי"
}: VisualCardProps & { title?: string }) {
  return (
    <div
      className={`relative overflow-hidden rounded-2xl text-white shadow-[0_12px_32px_-12px_rgba(11,60,93,0.65)] ring-1 ring-white/15 ${
        compact ? "h-[4.75rem]" : "h-[5.5rem]"
      } ${walletCardTone(ready)} ${className}`}
      style={{
        background:
          "linear-gradient(145deg, #071E33 0%, #0B3C5D 42%, #145A6E 78%, #1F7A68 100%)"
      }}
    >
      {/* Soft brand atmosphere */}
      <div
        className="pointer-events-none absolute -right-8 top-0 h-28 w-28 rounded-full bg-[#FF8A8A]/25 blur-2xl"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -bottom-10 left-0 h-24 w-32 rounded-full bg-emerald-400/20 blur-2xl"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.12]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(-18deg, transparent, transparent 10px, rgba(255,255,255,0.35) 10px, rgba(255,255,255,0.35) 11px)"
        }}
        aria-hidden
      />

      <div className="relative flex h-full items-center gap-3 px-3.5 py-2">
        <div className="flex shrink-0 flex-col items-center gap-1.5">
          <div className="relative h-11 w-11 overflow-hidden rounded-full bg-white/95 p-0.5 shadow-md ring-2 ring-white/40">
            <Image
              src="/anynanny-clean-transparent.png.jpg"
              alt="AnyNanny"
              fill
              className="object-contain p-0.5"
              sizes="44px"
            />
          </div>
          <CardChip className="h-3.5 w-5" />
        </div>

        <div className="min-w-0 flex-1 text-right">
          <p className="text-[12px] font-bold tracking-wide text-[#FFB4B4]">AnyNanny</p>
          <p className="text-sm font-extrabold tracking-tight">{title}</p>
          {status ? (
            <p className="mt-0.5 truncate font-mono text-[12px] font-semibold tracking-wider text-white/85" dir="ltr">
              {status}
            </p>
          ) : (
            <p className="mt-0.5 text-[12px] font-medium text-white/70">מאובטח · HYP</p>
          )}
        </div>

        <WalletCardStateBadge ready={ready} />
      </div>
    </div>
  );
}

export function WalletMethodVisualCard({
  kind,
  status,
  ready,
  compact = true,
  className = "",
  cardTitle
}: VisualCardProps & {
  kind: WalletMethodKind;
  cardTitle?: string;
}) {
  if (kind === "bit") {
    return <BitWalletCard status={status} ready={ready} compact={compact} className={className} />;
  }
  if (kind === "paybox") {
    return (
      <PayboxWalletCard status={status} ready={ready} compact={compact} className={className} />
    );
  }
  if (kind === "apple_pay") {
    return (
      <ApplePayWalletCard
        status={status}
        ready={ready}
        compact={compact}
        className={className}
      />
    );
  }
  if (kind === "google_pay") {
    return (
      <GooglePayWalletCard
        status={status}
        ready={ready}
        compact={compact}
        className={className}
      />
    );
  }
  return (
    <AnyNannyCreditCard
      status={status}
      ready={ready}
      compact={compact}
      className={className}
      title={cardTitle ?? "כרטיס אשראי"}
    />
  );
}

/** Interactive row: visual card + update action. */
export function WalletMethodCardRow({
  kind,
  status,
  ready,
  updating,
  onOpen,
  onUpdate,
  updateDisabled,
  cardTitle,
  updateLabel = "עדכון"
}: {
  kind: WalletMethodKind;
  status: string;
  ready: boolean;
  updating?: boolean;
  onOpen: () => void;
  onUpdate: () => void;
  updateDisabled?: boolean;
  cardTitle?: string;
  updateLabel?: string;
}): ReactNode {
  return (
    <div className="group relative">
      <button
        type="button"
        className="block w-full text-right transition active:scale-[0.99] disabled:opacity-70"
        disabled={updateDisabled}
        onClick={onOpen}
      >
        <WalletMethodVisualCard
          kind={kind}
          status={status}
          ready={ready}
          compact
          cardTitle={cardTitle}
          className="transition group-hover:brightness-[1.03]"
        />
      </button>
      <button
        type="button"
        disabled={updateDisabled}
        onClick={onUpdate}
        className="absolute bottom-2 left-2 z-[1] rounded-full bg-black/25 px-2.5 py-1 text-[12px] font-bold text-white backdrop-blur-md ring-1 ring-white/25 transition hover:bg-black/40 disabled:opacity-50"
      >
        {updating ? "…" : updateLabel}
      </button>
    </div>
  );
}
