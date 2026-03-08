"use client";

/**
 * /notifications — 알림 페이지
 */

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import {
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} from "@/lib/api";
import type { NotificationItem } from "@/types";

const NOTI_ICONS: Record<string, string> = {
  FRIEND_REQUEST:    "👋",
  FRIEND_ACCEPTED:   "🤝",
  MEETING_INVITE:    "📨",
  MEETING_CONFIRMED: "✅",
  SLOT_VACANCY:      "🔔",
  DEPOSIT_REFUNDED:  "💰",
  SYSTEM:            "ℹ️",
};

export default function NotificationsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [notis, setNotis] = useState<NotificationItem[]>([]);
  const [fetching, setFetching] = useState(true);
  const [markingAll, setMarkingAll] = useState(false);

  const fetchNotis = useCallback(async () => {
    try {
      const res = await getNotifications();
      setNotis(res.notifications);
    } catch {
      // ignore
    } finally {
      setFetching(false);
    }
  }, []);

  useEffect(() => {
    if (user) fetchNotis();
  }, [user, fetchNotis]);

  const handleRead = async (id: number) => {
    await markNotificationRead(id).catch(() => {});
    setNotis((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
  };

  const handleReadAll = async () => {
    setMarkingAll(true);
    try {
      await markAllNotificationsRead();
      setNotis((prev) => prev.map((n) => ({ ...n, is_read: true })));
    } finally {
      setMarkingAll(false);
    }
  };

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

  const unread = notis.filter((n) => !n.is_read).length;

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      {/* 헤더 */}
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-gray-100 bg-white px-5 py-4 shadow-sm">
        <button onClick={() => router.back()} className="text-gray-400 hover:text-gray-600 text-lg">
          ‹
        </button>
        <h1 className="flex-1 text-base font-bold text-gray-900">
          알림 {unread > 0 && <span className="ml-1 text-sm font-normal text-red-500">({unread})</span>}
        </h1>
        {unread > 0 && (
          <button
            onClick={handleReadAll}
            disabled={markingAll}
            className="text-xs text-blue-600 font-semibold hover:text-blue-700"
          >
            {markingAll ? "처리 중..." : "모두 읽음"}
          </button>
        )}
      </header>

      <div className="mx-auto w-full max-w-md px-4 py-4">
        {fetching ? (
          <div className="py-16 text-center text-sm text-gray-400">불러오는 중...</div>
        ) : notis.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-4xl mb-3">🔔</p>
            <p className="text-sm text-gray-400">알림이 없습니다</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {notis.map((n) => (
              <NotificationCard
                key={n.id}
                noti={n}
                onRead={() => handleRead(n.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface NotificationCardProps {
  noti: NotificationItem;
  onRead: () => void;
}

function NotificationCard({ noti, onRead }: NotificationCardProps) {
  const icon = NOTI_ICONS[noti.noti_type] ?? "🔔";
  const time = new Date(noti.created_at).toLocaleDateString("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const handleClick = () => {
    if (!noti.is_read) onRead();
  };

  // 링크 목적지 결정
  let href: string | undefined;
  if (noti.related_meeting_id) href = `/meetings/${noti.related_meeting_id}`;
  else if (noti.related_friend_id || noti.noti_type === "FRIEND_REQUEST") href = "/friends";

  const cardClass = `flex gap-3 rounded-2xl border p-4 shadow-sm transition-all active:scale-[0.98] cursor-pointer ${
    noti.is_read ? "bg-white border-gray-100" : "bg-blue-50 border-blue-100"
  }`;

  const inner = (
    <>
      <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl text-xl ${
        noti.is_read ? "bg-gray-100" : "bg-blue-100"
      }`}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className={`text-sm font-semibold truncate ${noti.is_read ? "text-gray-700" : "text-gray-900"}`}>
            {noti.title}
          </p>
          {!noti.is_read && (
            <span className="flex-shrink-0 h-2 w-2 rounded-full bg-blue-500 mt-1.5" />
          )}
        </div>
        <p className="mt-0.5 text-xs text-gray-500 line-clamp-2">{noti.body}</p>
        <p className="mt-1 text-xs text-gray-400">{time}</p>
      </div>
    </>
  );

  if (href) {
    return (
      <Link href={href} className={cardClass} onClick={handleClick}>
        {inner}
      </Link>
    );
  }

  return (
    <div className={cardClass} onClick={handleClick}>
      {inner}
    </div>
  );
}
