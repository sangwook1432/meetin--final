"use client";

/**
 * /friends — 친구 목록 + 신청 페이지
 */

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import {
  getFriends,
  getFriendRequests,
  sendFriendRequest,
  acceptFriendRequest,
  rejectFriendRequest,
  deleteFriend,
} from "@/lib/api";
import type { FriendItem } from "@/types";

export default function FriendsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [friends, setFriends] = useState<FriendItem[]>([]);
  const [requests, setRequests] = useState<FriendItem[]>([]);
  const [tab, setTab] = useState<"friends" | "requests">("friends");
  const [fetching, setFetching] = useState(true);
  const [phone, setPhone] = useState("");
  const [requesting, setRequesting] = useState(false);
  const [reqError, setReqError] = useState<string | null>(null);
  const [reqSuccess, setReqSuccess] = useState(false);

  const fetchData = useCallback(async () => {
    setFetching(true);
    try {
      const [fRes, rRes] = await Promise.all([
        getFriends().catch(() => ({ friends: [] })),
        getFriendRequests().catch(() => ({ requests: [] })),
      ]);
      setFriends(fRes.friends);
      setRequests(rRes.requests);
    } finally {
      setFetching(false);
    }
  }, []);

  useEffect(() => {
    if (user) fetchData();
  }, [user, fetchData]);

  const handleSendRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setReqError(null);
    setReqSuccess(false);
    if (!phone.trim()) return;
    setRequesting(true);
    try {
      await sendFriendRequest(phone.trim());
      setReqSuccess(true);
      setPhone("");
    } catch (err) {
      setReqError(err instanceof Error ? err.message : "친구 신청 실패");
    } finally {
      setRequesting(false);
    }
  };

  const handleAccept = async (friendId: number) => {
    try {
      await acceptFriendRequest(friendId);
      await fetchData();
    } catch (err) {
      alert(err instanceof Error ? err.message : "수락 실패");
    }
  };

  const handleReject = async (friendId: number) => {
    try {
      await rejectFriendRequest(friendId);
      setRequests((prev) => prev.filter((r) => r.friend_id !== friendId));
    } catch (err) {
      alert(err instanceof Error ? err.message : "거절 실패");
    }
  };

  const handleDelete = async (friendId: number) => {
    if (!confirm("친구를 삭제하시겠습니까?")) return;
    try {
      await deleteFriend(friendId);
      setFriends((prev) => prev.filter((f) => f.friend_id !== friendId));
    } catch (err) {
      alert(err instanceof Error ? err.message : "삭제 실패");
    }
  };

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
        <h1 className="flex-1 text-base font-bold text-gray-900">친구</h1>
        {requests.length > 0 && (
          <button onClick={() => setTab("requests")} className="relative">
            <span className="text-xs text-gray-500">신청</span>
            <span className="ml-1.5 rounded-full bg-red-500 px-1.5 py-0.5 text-[9px] text-white font-bold">
              {requests.length}
            </span>
          </button>
        )}
      </header>

      <div className="mx-auto w-full max-w-md px-4 py-4">
        {/* 친구 신청 폼 */}
        <div className="mb-5 rounded-2xl bg-white border border-gray-100 shadow-sm p-4">
          <p className="text-sm font-semibold text-gray-800 mb-3">📱 전화번호로 친구 추가</p>
          <form onSubmit={handleSendRequest} className="flex gap-2">
            <input
              type="tel"
              placeholder="010-XXXX-XXXX"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="flex-1 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:bg-white transition-all"
            />
            <button
              type="submit"
              disabled={requesting || !phone.trim()}
              className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50 transition-all"
            >
              {requesting ? "..." : "신청"}
            </button>
          </form>
          {reqError && <p className="mt-2 text-xs text-red-500">{reqError}</p>}
          {reqSuccess && <p className="mt-2 text-xs text-emerald-600">✓ 친구 신청을 보냈습니다!</p>}
        </div>

        {/* 탭 */}
        <div className="mb-4 flex rounded-2xl bg-gray-100 p-1">
          <button
            onClick={() => setTab("friends")}
            className={`flex-1 rounded-xl py-2 text-sm font-semibold transition-all ${
              tab === "friends" ? "bg-white text-blue-600 shadow-sm" : "text-gray-500"
            }`}
          >
            친구 {friends.length > 0 && `(${friends.length})`}
          </button>
          <button
            onClick={() => setTab("requests")}
            className={`flex-1 rounded-xl py-2 text-sm font-semibold transition-all relative ${
              tab === "requests" ? "bg-white text-blue-600 shadow-sm" : "text-gray-500"
            }`}
          >
            받은 신청
            {requests.length > 0 && (
              <span className="absolute -top-1 -right-1 rounded-full bg-red-500 text-white text-[9px] font-bold w-4 h-4 flex items-center justify-center">
                {requests.length}
              </span>
            )}
          </button>
        </div>

        {/* 목록 */}
        {fetching ? (
          <div className="py-12 text-center text-sm text-gray-400">불러오는 중...</div>
        ) : tab === "friends" ? (
          friends.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-4xl mb-3">👫</p>
              <p className="text-sm text-gray-400">아직 친구가 없습니다</p>
              <p className="text-xs text-gray-300 mt-1">전화번호로 친구를 추가해 보세요</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {friends.map((f) => (
                <FriendCard
                  key={f.friend_id}
                  friend={f}
                  onDelete={() => handleDelete(f.friend_id)}
                />
              ))}
            </div>
          )
        ) : (
          requests.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-4xl mb-3">📭</p>
              <p className="text-sm text-gray-400">받은 친구 신청이 없습니다</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {requests.map((r) => (
                <RequestCard
                  key={r.friend_id}
                  request={r}
                  onAccept={() => handleAccept(r.friend_id)}
                  onReject={() => handleReject(r.friend_id)}
                />
              ))}
            </div>
          )
        )}
      </div>
    </div>
  );
}

function FriendCard({ friend, onDelete }: { friend: FriendItem; onDelete: () => void }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-white border border-gray-100 px-4 py-3 shadow-sm">
      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl bg-gray-100 text-xl">
        {friend.gender === "MALE" ? "👨" : friend.gender === "FEMALE" ? "👩" : "👤"}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-800 truncate">
          {friend.nickname ?? "닉네임 없음"}
        </p>
        <p className="text-xs text-gray-400 truncate">
          {friend.university ?? "학교 미설정"}
          {friend.major ? ` · ${friend.major}` : ""}
        </p>
      </div>
      <button
        onClick={onDelete}
        className="flex-shrink-0 rounded-xl border border-gray-200 px-3 py-1.5 text-xs text-gray-500 hover:border-red-200 hover:text-red-500 transition-colors"
      >
        삭제
      </button>
    </div>
  );
}

function RequestCard({
  request,
  onAccept,
  onReject,
}: {
  request: FriendItem;
  onAccept: () => void;
  onReject: () => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-white border border-blue-100 bg-blue-50/30 px-4 py-3 shadow-sm">
      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl bg-blue-100 text-xl">
        {request.gender === "MALE" ? "👨" : request.gender === "FEMALE" ? "👩" : "👤"}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-800 truncate">
          {request.nickname ?? "닉네임 없음"}
        </p>
        <p className="text-xs text-gray-400 truncate">
          {request.university ?? "학교 미설정"}
        </p>
      </div>
      <div className="flex gap-1.5 flex-shrink-0">
        <button
          onClick={onAccept}
          className="rounded-xl bg-blue-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-700 transition-colors"
        >
          수락
        </button>
        <button
          onClick={onReject}
          className="rounded-xl border border-gray-200 px-3 py-1.5 text-xs text-gray-500 hover:border-red-200 hover:text-red-500 transition-colors"
        >
          거절
        </button>
      </div>
    </div>
  );
}
