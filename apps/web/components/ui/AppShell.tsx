"use client";

/**
 * AppShell — 바텀 탭 네비게이션이 있는 공통 레이아웃
 *
 * 탭 구성 (4개):
 *   1. 둘러보기   /discover
 *   2. 빈자리     /vacancies
 *   3. 내 채팅    /my-chats
 *   4. 메뉴       /menu
 *
 * 상단 헤더: MEETIN 로고 + 인증뱃지 + 잔액 + 벨 아이콘(알림)
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useEffect, useState } from "react";
import { getUnreadCount } from "@/lib/api";

const TABS = [
  { href: "/discover",   label: "둘러보기", icon: "🔍" },
  { href: "/vacancies",  label: "빈자리",   icon: "👥" },
  { href: "/my-chats",   label: "내 채팅",  icon: "💬" },
  { href: "/menu",       label: "메뉴",     icon: "☰" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);

  // 벨 아이콘용 미읽은 알림 카운트 (30초마다 폴링)
  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    const fetchCount = async () => {
      try {
        const data = await getUnreadCount();
        if (!cancelled) setUnreadCount(data.unread_count);
      } catch {
        // 무시
      }
    };

    fetchCount();
    const interval = setInterval(fetchCount, 30_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [user]);

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
              href="/menu/wallet/charge"
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

            {/* 벨 아이콘 (알림) */}
            <Link href="/notifications" className="relative flex items-center justify-center h-8 w-8 rounded-full hover:bg-gray-100 transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5 text-gray-600">
                <path fillRule="evenodd" d="M5.25 9a6.75 6.75 0 0113.5 0v.75c0 2.123.8 4.057 2.118 5.52a.75.75 0 01-.297 1.206c-1.544.57-3.16.99-4.831 1.243a3.75 3.75 0 11-7.48 0 24.585 24.585 0 01-4.831-1.244.75.75 0 01-.298-1.205A8.217 8.217 0 005.25 9.75V9zm4.502 8.9a2.25 2.25 0 104.496 0 25.057 25.057 0 01-4.496 0z" clipRule="evenodd" />
              </svg>
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </Link>
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
