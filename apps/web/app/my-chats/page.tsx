"use client";

/**
 * /my-chats — 내 채팅방 목록
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { listChats } from "@/lib/api";

interface ChatRoom {
  room_id: number;
  meeting_id: number;
  meeting_type: string | null;
  meeting_status: string | null;
}

const STATUS_MAP: Record<string, { label: string; color: string; emoji: string }> = {
  RECRUITING:      { label: "모집 중",   color: "text-blue-600",    emoji: "🔍" },
  FULL:            { label: "자리 찼음", color: "text-orange-500",  emoji: "👥" },
  WAITING_CONFIRM: { label: "확정 대기", color: "text-yellow-600",  emoji: "⏳" },
  CONFIRMED:       { label: "확정됨",   color: "text-emerald-600", emoji: "✅" },
  CANCELLED:       { label: "취소됨",   color: "text-gray-400",    emoji: "❌" },
};

export default function MyChatsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    if (!user) return;
    listChats()
      .then((res) => setRooms(res.rooms as ChatRoom[]))
      .catch(() => {})
      .finally(() => setFetching(false));
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
      {/* 헤더 */}
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-gray-100 bg-white px-5 py-4 shadow-sm">
        <button onClick={() => router.back()} className="text-gray-400 hover:text-gray-600 text-lg">
          ‹
        </button>
        <h1 className="flex-1 text-base font-bold text-gray-900">내 채팅방</h1>
      </header>

      <div className="mx-auto w-full max-w-md px-4 py-4">
        {fetching ? (
          <div className="py-16 text-center text-sm text-gray-400">불러오는 중...</div>
        ) : rooms.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-5xl mb-4">💬</p>
            <p className="text-sm text-gray-400">아직 채팅방이 없습니다</p>
            <p className="text-xs text-gray-300 mt-1">미팅이 확정되면 채팅방이 생성됩니다</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {rooms.map((room) => {
              const st = STATUS_MAP[room.meeting_status ?? ""] ?? { label: room.meeting_status ?? "?", color: "text-gray-500", emoji: "💬" };
              return (
                <Link
                  key={room.room_id}
                  href={`/chats/${room.room_id}`}
                  className="flex items-center gap-4 rounded-2xl bg-white border border-gray-100 px-4 py-4 shadow-sm hover:shadow-md active:scale-[0.98] transition-all"
                >
                  <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-2xl">
                    {st.emoji}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-gray-900 truncate">
                      채팅방 #{room.room_id}
                    </p>
                    <p className="text-xs text-gray-400 truncate">
                      미팅 #{room.meeting_id} ·{" "}
                      {room.meeting_type === "TWO_BY_TWO" ? "2:2" : room.meeting_type === "THREE_BY_THREE" ? "3:3" : "-"}
                    </p>
                  </div>
                  <div className="flex flex-col items-end flex-shrink-0 gap-1">
                    <span className={`text-xs font-semibold ${st.color}`}>{st.label}</span>
                    <span className="text-gray-300 text-sm">›</span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
