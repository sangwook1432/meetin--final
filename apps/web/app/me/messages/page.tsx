"use client";

/**
 * /me/messages — 쪽지함 (수신된 애프터 신청 목록)
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getMyAfterRequests } from "@/lib/api";
import { AppShell } from "@/components/ui/AppShell";
import type { AfterRequestItem } from "@/types";

export default function MessagesPage() {
  const router = useRouter();
  const [items, setItems] = useState<AfterRequestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getMyAfterRequests()
      .then((res) => setItems(res.items))
      .catch((e) => setError(e instanceof Error ? e.message : "오류가 발생했습니다"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <AppShell>
      <div className="mx-auto max-w-md px-4 py-5">
        <div className="mb-5 flex items-center gap-2">
          <button
            onClick={() => router.back()}
            className="rounded-full p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            ←
          </button>
          <h1 className="text-xl font-black text-gray-900">쪽지함</h1>
        </div>

        {loading ? (
          <div className="flex flex-col gap-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-24 animate-pulse rounded-2xl bg-gray-100" />
            ))}
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-6 text-center">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <span className="text-5xl">💌</span>
            <p className="text-base font-semibold text-gray-600">아직 쪽지가 없어요</p>
            <p className="text-sm text-gray-400">애프터 신청을 받으면 여기서 확인할 수 있습니다</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {items.map((item) => (
              <div key={item.id} className="rounded-2xl border border-pink-100 bg-pink-50 p-4">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-bold text-pink-800">
                    💌 {item.sender_nickname || "익명"}님의 애프터 신청
                  </p>
                  <p className="text-xs text-gray-400">
                    {new Date(item.created_at).toLocaleDateString("ko-KR")}
                  </p>
                </div>
                <p className="text-sm text-gray-700 leading-relaxed">{item.message}</p>
                <div className="mt-3 flex items-center gap-2 rounded-xl border border-pink-200 bg-white px-3 py-2">
                  <span className="text-xs text-gray-400">전화번호</span>
                  <span className="text-sm font-semibold text-gray-900">{item.sender_phone}</span>
                </div>
                <p className="mt-1.5 text-right text-xs text-gray-400">
                  미팅 #{item.meeting_id}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
