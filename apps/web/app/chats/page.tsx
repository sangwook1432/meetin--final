"use client";

/**
 * /chats — V1 채팅방 목록
 *
 * - 내가 속한 채팅방 목록
 * - 미팅 타입, 일정 정보 표시 (일정 확정 뱃지)
 * - 클릭 → /chats/[roomId]
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { listChats, getChatRoomInfo } from "@/lib/api";
import type { ChatRoomInfo } from "@/lib/api";
import { AppShell } from "@/components/ui/AppShell";
import ErrorBanner from "@/components/ui/ErrorBanner";

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
        const infos = await Promise.all(roomList.map((r) => getChatRoomInfo(r.room_id)));
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
          <div
            className="h-8 w-8 animate-spin rounded-full"
            style={{
              border: "3px solid var(--accent-soft)",
              borderTopColor: "var(--accent)",
            }}
          />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-md px-5 pt-5 pb-6">
        <h2
          className="mb-5 font-extrabold"
          style={{ fontSize: 22, color: "var(--ink)", letterSpacing: "-0.03em" }}
        >
          채팅
        </h2>

        {error && (
          <div className="mb-4">
            <ErrorBanner message={error} />
          </div>
        )}

        {rooms.length === 0 ? (
          <div
            className="px-6 py-12 text-center"
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-lg)",
              boxShadow: "var(--shadow-sm)",
            }}
          >
            <div className="text-5xl mb-3">💬</div>
            <p className="text-sm font-bold" style={{ color: "var(--ink)" }}>
              참여 중인 채팅방이 없습니다
            </p>
            <p className="mt-1.5 text-xs" style={{ color: "var(--ink-soft)" }}>
              미팅이 확정되면 채팅방이 생성됩니다
            </p>
            <button
              onClick={() => router.push("/discover")}
              className="mt-5 px-5 py-2.5 text-sm font-bold text-white transition-all active:scale-95"
              style={{
                background: "var(--accent)",
                borderRadius: "var(--radius-md)",
              }}
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
                className="w-full text-left transition-all active:scale-[0.99] px-4 py-4"
                style={{
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-lg)",
                  boxShadow: "var(--shadow-sm)",
                }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div
                      className="mb-1"
                      style={{
                        fontSize: 11,
                        color: "var(--ink-soft)",
                        letterSpacing: "-0.01em",
                      }}
                    >
                      {MEETING_TYPE_LABELS[room.meeting_type] ?? room.meeting_type}
                    </div>
                    <p
                      className="font-bold truncate"
                      style={{
                        fontSize: 15,
                        color: "var(--ink)",
                        letterSpacing: "-0.02em",
                        lineHeight: 1.3,
                      }}
                    >
                      {room.meeting_title ?? `미팅 #${room.meeting_id}`}
                    </p>
                  </div>
                  <span style={{ color: "var(--ink-soft)", fontSize: 18 }}>›</span>
                </div>

                {room.schedule ? (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {room.schedule.date && (
                      <span
                        className="inline-flex items-center gap-1 px-2.5 py-1"
                        style={{
                          fontSize: 11,
                          background: "var(--surface-muted)",
                          color: "var(--ink-mid)",
                          borderRadius: 999,
                          letterSpacing: "-0.01em",
                        }}
                      >
                        📅 {room.schedule.date}
                        {room.schedule.time && ` · ${room.schedule.time}`}
                      </span>
                    )}
                    {room.schedule.place && (
                      <span
                        className="inline-flex items-center gap-1 px-2.5 py-1"
                        style={{
                          fontSize: 11,
                          background: "var(--surface-muted)",
                          color: "var(--ink-mid)",
                          borderRadius: 999,
                          letterSpacing: "-0.01em",
                        }}
                      >
                        📍 {room.schedule.place}
                      </span>
                    )}
                    {room.schedule.confirmed && (
                      <span
                        className="inline-flex items-center gap-1 px-2.5 py-1 font-bold"
                        style={{
                          fontSize: 11,
                          background: "var(--success-soft)",
                          color: "var(--success)",
                          borderRadius: 999,
                          letterSpacing: "-0.01em",
                        }}
                      >
                        ✓ 일정 확정
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="mt-3">
                    <span
                      className="inline-flex items-center gap-1 px-2.5 py-1 font-bold"
                      style={{
                        fontSize: 11,
                        background: "var(--warning-soft)",
                        color: "oklch(0.45 0.14 70)",
                        borderRadius: 999,
                        letterSpacing: "-0.01em",
                      }}
                    >
                      ⏳ 일정 미정
                    </span>
                  </div>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
