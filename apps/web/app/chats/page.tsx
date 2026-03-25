"use client";
import ErrorBanner from "@/components/ui/ErrorBanner";

/**
 * /chats — 채팅방 목록
 *
 * - 내가 속한 채팅방 목록 표시
 * - 각 방의 미팅 타입, 일정 정보 표시
 * - 클릭 → /chats/[roomId]
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { listChats, getChatRoomInfo } from "@/lib/api";
import type { ChatRoomInfo } from "@/lib/api";
import { AppShell } from "@/components/ui/AppShell";

const MEETING_TYPE_LABELS: Record<string, string> = {
  TWO_BY_TWO: "2:2 미팅",
  THREE_BY_THREE: "3:3 미팅",
};

export default function ChatsPage() {
  const router = useRouter();
  const [rooms, setRooms] = useState<ChatRoomInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { rooms: roomList } = await listChats();
        const infos = await Promise.all(
          roomList.map((r) => getChatRoomInfo(r.room_id))
        );
        setRooms(infos);
      } catch (e) {
        setError(e instanceof Error ? e.message : "로드 실패");
      } finally {
        setLoading(false);
      }
    })();
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
        <h2 className="mb-5 text-lg font-bold text-gray-900">💬 채팅</h2>

        {error && (
          <div className="mb-4">
            <ErrorBanner message={error} />
          </div>
        )}

        {rooms.length === 0 ? (
          <div className="rounded-2xl bg-white border border-gray-100 p-10 text-center shadow-sm">
            <div className="text-4xl mb-3">💬</div>
            <p className="text-sm font-semibold text-gray-700">참여 중인 채팅방이 없습니다</p>
            <p className="mt-1.5 text-xs text-gray-400">
              미팅이 확정되면 채팅방이 생성됩니다
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
            {rooms.map((room) => (
              <button
                key={room.room_id}
                onClick={() => router.push(`/chats/${room.room_id}`)}
                className="w-full rounded-2xl bg-white border border-gray-100 p-4 text-left shadow-sm hover:border-blue-200 hover:shadow-md transition-all active:scale-[0.99]"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-semibold text-gray-900 text-sm">
                      {room.meeting_title ?? `미팅 #${room.meeting_id}`}
                    </p>
                    <span className="mt-1 inline-block rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-bold text-blue-700">
                      {MEETING_TYPE_LABELS[room.meeting_type] ?? room.meeting_type}
                    </span>
                  </div>
                  <span className="text-gray-300 text-lg">›</span>
                </div>

                {room.schedule ? (
                  <div className="mt-3 space-y-1">
                    {room.schedule.date && (
                      <p className="text-xs text-gray-600">
                        📅 {room.schedule.date}
                        {room.schedule.time && ` · ${room.schedule.time}`}
                      </p>
                    )}
                    {room.schedule.place && (
                      <p className="text-xs text-gray-600">📍 {room.schedule.place}</p>
                    )}
                    {room.schedule.confirmed && (
                      <span className="inline-block rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                        ✓ 일정 확정
                      </span>
                    )}
                  </div>
                ) : (
                  <p className="mt-3 text-xs text-yellow-600">⏳ 일정 미정</p>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
