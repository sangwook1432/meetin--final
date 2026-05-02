"use client";

/**
 * 더보기 메뉴 페이지들에서 공유하는 atoms.
 * MEETIN. V1 (Soft Trust) 디자인 토큰을 그대로 따른다.
 */

import { useRouter } from "next/navigation";
import type { ReactNode, CSSProperties, ReactElement } from "react";

export const T = {
  bg: "var(--bg)",
  surface: "var(--surface)",
  surfaceMuted: "var(--surface-muted)",
  border: "var(--border)",
  borderStrong: "var(--border-strong)",
  ink: "var(--ink)",
  inkMid: "var(--ink-mid)",
  inkSoft: "var(--ink-soft)",
  inkOnAccent: "var(--ink-on-accent)",
  accent: "var(--accent)",
  accentSoft: "var(--accent-soft)",
  accentInk: "var(--accent-ink)",
  male: "var(--male)",
  maleSoft: "var(--male-soft)",
  female: "var(--female)",
  femaleSoft: "var(--female-soft)",
  success: "var(--success)",
  successSoft: "var(--success-soft)",
  warning: "var(--warning)",
  warningSoft: "var(--warning-soft)",
  fontSans: '"Pretendard Variable", Pretendard, -apple-system, system-ui, sans-serif',
  fontMono: 'ui-monospace, "SF Mono", Menlo, monospace',
  radiusSm: 10,
  radiusMd: 16,
  radiusLg: 22,
  radiusXl: 28,
  shadowSm: "0 1px 2px rgba(60,40,20,0.04), 0 0 0 1px rgba(60,40,20,0.04)",
  shadowMd: "0 2px 6px rgba(60,40,20,0.05), 0 8px 22px rgba(60,40,20,0.06)",
};

export type IconName =
  | "chevron" | "plus" | "check" | "x" | "user" | "users" | "calendar" | "clock"
  | "pin" | "mail" | "chat" | "wallet" | "card" | "shield" | "help" | "doc"
  | "info" | "bell" | "spark" | "arrowDown" | "arrowUp" | "receipt" | "flag" | "coin"
  | "back" | "trash";

const ICON_PATHS: Record<IconName, ReactElement> = {
  chevron: <path d="M9 6l6 6-6 6" />,
  plus: <path d="M12 5v14M5 12h14" />,
  check: <path d="M5 12l4 4 10-10" />,
  x: <path d="M6 6l12 12M18 6L6 18" />,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 4-7 8-7s8 3 8 7" /></>,
  users: <><circle cx="9" cy="9" r="3.5" /><circle cx="17" cy="10" r="2.5" /><path d="M3 20c0-3 3-5 6-5s6 2 6 5" /><path d="M16 15c2 0 5 1.5 5 4" /></>,
  calendar: <><rect x="3.5" y="5" width="17" height="15" rx="2" /><path d="M3.5 9h17M8 3v4M16 3v4" /></>,
  clock: <><circle cx="12" cy="12" r="8" /><path d="M12 8v4l3 2" /></>,
  pin: <><path d="M12 2c-3.5 0-6 2.5-6 6 0 4.5 6 13 6 13s6-8.5 6-13c0-3.5-2.5-6-6-6z" /><circle cx="12" cy="8" r="2" /></>,
  mail: <><rect x="3" y="6" width="18" height="13" rx="2" /><path d="M3 8l9 6 9-6" /></>,
  chat: <path d="M21 12a8 8 0 0 1-8 8c-1.4 0-2.7-.3-3.8-.9L4 20l1-4.4A8 8 0 1 1 21 12z" />,
  wallet: <><rect x="3" y="6" width="18" height="13" rx="2" /><path d="M3 10h18M16 14h2" /></>,
  card: <><rect x="3" y="6" width="18" height="13" rx="2" /><path d="M3 10h18" /></>,
  shield: <path d="M12 3l8 3v5c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6l8-3z" />,
  help: <><circle cx="12" cy="12" r="9" /><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.8.4-1 .9-1 1.7M12 17h.01" /></>,
  doc: <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M9 13h6M9 17h4" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 8h.01M11 12h1v5h1" /></>,
  bell: <><path d="M6 19V11a6 6 0 1 1 12 0v8" /><path d="M4 19h16M10 22h4" /></>,
  spark: <path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.5 5.5l2.5 2.5M16 16l2.5 2.5M5.5 18.5l2.5-2.5M16 8l2.5-2.5" />,
  arrowDown: <path d="M12 5v14M6 13l6 6 6-6" />,
  arrowUp: <path d="M12 19V5M6 11l6-6 6 6" />,
  receipt: <><path d="M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2V3z" /><path d="M9 8h6M9 12h6M9 16h4" /></>,
  flag: <><path d="M5 21V4M5 4h11l-2 4 2 4H5" /></>,
  coin: <><circle cx="12" cy="12" r="8" /><path d="M9 9h4a2 2 0 1 1 0 4h-4M11 7v10" /></>,
  back: <path d="M15 5l-7 7 7 7" />,
  trash: <><path d="M4 7h16M10 11v6M14 11v6" /><path d="M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13" /><path d="M9 7V4h6v3" /></>,
};

export function Icon({ name, size = 18, stroke = "currentColor", strokeWidth = 1.7 }: {
  name: IconName; size?: number; stroke?: string; strokeWidth?: number;
}) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={stroke} strokeWidth={strokeWidth}
      strokeLinecap="round" strokeLinejoin="round"
    >
      {ICON_PATHS[name]}
    </svg>
  );
}

export type PillTone = "neutral" | "accent" | "success" | "warning" | "male" | "female";

export function Pill({ tone = "neutral", children }: { tone?: PillTone; children: ReactNode }) {
  const tones: Record<PillTone, { bg: string; fg: string }> = {
    neutral: { bg: T.surfaceMuted, fg: T.inkMid },
    accent: { bg: T.accentSoft, fg: T.accentInk },
    success: { bg: T.successSoft, fg: T.success },
    warning: { bg: T.warningSoft, fg: "oklch(0.45 0.13 70)" },
    male: { bg: T.maleSoft, fg: T.male },
    female: { bg: T.femaleSoft, fg: T.female },
  };
  const c = tones[tone];
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: "3px 9px", borderRadius: 999,
      fontSize: 11, fontWeight: 700, letterSpacing: "-0.01em",
      background: c.bg, color: c.fg, whiteSpace: "nowrap",
    }}>{children}</span>
  );
}

export function SectionCard({ children, padding = 16, style }: {
  children: ReactNode; padding?: number | string; style?: CSSProperties;
}) {
  return (
    <div style={{
      background: T.surface, border: `1px solid ${T.border}`,
      borderRadius: T.radiusLg, padding, ...style,
    }}>{children}</div>
  );
}

export function MoreNavBar({ title, right, fallbackHref }: {
  title: string; right?: ReactNode; fallbackHref?: string;
}) {
  const router = useRouter();
  const handleBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else if (fallbackHref) {
      router.push(fallbackHref);
    }
  };
  return (
    <div style={{
      position: "sticky", top: 0, zIndex: 10,
      background: T.surface, borderBottom: `1px solid ${T.border}`,
      padding: "14px 16px", display: "flex", alignItems: "center", gap: 10,
    }}>
      <button
        onClick={handleBack}
        aria-label="뒤로"
        style={{
          width: 36, height: 36, borderRadius: 999,
          background: "transparent", border: 0, cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center", padding: 0,
        }}
      >
        <Icon name="back" size={20} stroke={T.ink} strokeWidth={2} />
      </button>
      <div style={{ flex: 1, fontWeight: 700, fontSize: 16, color: T.ink, letterSpacing: "-0.02em" }}>{title}</div>
      {right}
    </div>
  );
}

export function PrimaryButton({ children, onClick, disabled, full = true, type = "button" }: {
  children: ReactNode; onClick?: () => void; disabled?: boolean; full?: boolean;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={{
        width: full ? "100%" : "auto",
        padding: "14px 18px", borderRadius: T.radiusMd,
        background: disabled ? T.surfaceMuted : T.accent,
        color: disabled ? T.inkSoft : T.inkOnAccent,
        border: 0, fontSize: 14, fontWeight: 700, letterSpacing: "-0.01em",
        cursor: disabled ? "default" : "pointer",
        fontFamily: "inherit",
      }}
    >
      {children}
    </button>
  );
}

export function GhostButton({ children, onClick, full = true, type = "button" }: {
  children: ReactNode; onClick?: () => void; full?: boolean;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      style={{
        width: full ? "100%" : "auto",
        padding: "12px 16px", borderRadius: T.radiusMd,
        background: "transparent", color: T.ink,
        border: `1px solid ${T.border}`,
        fontSize: 13, fontWeight: 600, letterSpacing: "-0.01em",
        cursor: "pointer", fontFamily: "inherit",
      }}
    >
      {children}
    </button>
  );
}
