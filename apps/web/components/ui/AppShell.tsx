"use client";

/**
 * AppShell — 바텀 탭 네비게이션이 있는 공통 레이아웃
 *
 * noPadding=true: 채팅방 같이 자체 스크롤 영역을 가진 페이지용
 *   (pb-20 제거, 자식이 직접 높이 관리)
 */

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { deleteAccount } from "@/lib/api";

const TABS = [
  { href: "/discover",      label: "둘러보기",  icon: "🔍" },
  { href: "/vacancies",     label: "빈자리",    icon: "👥" },
  { href: "/me/myprofile",  label: "내 프로필", icon: "👤" },
  { href: "/chats",         label: "채팅",      icon: "💬" },
];

const MENU_ITEMS = [
  { href: "/me/friends",   label: "친구",    icon: "👫" },
  { href: "/me/messages",  label: "쪽지함",  icon: "💌" },
  { href: "/me/tickets",   label: "매칭권",  icon: "🎫" },
  { href: "/me/wallet",    label: "결제",    icon: "💳" },
  { href: "/me/meetings",  label: "내 미팅", icon: "🤝" },
  { href: "/me/schedule",  label: "내 일정", icon: "📅" },
  { href: "/me/profile",   label: "내 정보", icon: "👤" },
  { href: "/me/support",   label: "고객센터", icon: "💬" },
];

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
  const router = useRouter();
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [bizOpen, setBizOpen] = useState(false);
  const dragStartY = useRef<number>(0);
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [withdrawAgreed, setWithdrawAgreed] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [withdrawError, setWithdrawError] = useState<string | null>(null);

  const walletBalance = user?.balance ?? 0;
  const ticketCount = user?.matching_tickets ?? 0;
  // Case A: 잔액 > 1000 → 탈퇴 차단
  // Case B: 잔액 <= 1000, 매칭권 > 0 → 경고 + 체크박스
  // Case C: 잔액 <= 1000, 매칭권 0 → 일반 확인
  const withdrawCase: "A" | "B" | "C" =
    walletBalance > 1000 ? "A" : ticketCount > 0 ? "B" : "C";

  function handleSheetTouchStart(e: React.TouchEvent) {
    dragStartY.current = e.touches[0].clientY;
    setIsDragging(true);
  }

  function handleSheetTouchMove(e: React.TouchEvent) {
    const delta = e.touches[0].clientY - dragStartY.current;
    if (delta > 0) setDragOffset(delta);
  }

  function handleSheetTouchEnd() {
    setIsDragging(false);
    if (dragOffset > 80) {
      setMenuOpen(false);
    }
    setDragOffset(0);
  }

  function openWithdrawModal() {
    setWithdrawAgreed(false);
    setWithdrawError(null);
    setWithdrawOpen(true);
  }

  async function handleDeleteAccount() {
    setWithdrawing(true);
    setWithdrawError(null);
    try {
      await deleteAccount();
      logout();
    } catch (e: unknown) {
      setWithdrawError(e instanceof Error ? e.message : "탈퇴 중 오류가 발생했습니다.");
    } finally {
      setWithdrawing(false);
    }
  }

  const menuActive = MENU_ITEMS.some(
    (item) => pathname === item.href || pathname.startsWith(item.href + "/")
  );

  return (
    <div className={`flex flex-col bg-gray-50 ${noNav ? "h-screen overflow-hidden" : "min-h-screen"}`}>
      {/* 상단 헤더 */}
      {!noHeader && (
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
                  className="rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs font-semibold text-yellow-700 hover:bg-yellow-200 active:bg-yellow-200"
                >
                  인증 필요 →
                </Link>
              )}
              {user.is_admin && (
                <Link
                  href="/admin"
                  className="rounded-full bg-purple-100 px-2.5 py-0.5 text-xs font-semibold text-purple-700 hover:bg-purple-200 active:bg-purple-200"
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
        style={!noPadding ? { paddingBottom: "calc(5rem + env(safe-area-inset-bottom, 0px))" } : undefined}
      >
        {children}
      </main>

      {/* 사업자 정보 푸터 */}
      {!noNav && <footer className="border-t border-gray-100 bg-white px-5 pb-16 text-xs text-gray-400 overflow-hidden">
        <button
          onClick={() => setBizOpen((v) => !v)}
          className="flex w-full items-center justify-between py-1.5 text-gray-400"
        >
          <span>MEETIN. 사업자정보</span>
          <span className={`transition-transform duration-200 ${bizOpen ? "rotate-180" : ""}`}>∨</span>
        </button>
        {bizOpen && (
          <div className="pb-3 space-y-0.5 text-gray-500">
            <p>상호명: MEETIN. · 대표자: 전상욱</p>
            <p>사업자등록번호: 420-05-03754 (간이과세자)</p>
            <p>사업장주소: 경기도 고양시 일산서구 대산로 106, 109동 1401호 (주엽동, 강선마을)</p>
            <p>통신판매업신고번호: 신고 진행 중</p>
            <p>연락처: adamjeon2003@gmail.com</p>
            <div className="flex gap-3 pt-1">
              <a href="/terms" className="underline hover:text-gray-600 active:text-gray-600">이용약관</a>
              <a href="/privacy" className="underline hover:text-gray-600 active:text-gray-600">개인정보처리방침</a>
            </div>
          </div>
        )}
      </footer>}

      {/* 바텀 탭 */}
      {!noNav && <nav className="fixed bottom-0 left-0 right-0 z-20 flex border-t border-gray-100 bg-white" style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
        {TABS.map((tab) => {
          const active = pathname === tab.href || pathname.startsWith(tab.href + "/");
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex flex-1 flex-col items-center py-2.5 text-xs transition-colors ${
                active ? "text-blue-600" : "text-gray-400 hover:text-gray-600 active:text-gray-800"
              }`}
            >
              <span className="text-lg leading-none">{tab.icon}</span>
              <span className={`mt-0.5 font-medium ${active ? "text-blue-600" : ""}`} style={{ fontSize: "10px" }}>
                {tab.label}
              </span>
            </Link>
          );
        })}

        {/* 더보기 탭 */}
        <button
          onClick={() => setMenuOpen(true)}
          className={`flex flex-1 flex-col items-center py-2.5 text-xs transition-colors ${
            menuActive ? "text-blue-600" : "text-gray-400 hover:text-gray-600 active:text-gray-800"
          }`}
        >
          <span className="text-lg leading-none">☰</span>
          <span className="mt-0.5 font-medium" style={{ fontSize: "10px" }}>더보기</span>
        </button>
      </nav>}

      {/* 탈퇴 모달 */}
      {withdrawOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50">
          <div className="w-full max-w-lg rounded-t-2xl bg-white px-5 py-6 shadow-xl">

            {/* ── Case A: 잔액 > 1,000원 → 탈퇴 차단 ── */}
            {withdrawCase === "A" && (
              <>
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
                  <span className="text-2xl">⚠️</span>
                </div>
                <h2 className="text-lg font-black text-gray-900">탈퇴가 불가능합니다</h2>
                <p className="mt-2 text-sm leading-relaxed text-gray-500">
                  환불 가능한 지갑 잔액이 남아있어 탈퇴할 수 없습니다.
                  잔액을 모두 소진하시거나 환불 신청 후 다시 시도해 주세요.
                </p>
                <div className="mt-3 rounded-xl bg-red-50 px-4 py-3">
                  <span className="text-sm font-bold text-red-600">
                    현재 잔액: {walletBalance.toLocaleString()}원
                  </span>
                </div>
                <button
                  onClick={() => setWithdrawOpen(false)}
                  className="mt-5 w-full rounded-xl border border-gray-200 py-3 text-sm font-semibold text-gray-700 active:bg-gray-50"
                >
                  돌아가기
                </button>
              </>
            )}

            {/* ── Case B: 잔액 ≤ 1,000원 + 매칭권 보유 → 경고 + 체크박스 ── */}
            {withdrawCase === "B" && (
              <>
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-orange-100">
                  <span className="text-2xl">🎫</span>
                </div>
                <h2 className="text-lg font-black text-gray-900">매칭권이 소멸됩니다</h2>
                <p className="mt-2 text-sm leading-relaxed text-gray-500">
                  현재 보유 중인 매칭권{" "}
                  <span className="font-bold text-orange-500">{ticketCount}개</span>가 모두 소멸되며,
                  탈퇴 후 어떠한 경우에도 복구 및 환불이 불가합니다.
                </p>
                <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl bg-orange-50 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={withdrawAgreed}
                    onChange={(e) => setWithdrawAgreed(e.target.checked)}
                    className="mt-0.5 h-4 w-4 shrink-0 accent-red-500"
                  />
                  <span className="text-xs leading-relaxed text-gray-600">
                    위 내용을 확인하였으며, 매칭권 소멸 및 회원 탈퇴에 동의합니다.
                  </span>
                </label>
                {withdrawError && (
                  <p className="mt-3 rounded-xl bg-red-50 px-3 py-2.5 text-sm font-semibold text-red-600">
                    {withdrawError}
                  </p>
                )}
                <div className="mt-5 flex gap-2">
                  <button
                    onClick={() => setWithdrawOpen(false)}
                    disabled={withdrawing}
                    className="flex-1 rounded-xl border border-gray-200 py-3 text-sm font-semibold text-gray-600 active:bg-gray-50 disabled:opacity-50"
                  >
                    취소
                  </button>
                  <button
                    onClick={handleDeleteAccount}
                    disabled={!withdrawAgreed || withdrawing}
                    className="flex-1 rounded-xl bg-red-500 py-3 text-sm font-bold text-white transition-opacity active:bg-red-600 disabled:opacity-40"
                  >
                    {withdrawing ? "처리 중..." : "탈퇴하기"}
                  </button>
                </div>
              </>
            )}

            {/* ── Case C: 잔액 ≤ 1,000원 + 매칭권 0개 → 일반 확인 ── */}
            {withdrawCase === "C" && (
              <>
                <h2 className="text-lg font-black text-gray-900">정말 탈퇴하시겠어요?</h2>
                <p className="mt-2 text-sm leading-relaxed text-gray-500">
                  탈퇴 시 유저 정보 및 미팅 내역이 모두 삭제되며 복구할 수 없습니다.
                </p>
                {withdrawError && (
                  <p className="mt-3 rounded-xl bg-red-50 px-3 py-2.5 text-sm font-semibold text-red-600">
                    {withdrawError}
                  </p>
                )}
                <div className="mt-5 flex gap-2">
                  <button
                    onClick={() => setWithdrawOpen(false)}
                    disabled={withdrawing}
                    className="flex-1 rounded-xl border border-gray-200 py-3 text-sm font-semibold text-gray-600 active:bg-gray-50 disabled:opacity-50"
                  >
                    취소
                  </button>
                  <button
                    onClick={handleDeleteAccount}
                    disabled={withdrawing}
                    className="flex-1 rounded-xl bg-red-500 py-3 text-sm font-bold text-white active:bg-red-600 disabled:opacity-50"
                  >
                    {withdrawing ? "처리 중..." : "탈퇴하기"}
                  </button>
                </div>
              </>
            )}

            <div style={{ height: "max(0.5rem, env(safe-area-inset-bottom, 0px))" }} />
          </div>
        </div>
      )}

      {/* 슬라이드업 메뉴 오버레이 */}
      {menuOpen && (
        <>
          {/* 배경 딤 */}
          <div
            className="fixed inset-0 z-30 bg-black/40"
            onClick={() => setMenuOpen(false)}
          />
          {/* 바텀시트 */}
          <div
            className="fixed bottom-0 left-0 right-0 z-40 rounded-t-2xl bg-white shadow-xl"
            style={{
              transform: `translateY(${dragOffset}px)`,
              transition: isDragging ? "none" : "transform 0.25s ease",
            }}
            onTouchStart={handleSheetTouchStart}
            onTouchMove={handleSheetTouchMove}
            onTouchEnd={handleSheetTouchEnd}
          >
            <div className="mx-auto mb-3 mt-3 h-1 w-10 rounded-full bg-gray-300" />
            <div className="px-4 pb-2">
              <p className="mb-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">메뉴</p>
              {MENU_ITEMS.map((item) => (
                <button
                  key={item.href}
                  onClick={() => {
                    setMenuOpen(false);
                    router.push(item.href);
                  }}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-3.5 text-left hover:bg-gray-50 active:bg-gray-100 transition-colors"
                >
                  <span className="text-xl">{item.icon}</span>
                  <span className="text-sm font-semibold text-gray-800">{item.label}</span>
                </button>
              ))}

              <div className="my-2 border-t border-gray-100" />

              <button
                onClick={() => {
                  setMenuOpen(false);
                  logout();
                }}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-3.5 text-left hover:bg-red-50 active:bg-red-100 transition-colors"
              >
                <span className="text-xl">🚪</span>
                <span className="text-sm font-semibold text-red-500">로그아웃</span>
              </button>

              <button
                onClick={() => {
                  setMenuOpen(false);
                  openWithdrawModal();
                }}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-3.5 text-left hover:bg-gray-50 active:bg-gray-100 transition-colors"
              >
                <span className="text-xl">💔</span>
                <span className="text-sm font-semibold text-gray-400">탈퇴하기</span>
              </button>

              <div style={{ height: "max(1rem, env(safe-area-inset-bottom, 0px))" }} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
