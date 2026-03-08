"use client";

/**
 * AppShell — 바텀 탭 네비게이션이 있는 공통 레이아웃
 *
 * noPadding=true: 채팅방 같이 자체 스크롤 영역을 가진 페이지용
 *   (pb-20 제거, 자식이 직접 높이 관리)
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

const TABS = [
  { href: "/discover",    label: "둘러보기",  icon: "🔍" },
  { href: "/vacancies",   label: "빈자리",    icon: "👥" },
  { href: "/me/wallet",   label: "결제내역",  icon: "💳" },
  { href: "/me/schedule", label: "내 일정",   icon: "📅" },
  { href: "/me/profile",  label: "프로필",    icon: "👤" },
];

export function AppShell({
  children,
  noPadding = false,
}: {
  children: React.ReactNode;
  noPadding?: boolean;
}) {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      {/* 상단 헤더 */}
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-gray-100 bg-white px-5 py-3 shadow-sm">
        <Link href="/discover" className="text-xl font-black tracking-tight text-gray-900">
          MEETIN<span className="text-blue-600">.</span>
        </Link>
        {user && (
          <div className="flex items-center gap-3 text-sm text-gray-500">
            {user.verification_status === "VERIFIED" ? (
              <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                ✓ 인증
              </span>
            ) : (
              <Link
                href="/me/docs"
                className="rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs font-semibold text-yellow-700 hover:bg-yellow-200"
              >
                인증 필요 →
              </Link>
            )}
            {user.is_admin && (
              <Link
                href="/admin"
                className="rounded-full bg-purple-100 px-2.5 py-0.5 text-xs font-semibold text-purple-700 hover:bg-purple-200"
              >
                🛡️ 관리자
              </Link>
            )}
            <button onClick={logout} className="text-xs text-gray-400 hover:text-gray-600">
              로그아웃
            </button>
          </div>
        )}
      </header>

      {/* 페이지 콘텐츠 */}
      <main className={noPadding ? "flex-1 flex flex-col overflow-hidden" : "flex-1 pb-20"}>
        {children}
      </main>

      {/* 바텀 탭 — 항상 표시 */}
      <nav className="fixed bottom-0 left-0 right-0 z-20 flex border-t border-gray-100 bg-white">
        {TABS.map((tab) => {
          const active = pathname === tab.href || pathname.startsWith(tab.href + "/");
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex flex-1 flex-col items-center py-2.5 text-xs transition-colors ${
                active ? "text-blue-600" : "text-gray-400 hover:text-gray-600"
              }`}
            >
              <span className="text-lg leading-none">{tab.icon}</span>
              <span className={`mt-0.5 font-medium ${active ? "text-blue-600" : ""}`} style={{ fontSize: "10px" }}>
                {tab.label}
              </span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
