"use client";

/**
 * /my-meetings — 내가 참여한 미팅 현황
 *
 * 기능:
 *  1. 내가 슬롯에 들어있는 모든 미팅 목록 표시
 *  2. 미팅 상태(모집중/확정대기/확정완료) 색상 구분
 *  3. 내 확정 여부 표시
 *  4. 카드 클릭 → /meetings/[id] 이동
 *  5. 30초 자동 갱신
 */

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { getMyMeetings } from "@/lib/api";
import { AppShell } from "@/components/ui/AppShell";
import type { MyMeetingItem, MeetingStatus } from "@/types";

// ─── 상태별 스타일 ────────────────────────────────────────

function StatusBadge({ status }: { status: MeetingStatus }) {
  const map: Record<MeetingStatus, { label: string; cls: string }> = {
    RECRUITING:      { label: "모집 중",    cls: "bg-blue-100 text-blue-700" },
    FULL:            { label: "자리 찼음",  cls: "bg-orange-100 text-orange-700" },
    WAITING_CONFIRM: { label: "확정 대기",  cls: "bg-yellow-100 text-yellow-700" },
    CONFIRMED:       { label: "확정 완료",  cls: "bg-emerald-100 text-emerald-700" },
    CANCELLED:       { label: "취소됨",     cls: "bg-gray-100 text-gray-500" },
  };
  const { label, cls } = map[status] ?? { label: status, cls: "bg-gray-100 text-gray-500" };
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${cls}`}>
      {label}
    </span>
  );
}

// ─── 미팅 카드 ────────────────────────────────────────────

function MyMeetingCard({
  meeting,
  onClick,
}: {
  meeting: MyMeetingItem;
  onClick: () => void;
}) {
  const cap = meeting.filled.capacity / 2; // 팀당 정원 (2 or 3)
  const pct = Math.round((meeting.filled.total / meeting.filled.capacity) * 100);

  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded-2xl border border-gray-100 bg-white p-4 shadow-sm hover:shadow-md active:scale-[0.98] transition-all"
    >
      {/* 상단: 타입 + 상태 + 호스트 여부 */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-black text-gray-900">
            {cap === 2 ? "2 : 2" : "3 : 3"}
          </span>
          {meeting.is_host && (
            <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs font-semibold text-purple-700">
              👑 호스트
            </span>
          )}
        </div>
        <StatusBadge status={meeting.status} />
      </div>

      {/* 중단: 진행 바 */}
      <div className="mb-3">
        <div className="flex justify-between text-xs text-gray-400 mb-1">
          <span>
            남 {meeting.filled.male}/{cap} · 여 {meeting.filled.female}/{cap}
          </span>
          <span>{pct}% 채움</span>
        </div>
        <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
          <div
            className="h-full rounded-full bg-blue-500 transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* 하단: 확정 여부 + 학교 선호 */}
      <div className="flex items-center justify-between text-xs text-gray-400">
        <span>
          {meeting.status === "WAITING_CONFIRM" || meeting.status === "CONFIRMED"
            ? meeting.my_confirmed
              ? "✅ 내 확정 완료"
              : "⏳ 내 확정 대기"
            : null}
        </span>
        <span>
          {meeting.preferred_universities_any
            ? "🌍 아무 학교"
            : `🏫 ${meeting.preferred_universities_raw}`}
        </span>
      </div>

      {/* 미팅 ID */}
      <p className="mt-2 text-right text-[10px] text-gray-300">
        #미팅 {meeting.meeting_id}
      </p>
    </button>
  );
}

// ─── 페이지 ───────────────────────────────────────────────

export default function MyMeetingsPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [meetings, setMeetings] = useState<MyMeetingItem[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const fetchMeetings = useCallback(async () => {
    try {
      const res = await getMyMeetings();
      setMeetings(res.meetings);
      setListError(null);
    } catch (e) {
      setListError(e instanceof Error ? e.message : "목록 로드 실패");
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    fetchMeetings();
    const id = setInterval(fetchMeetings, 30_000);
    return () => clearInterval(id);
  }, [authLoading, user, fetchMeetings, router]);

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-gray-400">
        로딩 중...
      </div>
    );
  }

  // 상태별 그룹핑
  const active   = meetings.filter(m => m.status !== "CONFIRMED" && m.status !== "CANCELLED");
  const confirmed = meetings.filter(m => m.status === "CONFIRMED");
  const cancelled = meetings.filter(m => m.status === "CANCELLED");

  return (
    <AppShell>
      <div className="mx-auto max-w-md px-4 py-5">
        {/* 헤더 */}
        <div className="mb-5">
          <h1 className="text-xl font-black text-gray-900">참여한 미팅</h1>
          <p className="mt-0.5 text-xs text-gray-400">
            내가 참여 중인 모든 미팅 현황입니다
          </p>
        </div>

        {/* 목록 */}
        {listLoading ? (
          <div className="flex flex-col gap-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-32 animate-pulse rounded-2xl bg-gray-100" />
            ))}
          </div>
        ) : listError ? (
          <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-6 text-center">
            <p className="text-sm text-red-600">{listError}</p>
            <button
              onClick={fetchMeetings}
              className="mt-3 text-sm text-blue-600 underline"
            >
              다시 시도
            </button>
          </div>
        ) : meetings.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <span className="text-5xl">📋</span>
            <p className="text-base font-semibold text-gray-600">참여한 미팅이 없어요</p>
            <p className="text-sm text-gray-400">미팅에 참여하거나 직접 만들어보세요!</p>
            <button
              onClick={() => router.push("/discover")}
              className="mt-2 rounded-xl bg-blue-600 px-6 py-2.5 text-sm font-bold text-white hover:bg-blue-700"
            >
              미팅 탐색하기 →
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {/* 진행 중 */}
            {active.length > 0 && (
              <section>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
                  진행 중 · {active.length}개
                </p>
                <div className="flex flex-col gap-3">
                  {active.map(m => (
                    <MyMeetingCard
                      key={m.meeting_id}
                      meeting={m}
                      onClick={() => router.push(`/meetings/${m.meeting_id}`)}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* 확정 완료 */}
            {confirmed.length > 0 && (
              <section>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-emerald-500">
                  확정 완료 · {confirmed.length}개
                </p>
                <div className="flex flex-col gap-3">
                  {confirmed.map(m => (
                    <MyMeetingCard
                      key={m.meeting_id}
                      meeting={m}
                      onClick={() => router.push(`/meetings/${m.meeting_id}`)}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* 취소됨 */}
            {cancelled.length > 0 && (
              <section>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-300">
                  취소됨 · {cancelled.length}개
                </p>
                <div className="flex flex-col gap-3 opacity-50">
                  {cancelled.map(m => (
                    <MyMeetingCard
                      key={m.meeting_id}
                      meeting={m}
                      onClick={() => router.push(`/meetings/${m.meeting_id}`)}
                    />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}
