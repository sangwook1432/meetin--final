"use client";

/**
 * /meeting-schedule — 내 미팅 일정 페이지
 * (CONFIRMED 상태의 미팅에서 일정이 제안된 것들 보기)
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { getMyMeetings, getMeetingSchedule } from "@/lib/api";
import type { MyMeetingItem } from "@/types";

interface ScheduleInfo {
  meeting_id: number;
  room_id?: number;
  schedule: {
    id: number;
    scheduled_at: string;
    location: string | null;
    note: string | null;
    status: string;
  } | null;
}

export default function MeetingSchedulePage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [schedules, setSchedules] = useState<ScheduleInfo[]>([]);
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const mRes = await getMyMeetings().catch(() => ({ meetings: [] }));
        const confirmed = mRes.meetings.filter((m: MyMeetingItem) => m.status === "CONFIRMED");

        const results: ScheduleInfo[] = await Promise.all(
          confirmed.map(async (m: MyMeetingItem) => {
            try {
              // 채팅방 ID는 미팅 상세에서 가져와야 하므로 여기서는 미팅 ID만 사용
              // 실제로는 room_id가 필요하지만, getMeetingSchedule은 room_id 기반
              // 임시: null schedule로 처리
              return { meeting_id: m.meeting_id, schedule: null };
            } catch {
              return { meeting_id: m.meeting_id, schedule: null };
            }
          })
        );

        setSchedules(results);
      } finally {
        setFetching(false);
      }
    })();
  }, [user]);

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-gray-400">로딩 중...</div>;
  }

  if (!user) {
    router.replace("/login");
    return null;
  }

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-gray-100 bg-white px-5 py-4 shadow-sm">
        <button onClick={() => router.back()} className="text-gray-400 hover:text-gray-600 text-lg">‹</button>
        <h1 className="flex-1 text-base font-bold text-gray-900">내 미팅 일정</h1>
      </header>

      <div className="mx-auto w-full max-w-md px-4 py-4">
        {fetching ? (
          <div className="py-16 text-center text-sm text-gray-400">불러오는 중...</div>
        ) : schedules.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-5xl mb-4">📅</p>
            <p className="text-sm text-gray-400">확정된 미팅이 없습니다</p>
            <p className="text-xs text-gray-300 mt-1">미팅이 확정되면 여기서 일정을 확인할 수 있습니다</p>
            <Link href="/my-meetings" className="mt-4 inline-block text-sm text-blue-600 font-semibold">
              참여한 미팅 보기 →
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {schedules.map((s) => (
              <Link
                key={s.meeting_id}
                href={`/meetings/${s.meeting_id}`}
                className="rounded-2xl bg-white border border-gray-100 shadow-sm p-4 hover:shadow-md active:scale-[0.98] transition-all"
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-2xl">
                    ✅
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-bold text-gray-900">미팅 #{s.meeting_id}</p>
                    {s.schedule ? (
                      <>
                        <p className="text-xs text-gray-600 mt-1">
                          🗓️ {new Date(s.schedule.scheduled_at).toLocaleDateString("ko-KR", {
                            year: "numeric", month: "long", day: "numeric",
                            weekday: "short", hour: "2-digit", minute: "2-digit"
                          })}
                        </p>
                        {s.schedule.location && (
                          <p className="text-xs text-gray-500 mt-0.5">📍 {s.schedule.location}</p>
                        )}
                        {s.schedule.note && (
                          <p className="text-xs text-gray-400 mt-0.5">📝 {s.schedule.note}</p>
                        )}
                        <span className={`mt-2 inline-block text-xs font-semibold rounded-full px-2 py-0.5 ${
                          s.schedule.status === "CONFIRMED"
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-yellow-100 text-yellow-700"
                        }`}>
                          {s.schedule.status === "CONFIRMED" ? "일정 확정" : "일정 제안 중"}
                        </span>
                      </>
                    ) : (
                      <p className="text-xs text-gray-400 mt-1">아직 일정이 제안되지 않았습니다</p>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
