"use client";

/**
 * AppShell — 바텀 탭 네비게이션이 있는 공통 레이아웃
 *
 * 탭 구성 (4개):
 *   1. 둘러보기   /discover
 *   2. 빈자리     /vacancies
 *   3. 참여한 미팅 /my-meetings
 *   4. 설정       /settings
 *
 * /login, /register 같은 공개 페이지는 이 컴포넌트를 사용하지 않음.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

const TABS = [
  { href: "/discover",     label: "둘러보기",    icon: "🔍" },
  { href: "/vacancies",    label: "빈자리",      icon: "👥" },
  { href: "/my-meetings",  label: "참여한 미팅",  icon: "📋" },
  { href: "/settings",     label: "설정",        icon: "⚙️" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user } = useAuth();

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      {/* 상단 헤더 */}
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-gray-100 bg-white px-5 py-3 shadow-sm">
        <Link href="/discover" className="text-xl font-black tracking-tight text-gray-900">
          MEETIN<span className="text-blue-600">.</span>
        </Link>
        {user && (
          <div className="flex items-center gap-2 text-sm text-gray-500">
            {/* 인증 상태 뱃지 */}
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

            {/* 잔액 표시 */}
            <Link
              href="/settings/wallet/charge"
              className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700 hover:bg-blue-100"
            >
              💰 {(user.balance ?? 0).toLocaleString()}원
            </Link>

            {/* 관리자 전용 링크 */}
            {user.is_admin && (
              <Link
                href="/admin"
                className="rounded-full bg-purple-100 px-2.5 py-0.5 text-xs font-semibold text-purple-700 hover:bg-purple-200"
              >
                🛡️ 관리자
              </Link>
            )}
          </div>
        )}
      </header>

      {/* 페이지 콘텐츠 */}
      <main className="flex-1 pb-20">{children}</main>

      {/* 바텀 탭 (4개) */}
      <nav className="fixed bottom-0 left-0 right-0 z-20 flex border-t border-gray-100 bg-white">
        {TABS.map((tab) => {
          const active =
            pathname === tab.href ||
            pathname.startsWith(tab.href + "/");
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex flex-1 flex-col items-center py-2.5 text-xs transition-colors ${
                active ? "text-blue-600" : "text-gray-400 hover:text-gray-600"
              }`}
            >
              <span className="text-xl leading-none">{tab.icon}</span>
              <span className={`mt-0.5 font-medium ${active ? "text-blue-600" : ""}`}>
                {tab.label}
              </span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
