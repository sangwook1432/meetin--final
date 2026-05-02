"use client";

/**
 * AppShell — V1 Soft Trust 디자인의 공통 레이아웃
 *
 * 바텀 5탭: 둘러보기 / 매칭권 / 내 프로필 / 채팅 / 더보기
 *  - 더보기는 /me 허브 페이지로 이동 (단독 페이지)
 *
 * Props:
 *  - noPadding: 자체 스크롤을 가진 페이지(채팅방)에서 패딩 제거
 *  - noHeader: 상단 헤더 숨김
 *  - noNav: 바텀 탭 숨김 (채팅방 페이지)
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

const TABS = [
  { href: "/discover",     label: "둘러보기", icon: "search" as const },
  { href: "/me/tickets",   label: "매칭권",   icon: "ticket" as const },
  { href: "/me/myprofile", label: "내 프로필", icon: "user" as const },
  { href: "/chats",        label: "채팅",     icon: "chat" as const },
];

const MORE_PATHS = [
  "/me",
  "/me/friends",
  "/me/messages",
  "/me/wallet",
  "/me/meetings",
  "/me/schedule",
  "/me/profile",
  "/me/support",
  "/me/bizinfo",
  "/me/docs",
];

type IconName = "search" | "ticket" | "user" | "chat";

function NavIcon({ name, on }: { name: IconName; on: boolean }) {
  const c = on ? "var(--accent)" : "var(--ink-soft)";
  const sw = 2;
  if (name === "search") {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <circle cx="11" cy="11" r="7" stroke={c} strokeWidth={sw}/>
        <path d="M20 20l-3.5-3.5" stroke={c} strokeWidth={sw} strokeLinecap="round"/>
      </svg>
    );
  }
  if (name === "ticket") {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path d="M3 9c1.5 0 1.5 2 0 2v3a2 2 0 002 2h14a2 2 0 002-2v-3c-1.5 0-1.5-2 0-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v3z" stroke={c} strokeWidth={sw}/>
        <path d="M9 4v16" stroke={c} strokeWidth={sw} strokeDasharray="2 2"/>
      </svg>
    );
  }
  if (name === "chat") {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path d="M21 11.5a8.4 8.4 0 01-1.2 4.3 8.5 8.5 0 01-7.3 4.2 8.4 8.4 0 01-4.3-1.2L3 20l1.2-5.2A8.4 8.4 0 013 11.5a8.5 8.5 0 014.2-7.3A8.4 8.4 0 0111.5 3a8.5 8.5 0 018.5 8.5z" stroke={c} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    );
  }
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="8" r="4" stroke={c} strokeWidth={sw}/>
      <path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8" stroke={c} strokeWidth={sw} strokeLinecap="round"/>
    </svg>
  );
}

function MoreIcon({ on }: { on: boolean }) {
  const c = on ? "var(--accent)" : "var(--ink-soft)";
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <circle cx="6" cy="12" r="1.6" fill={c}/>
      <circle cx="12" cy="12" r="1.6" fill={c}/>
      <circle cx="18" cy="12" r="1.6" fill={c}/>
    </svg>
  );
}

export function AppShell({
  children,
  noPadding = false,
  noHeader = false,
  noNav = false,
}: {
  children: React.ReactNode;
  noPadding?: boolean;
  noHeader?: boolean;
  noNav?: boolean;
}) {
  const pathname = usePathname();
  const { user } = useAuth();

  const ticketCount = user?.matching_tickets ?? 0;

  const moreActive = MORE_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );

  return (
    <div
      className={`flex flex-col ${noNav ? "h-screen overflow-hidden" : "min-h-screen"}`}
      style={{ background: "var(--bg)" }}
    >
      {/* 상단 헤더 */}
      {!noHeader && (
        <header
          className="sticky top-0 z-20 flex items-center justify-between px-5 py-3.5"
          style={{
            background: "var(--surface)",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <Link
            href="/discover"
            className="text-xl font-extrabold tracking-tight"
            style={{ color: "var(--ink)", letterSpacing: "-0.04em" }}
          >
            MEETIN<span style={{ color: "var(--accent)" }}>.</span>
          </Link>
          {user && (
            <div className="flex items-center gap-2.5">
              {user.verification_status === "VERIFIED" ? (
                <span
                  className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold"
                  style={{
                    background: "var(--success-soft)",
                    color: "var(--success)",
                  }}
                >
                  <svg width="10" height="10" viewBox="0 0 12 12">
                    <path d="M2 6l3 3 5-6" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  인증
                </span>
              ) : (
                <Link
                  href="/me/docs"
                  className="rounded-full px-2.5 py-1 text-[11px] font-bold"
                  style={{
                    background: "var(--warning-soft)",
                    color: "oklch(0.45 0.14 70)",
                  }}
                >
                  인증 필요 →
                </Link>
              )}
              <Link
                href="/me/tickets"
                className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold"
                style={{
                  background: "var(--accent-soft)",
                  color: "var(--accent-ink)",
                }}
              >
                🎫 {ticketCount}
              </Link>
              {user.is_admin && (
                <Link
                  href="/admin"
                  className="rounded-full px-2.5 py-1 text-[11px] font-bold"
                  style={{
                    background: "oklch(0.94 0.04 290)",
                    color: "oklch(0.45 0.18 290)",
                  }}
                >
                  🛡️ 관리자
                </Link>
              )}
            </div>
          )}
        </header>
      )}

      {/* 페이지 콘텐츠 */}
      <main
        className={noPadding ? "flex-1 flex flex-col overflow-hidden" : "flex-1"}
        style={!noPadding && !noNav ? { paddingBottom: "calc(5rem + env(safe-area-inset-bottom, 0px))" } : undefined}
      >
        {children}
      </main>

      {/* 바텀 탭 */}
      {!noNav && (
        <nav
          className="fixed bottom-0 left-0 right-0 z-20 flex"
          style={{
            background: "var(--surface)",
            borderTop: "1px solid var(--border)",
            paddingBottom: "env(safe-area-inset-bottom, 0px)",
          }}
        >
          {TABS.map((tab) => {
            const active = pathname === tab.href || pathname.startsWith(tab.href + "/");
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className="flex flex-1 flex-col items-center gap-1 py-2.5 transition-colors"
              >
                <NavIcon name={tab.icon} on={active}/>
                <span
                  className="font-semibold"
                  style={{
                    fontSize: "10px",
                    letterSpacing: "-0.01em",
                    color: active ? "var(--accent)" : "var(--ink-soft)",
                  }}
                >
                  {tab.label}
                </span>
              </Link>
            );
          })}

          <Link
            href="/me"
            className="flex flex-1 flex-col items-center gap-1 py-2.5"
          >
            <MoreIcon on={moreActive}/>
            <span
              className="font-semibold"
              style={{
                fontSize: "10px",
                letterSpacing: "-0.01em",
                color: moreActive ? "var(--accent)" : "var(--ink-soft)",
              }}
            >
              더보기
            </span>
          </Link>
        </nav>
      )}
    </div>
  );
}
