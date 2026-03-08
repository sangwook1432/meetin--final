"use client";

/**
 * /menu — 메뉴 페이지
 *
 * 섹션:
 *   - 내 미팅 (참여 중인 미팅 요약)
 *   - 내 채팅방
 *   - 미팅 일정
 *   - 친구 목록
 *   - 계정 (프로필 / 충전 / 인출 / 로그아웃)
 */

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { AppShell } from "@/components/ui/AppShell";
import { getMyMeetings, listChats } from "@/lib/api";
import type { MyMeetingItem } from "@/types";

interface MenuItemProps {
  icon: string;
  label: string;
  description?: string;
  href?: string;
  onClick?: () => void;
  variant?: "default" | "danger";
  badge?: string;
  badgeColor?: string;
}

function MenuItem({
  icon,
  label,
  description,
  href,
  onClick,
  variant = "default",
  badge,
  badgeColor = "blue",
}: MenuItemProps) {
  const base =
    "flex w-full items-center gap-4 rounded-2xl bg-white px-4 py-3.5 text-left shadow-sm hover:shadow-md active:scale-[0.98] transition-all border border-gray-100";
  const textColor = variant === "danger" ? "text-red-600" : "text-gray-800";
  const badgeBg =
    badgeColor === "green"
      ? "bg-emerald-100 text-emerald-700"
      : badgeColor === "red"
      ? "bg-red-100 text-red-700"
      : "bg-blue-100 text-blue-700";

  const inner = (
    <>
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gray-50 text-xl flex-shrink-0">
        {icon}
      </span>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-semibold truncate ${textColor}`}>{label}</p>
        {description && (
          <p className="mt-0.5 text-xs text-gray-400 truncate">{description}</p>
        )}
      </div>
      {badge && (
        <span className={`flex-shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${badgeBg}`}>
          {badge}
        </span>
      )}
      <span className="text-gray-300 flex-shrink-0">›</span>
    </>
  );

  if (href) {
    return (
      <Link href={href} className={base}>
        {inner}
      </Link>
    );
  }

  return (
    <button onClick={onClick} className={base}>
      {inner}
    </button>
  );
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  RECRUITING:      { label: "모집 중",  color: "text-blue-600" },
  FULL:            { label: "자리 찼음", color: "text-orange-500" },
  WAITING_CONFIRM: { label: "확정 대기", color: "text-yellow-600" },
  CONFIRMED:       { label: "확정됨",   color: "text-emerald-600" },
  CANCELLED:       { label: "취소됨",   color: "text-gray-400" },
};

export default function MenuPage() {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const [myMeetings, setMyMeetings] = useState<MyMeetingItem[]>([]);
  const [chatRooms, setChatRooms] = useState<{ room_id: number; meeting_id: number }[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const [mRes, cRes] = await Promise.all([
          getMyMeetings().catch(() => ({ meetings: [] })),
          listChats().catch(() => ({ rooms: [] })),
        ]);
        setMyMeetings(mRes.meetings);
        setChatRooms(cRes.rooms);
      } finally {
        setDataLoading(false);
      }
    })();
  }, [user]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-gray-400">
        로딩 중...
      </div>
    );
  }

  if (!user) {
    router.replace("/login");
    return null;
  }

  const balanceLabel = `${(user.balance ?? 0).toLocaleString()}원`;
  const activeMeetings = myMeetings.filter(
    (m) => m.status !== "CANCELLED"
  );
  const confirmedMeetings = myMeetings.filter((m) => m.status === "CONFIRMED");

  return (
    <AppShell>
      <div className="mx-auto max-w-md px-4 py-5">
        {/* 헤더 */}
        <div className="mb-5">
          <h1 className="text-xl font-black text-gray-900">메뉴</h1>
        </div>

        {/* 유저 카드 */}
        <div className="mb-5 rounded-2xl bg-gradient-to-br from-blue-600 to-blue-700 p-5 text-white shadow-lg shadow-blue-200">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/20 text-2xl flex-shrink-0">
              {user.gender === "MALE" ? "👨" : user.gender === "FEMALE" ? "👩" : "👤"}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-base font-bold truncate">
                {user.nickname ?? user.email.split("@")[0]}
              </p>
              <p className="text-xs text-blue-200 truncate">
                {user.university ?? "학교 미설정"} · {user.major ?? "전공 미설정"}
              </p>
            </div>
            {user.verification_status === "VERIFIED" && (
              <span className="flex-shrink-0 rounded-full bg-white/20 px-2.5 py-0.5 text-xs font-semibold">
                ✓ 인증
              </span>
            )}
          </div>
          <div className="mt-4 flex items-center justify-between rounded-xl bg-white/10 px-4 py-3">
            <span className="text-sm text-blue-100">현재 잔액</span>
            <span className="text-lg font-black">💰 {balanceLabel}</span>
          </div>
        </div>

        {/* 내 미팅 요약 */}
        <section className="mb-5">
          <div className="mb-2.5 flex items-center justify-between px-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">참여한 미팅</p>
            <Link href="/my-meetings" className="text-xs text-blue-600 font-medium">전체 보기 →</Link>
          </div>
          {dataLoading ? (
            <div className="rounded-2xl bg-white border border-gray-100 p-4 text-center text-sm text-gray-400">
              불러오는 중...
            </div>
          ) : activeMeetings.length === 0 ? (
            <div className="rounded-2xl bg-white border border-gray-100 p-4 text-center text-sm text-gray-400">
              참여 중인 미팅이 없습니다
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {activeMeetings.slice(0, 3).map((m) => {
                const st = STATUS_LABELS[m.status] ?? { label: m.status, color: "text-gray-500" };
                return (
                  <Link
                    key={m.meeting_id}
                    href={`/meetings/${m.meeting_id}`}
                    className="flex items-center gap-3 rounded-2xl bg-white border border-gray-100 px-4 py-3 shadow-sm hover:shadow-md transition-all active:scale-[0.98]"
                  >
                    <span className="text-xl">🤝</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800 truncate">
                        미팅 #{m.meeting_id}
                        {m.is_host && <span className="ml-1.5 text-xs text-blue-600 font-normal">[호스트]</span>}
                      </p>
                      <p className="text-xs text-gray-400">
                        {m.meeting_type === "TWO_BY_TWO" ? "2:2" : "3:3"} ·{" "}
                        {m.filled.total}/{m.filled.capacity}명
                      </p>
                    </div>
                    <span className={`text-xs font-semibold ${st.color}`}>{st.label}</span>
                  </Link>
                );
              })}
              {activeMeetings.length > 3 && (
                <Link href="/my-meetings" className="text-center text-xs text-blue-600 py-1">
                  +{activeMeetings.length - 3}개 더 보기
                </Link>
              )}
            </div>
          )}
        </section>

        {/* 내 채팅방 */}
        <section className="mb-5">
          <div className="mb-2.5 flex items-center justify-between px-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">내 채팅방</p>
            <Link href="/my-chats" className="text-xs text-blue-600 font-medium">전체 보기 →</Link>
          </div>
          <div className="flex flex-col gap-2">
            <MenuItem
              icon="💬"
              label="내 채팅방 목록"
              description={chatRooms.length > 0 ? `${chatRooms.length}개의 채팅방` : "아직 채팅방이 없습니다"}
              href="/my-chats"
              badge={chatRooms.length > 0 ? String(chatRooms.length) : undefined}
            />
          </div>
        </section>

        {/* 미팅 일정 */}
        <section className="mb-5">
          <p className="mb-2.5 px-1 text-xs font-semibold uppercase tracking-wide text-gray-400">
            미팅 일정
          </p>
          <div className="flex flex-col gap-2">
            <MenuItem
              icon="📅"
              label="내 미팅 일정"
              description={confirmedMeetings.length > 0 ? `${confirmedMeetings.length}개의 확정 미팅` : "확정된 미팅이 없습니다"}
              href="/meeting-schedule"
              badge={confirmedMeetings.length > 0 ? String(confirmedMeetings.length) : undefined}
              badgeColor="green"
            />
          </div>
        </section>

        {/* 친구 */}
        <section className="mb-5">
          <p className="mb-2.5 px-1 text-xs font-semibold uppercase tracking-wide text-gray-400">
            친구
          </p>
          <div className="flex flex-col gap-2">
            <MenuItem
              icon="👫"
              label="친구 목록"
              description="전화번호로 친구를 추가하세요"
              href="/friends"
            />
          </div>
        </section>

        {/* 계정 */}
        <section className="mb-5">
          <p className="mb-2.5 px-1 text-xs font-semibold uppercase tracking-wide text-gray-400">
            계정
          </p>
          <div className="flex flex-col gap-2">
            <MenuItem
              icon="👤"
              label="내 프로필"
              description="프로필 정보 수정 및 학교 인증"
              href="/me/profile"
            />
          </div>
        </section>

        {/* 지갑 */}
        <section className="mb-5">
          <p className="mb-2.5 px-1 text-xs font-semibold uppercase tracking-wide text-gray-400">
            지갑
          </p>
          <div className="flex flex-col gap-2">
            <MenuItem
              icon="💳"
              label="잔액 충전하기"
              description="토스 결제로 잔액을 충전합니다"
              href="/menu/wallet/charge"
              badge={balanceLabel}
            />
            <MenuItem
              icon="🏦"
              label="잔액 인출하기"
              description="잔액을 계좌로 반환합니다"
              href="/menu/wallet/withdraw"
            />
          </div>
        </section>

        {/* 기타 */}
        <section className="mb-5">
          <p className="mb-2.5 px-1 text-xs font-semibold uppercase tracking-wide text-gray-400">
            기타
          </p>
          <div className="flex flex-col gap-2">
            {user.is_admin && (
              <MenuItem
                icon="🛡️"
                label="관리자 페이지"
                description="인증 서류 심사 및 관리"
                href="/admin"
              />
            )}
            <MenuItem
              icon="🚪"
              label="로그아웃"
              description="현재 계정에서 로그아웃합니다"
              onClick={logout}
              variant="danger"
            />
          </div>
        </section>

        <p className="mt-4 text-center text-xs text-gray-300">MEETIN v1.0.0</p>
      </div>
    </AppShell>
  );
}
