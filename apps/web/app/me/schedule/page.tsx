"use client";
import ErrorBanner from "@/components/ui/ErrorBanner";

/**
 * /me/schedule — 내 미팅 일정
 *
 * - 내가 참가한 CONFIRMED 미팅들의 일정 목록
 * - 일정 있는 것 / 없는 것 구분 표시
 * - 채팅방 바로 가기 버튼
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getMySchedules } from "@/lib/api";
import { AppShell } from "@/components/ui/AppShell";

interface ScheduleItem {
  meeting_id: number;
  meeting_type: string;
  title: string | null;
  chat_room_id: number | null;
  schedule: {
    date: string | null;
    time: string | null;
    place: string | null;
    confirmed: boolean;
  };
}

const MEETING_TYPE_LABELS: Record<string, string> = {
  TWO_BY_TWO: "2:2 미팅",
  THREE_BY_THREE: "3:3 미팅",
};

export default function SchedulePage() {
  const router = useRouter();
  const [schedules, setSchedules] = useState<ScheduleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getMySchedules()
      .then((res) => setSchedules(res.schedules))
      .catch((e) => setError(e instanceof Error ? e.message : "로드 실패"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <AppShell>
        <div className="flex min-h-[60vh] items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-200 border-t-blue-600" />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-md px-4 py-6">
        <h2 className="mb-5 text-lg font-bold text-gray-900">📅 내 미팅 일정</h2>

        {error && (
          <div className="mb-4">
            <ErrorBanner message={error} />
          </div>
        )}

        {schedules.length === 0 ? (
          <div className="rounded-2xl bg-white border border-gray-100 p-10 text-center shadow-sm">
            <div className="text-4xl mb-3">📅</div>
            <p className="text-sm font-semibold text-gray-700">확정된 미팅이 없습니다</p>
            <p className="mt-1.5 text-xs text-gray-400">
              미팅이 확정되면 여기에 일정이 표시됩니다
            </p>
            <button
              onClick={() => router.push("/discover")}
              className="mt-5 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-blue-700 transition-all"
            >
              미팅 찾아보기 →
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {schedules.map((item) => (
              <div
                key={item.meeting_id}
                className="rounded-2xl bg-white border border-gray-100 p-5 shadow-sm"
              >
                {/* 헤더 */}
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-gray-900 text-sm">
                      {item.title ?? `미팅 #${item.meeting_id}`}
                    </p>
                    <span className="mt-1 inline-block rounded-full bg-blue-100 px-3 py-1 text-xs font-bold text-blue-700">
                      {MEETING_TYPE_LABELS[item.meeting_type] ?? item.meeting_type}
                    </span>
                  </div>
                  {item.schedule.confirmed && (
                    <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-700">
                      ✓ 일정 확정
                    </span>
                  )}
                </div>

                {/* 일정 정보 */}
                {item.schedule.date ? (
                  <div className="space-y-2.5">
                    <div className="flex items-center gap-3">
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-50 text-base">📅</span>
                      <div>
                        <p className="text-xs text-gray-400">날짜</p>
                        <p className="text-sm font-semibold text-gray-800">{item.schedule.date}</p>
                      </div>
                    </div>

                    {item.schedule.time && (
                      <div className="flex items-center gap-3">
                        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-50 text-base">🕐</span>
                        <div>
                          <p className="text-xs text-gray-400">시간</p>
                          <p className="text-sm font-semibold text-gray-800">{item.schedule.time}</p>
                        </div>
                      </div>
                    )}

                    {item.schedule.place && (
                      <div className="flex items-center gap-3">
                        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-50 text-base">📍</span>
                        <div>
                          <p className="text-xs text-gray-400">장소</p>
                          <p className="text-sm font-semibold text-gray-800">{item.schedule.place}</p>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="rounded-xl bg-yellow-50 border border-yellow-100 px-4 py-3 text-center">
                    <p className="text-sm text-yellow-700">⏳ 일정 미정</p>
                    <p className="mt-0.5 text-xs text-yellow-500">호스트가 채팅방에서 일정을 설정할 예정입니다</p>
                  </div>
                )}

                {/* 채팅방 버튼 */}
                {item.chat_room_id && (
                  <button
                    onClick={() => router.push(`/chats/${item.chat_room_id}`)}
                    className="mt-4 w-full rounded-xl bg-blue-600 py-3 text-sm font-bold text-white hover:bg-blue-700 active:scale-95 transition-all"
                  >
                    💬 채팅방 입장
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
