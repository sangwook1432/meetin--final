"use client";

/**
 * /vacancies — 내 팀에 빈자리가 있는 미팅 목록
 *
 * 기능:
 *  1. 내 팀(같은 성별)에 빈자리가 있는 미팅 표시
 *  2. 빈자리 N석 배지 강조
 *  3. 미팅 카드 클릭 → /meetings/[id]로 이동
 *  4. 30초마다 자동 갱신
 */

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { vacanciesMeetings } from "@/lib/api";
import { AppShell } from "@/components/ui/AppShell";
import { MeetingCard } from "@/components/meeting/MeetingCard";
import type { MeetingListItem } from "@/types";

export default function VacanciesPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [meetings, setMeetings] = useState<MeetingListItem[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [visitedIds, setVisitedIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (!user) return;
    try {
      const raw = localStorage.getItem(`visited_meetings_${user.id}`);
      setVisitedIds(new Set(raw ? JSON.parse(raw) : []));
    } catch { /* ignore */ }
  }, [user?.id]);

  const markVisited = (id: number) => {
    if (!user) return;
    setVisitedIds((prev) => {
      const next = new Set(prev).add(id);
      localStorage.setItem(`visited_meetings_${user.id}`, JSON.stringify([...next]));
      return next;
    });
  };

  const fetchMeetings = useCallback(async () => {
    try {
      const res = await vacanciesMeetings();
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

  return (
    <AppShell>
      <div className="mx-auto max-w-md px-4 py-5">
        {/* 헤더 */}
        <div className="mb-5">
          <h1 className="text-xl font-black text-gray-900">빈자리 미팅</h1>
          <p className="mt-0.5 text-xs text-gray-400">
            내 팀({user?.gender === "MALE" ? "남성" : "여성"})에 아직 자리가 있는 미팅입니다
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
            <span className="text-5xl">👥</span>
            <p className="text-base font-semibold text-gray-600">빈자리 미팅이 없어요</p>
            <p className="text-sm text-gray-400">
              현재 내 팀에 빈자리가 있는 미팅이 없습니다
            </p>
            <button
              onClick={() => router.push("/discover")}
              className="mt-2 rounded-xl border border-blue-200 px-5 py-2.5 text-sm font-medium text-blue-600 hover:bg-blue-50 active:bg-blue-100"
            >
              미팅 탐색하기 →
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {meetings.map((m) => (
              <MeetingCard
                key={m.meeting_id}
                meeting={m}
                onClick={() => {
                  markVisited(m.meeting_id);
                  router.push(`/meetings/${m.meeting_id}`);
                }}
                variant="vacancy"
                visited={visitedIds.has(m.meeting_id)}
              />
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
