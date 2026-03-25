"use client";
import ErrorBanner from "@/components/ui/ErrorBanner";

/**
 * /me/meetings — 내가 참여한 미팅 목록
 *
 * - RECRUITING / WAITING_CONFIRM / CONFIRMED 상태 배지 표시
 * - 내가 호스트인 경우 표시
 * - 클릭 → /meetings/[id]
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getMyMeetings, type MyMeetingItem } from "@/lib/api";
import { AppShell } from "@/components/ui/AppShell";

const MEETING_TYPE_LABELS: Record<string, string> = {
  TWO_BY_TWO: "2:2 미팅",
  THREE_BY_THREE: "3:3 미팅",
};

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  RECRUITING: {
    label: "모집중",
    className: "bg-blue-100 text-blue-700",
  },
  FULL: {
    label: "정원 완료",
    className: "bg-yellow-100 text-yellow-700",
  },
  WAITING_CONFIRM: {
    label: "확정 대기",
    className: "bg-orange-100 text-orange-700",
  },
  CONFIRMED: {
    label: "확정됨",
    className: "bg-emerald-100 text-emerald-700",
  },
  CANCELLED: {
    label: "취소됨",
    className: "bg-gray-100 text-gray-500",
  },
};

export default function MyMeetingsPage() {
  const router = useRouter();
  const [meetings, setMeetings] = useState<MyMeetingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getMyMeetings()
      .then((res) => setMeetings(res.meetings))
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
        <h2 className="mb-5 text-lg font-bold text-gray-900">🤝 내 미팅</h2>

        {error && (
          <div className="mb-4">
            <ErrorBanner message={error} />
          </div>
        )}

        {meetings.length === 0 ? (
          <div className="rounded-2xl bg-white border border-gray-100 p-10 text-center shadow-sm">
            <div className="text-4xl mb-3">🤝</div>
            <p className="text-sm font-semibold text-gray-700">참여한 미팅이 없습니다</p>
            <p className="mt-1.5 text-xs text-gray-400">
              미팅에 참여하거나 직접 만들어보세요
            </p>
            <button
              onClick={() => router.push("/discover")}
              className="mt-5 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-blue-700 transition-all"
            >
              미팅 찾아보기 →
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {meetings.map((meeting) => {
              const statusCfg = STATUS_CONFIG[meeting.status] ?? {
                label: meeting.status,
                className: "bg-gray-100 text-gray-500",
              };
              return (
                <button
                  key={meeting.meeting_id}
                  onClick={() => router.push(`/meetings/${meeting.meeting_id}`)}
                  className="w-full rounded-2xl bg-white border border-gray-100 p-4 text-left shadow-sm hover:border-blue-200 hover:shadow-md transition-all active:scale-[0.99]"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex flex-col gap-1.5">
                      <p className="font-semibold text-gray-900 text-sm">
                        {meeting.title ?? `미팅 #${meeting.meeting_id}`}
                      </p>
                      <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-bold text-blue-700 w-fit">
                        {MEETING_TYPE_LABELS[meeting.meeting_type] ?? meeting.meeting_type}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold w-fit ${statusCfg.className}`}>
                          {statusCfg.label}
                        </span>
                        {meeting.is_host && (
                          <span className="rounded-full bg-purple-100 px-2.5 py-0.5 text-xs font-bold text-purple-700">
                            👑 호스트
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="text-gray-300 text-lg mt-1">›</span>
                  </div>

                  {meeting.chat_room_id && (
                    <div className="mt-3 flex items-center gap-1.5">
                      <span className="text-xs text-emerald-600">💬 채팅방 참여 중</span>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}
