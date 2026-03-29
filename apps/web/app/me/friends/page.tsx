"use client";
import ErrorBanner from "@/components/ui/ErrorBanner";

/**
 * /me/friends — 친구 목록 + 친구 추가 + 받은 요청
 *
 * 탭:
 *   [내 친구] - listFriends() 결과 표시
 *   [받은 요청] - pendingFriendRequests() + 수락/거절 버튼
 *   [친구 추가] - 전화번호 입력 → sendFriendRequest(phone)
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  listFriends,
  pendingFriendRequests,
  sendFriendRequest,
  acceptFriendRequest,
  rejectFriendRequest,
  deleteFriend,
  type FriendItem,
} from "@/lib/api";
import { AppShell } from "@/components/ui/AppShell";

type TabId = "list" | "pending" | "add";

interface PendingRequest {
  friendship_id: number;
  requester_id: number;
  nickname: string | null;
  created_at: string;
}

const VERIFICATION_LABELS: Record<string, { label: string; className: string }> = {
  VERIFIED: { label: "인증됨", className: "text-emerald-600" },
  PENDING: { label: "인증 대기", className: "text-yellow-600" },
  REJECTED: { label: "인증 거절", className: "text-red-500" },
};

const GENDER_LABELS: Record<string, string> = {
  MALE: "남",
  FEMALE: "여",
};

export default function FriendsPage() {
  const router = useRouter();
  const [tab, setTab] = useState<TabId>("list");

  // 내 친구
  const [friends, setFriends] = useState<FriendItem[]>([]);
  const [friendsLoading, setFriendsLoading] = useState(true);
  const [friendsError, setFriendsError] = useState<string | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<number | null>(null);

  // 받은 요청
  const [pending, setPending] = useState<PendingRequest[]>([]);
  const [pendingLoading, setPendingLoading] = useState(true);
  const [pendingError, setPendingError] = useState<string | null>(null);
  const [respondingId, setRespondingId] = useState<number | null>(null);

  // 친구 추가
  const [phone, setPhone] = useState("");
  const [addLoading, setAddLoading] = useState(false);
  const [addResult, setAddResult] = useState<{ success: boolean; message: string } | null>(null);

  useEffect(() => {
    listFriends()
      .then((res) => setFriends(res.friends))
      .catch((e) => setFriendsError(e instanceof Error ? e.message : "로드 실패"))
      .finally(() => setFriendsLoading(false));

    pendingFriendRequests()
      .then((res) => setPending(res.requests))
      .catch((e) => setPendingError(e instanceof Error ? e.message : "로드 실패"))
      .finally(() => setPendingLoading(false));
  }, []);

  async function handleAccept(id: number) {
    setRespondingId(id);
    try {
      await acceptFriendRequest(id);
      setPending((prev) => prev.filter((r) => r.friendship_id !== id));
      // 친구 목록 새로고침
      const res = await listFriends();
      setFriends(res.friends);
    } catch (e) {
      alert(e instanceof Error ? e.message : "오류 발생");
    } finally {
      setRespondingId(null);
    }
  }

  async function handleReject(id: number) {
    setRespondingId(id);
    try {
      await rejectFriendRequest(id);
      setPending((prev) => prev.filter((r) => r.friendship_id !== id));
    } catch (e) {
      alert(e instanceof Error ? e.message : "오류 발생");
    } finally {
      setRespondingId(null);
    }
  }

  async function handleSendRequest() {
    if (!phone.trim()) return;
    setAddLoading(true);
    setAddResult(null);
    try {
      const res = await sendFriendRequest(phone.trim());
      const nickname = res.target_nickname ? `${res.target_nickname}님께` : "";
      setAddResult({ success: true, message: `${nickname} 친구 요청을 보냈습니다.` });
      setPhone("");
    } catch (e) {
      setAddResult({ success: false, message: e instanceof Error ? e.message : "요청 실패" });
    } finally {
      setAddLoading(false);
    }
  }

  const TABS: { id: TabId; label: string; badge?: number }[] = [
    { id: "list", label: "내 친구", badge: friends.length },
    { id: "pending", label: "받은 요청", badge: pending.length },
    { id: "add", label: "친구 추가" },
  ];

  return (
    <AppShell>
      <div className="mx-auto max-w-md px-4 py-6">
        <h2 className="mb-5 text-lg font-bold text-gray-900">👫 친구</h2>

        {/* 탭 헤더 */}
        <div className="mb-5 flex rounded-xl border border-gray-100 bg-gray-50 p-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold transition-all ${
                tab === t.id
                  ? "bg-white text-blue-600 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {t.label}
              {t.badge !== undefined && t.badge > 0 && (
                <span className={`rounded-full px-1.5 py-0.5 text-xs font-bold leading-none ${
                  tab === t.id ? "bg-blue-100 text-blue-600" : "bg-gray-200 text-gray-500"
                }`}>
                  {t.badge}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* 내 친구 탭 */}
        {tab === "list" && (
          <>
            {friendsLoading ? (
              <div className="flex justify-center py-12">
                <div className="h-7 w-7 animate-spin rounded-full border-4 border-blue-200 border-t-blue-600" />
              </div>
            ) : friendsError ? (
              <ErrorBanner message={friendsError} />
            ) : friends.length === 0 ? (
              <div className="rounded-2xl bg-white border border-gray-100 p-10 text-center shadow-sm">
                <div className="text-4xl mb-3">👫</div>
                <p className="text-sm font-semibold text-gray-700">아직 친구가 없습니다</p>
                <p className="mt-1.5 text-xs text-gray-400">친구 추가 탭에서 친구를 추가해보세요</p>
                <button
                  onClick={() => setTab("add")}
                  className="mt-5 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-blue-700 transition-all"
                >
                  친구 추가하기 →
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {friends.map((f) => {
                  const verifyCfg = VERIFICATION_LABELS[f.verification_status] ?? {
                    label: f.verification_status,
                    className: "text-gray-400",
                  };
                  return (
                    <div
                      key={f.id}
                      className="relative flex items-center gap-3 rounded-xl bg-white border border-gray-100 px-4 py-3 shadow-sm"
                    >
                      <div
                        onClick={() => router.push(`/profile/${f.id}`)}
                        className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer"
                      >
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-50 text-xl">
                          {f.gender === "MALE" ? "👨" : f.gender === "FEMALE" ? "👩" : "👤"}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-800 truncate">
                            {f.nickname ?? "이름 없음"}
                            {f.gender && (
                              <span className="ml-1.5 text-xs text-gray-400">{GENDER_LABELS[f.gender]}</span>
                            )}
                          </p>
                          <p className="text-xs text-gray-400 truncate">
                            {f.university ?? "학교 미입력"} · 끝번호 {f.phone_last4}
                          </p>
                        </div>
                      </div>
                      <span className={`text-xs font-medium ${verifyCfg.className}`}>
                        {verifyCfg.label}
                      </span>
                      {/* 말줄임표 메뉴 */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setMenuOpenId(menuOpenId === f.id ? null : f.id);
                        }}
                        className="ml-1 p-2 text-gray-400 hover:text-gray-600 rounded"
                      >
                        ⋮
                      </button>
                      {menuOpenId === f.id && (
                        <>
                          <div
                            className="fixed inset-0 z-10"
                            onClick={() => setMenuOpenId(null)}
                          />
                          <div className="absolute right-2 top-10 z-20 rounded-lg border border-gray-100 bg-white shadow-lg py-1 min-w-[100px]">
                            <button
                              onClick={async (e) => {
                                e.stopPropagation();
                                if (!confirm(`${f.nickname ?? "이 친구"}를 삭제할까요?`)) return;
                                await deleteFriend(f.id);
                                setFriends((prev) => prev.filter((x) => x.id !== f.id));
                                setMenuOpenId(null);
                              }}
                              className="w-full px-4 py-2 text-left text-sm text-red-500 hover:bg-red-50"
                            >
                              친구 삭제
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* 받은 요청 탭 */}
        {tab === "pending" && (
          <>
            {pendingLoading ? (
              <div className="flex justify-center py-12">
                <div className="h-7 w-7 animate-spin rounded-full border-4 border-blue-200 border-t-blue-600" />
              </div>
            ) : pendingError ? (
              <div className="rounded-xl bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-600">
                {pendingError}
              </div>
            ) : pending.length === 0 ? (
              <div className="rounded-2xl bg-white border border-gray-100 p-10 text-center shadow-sm">
                <div className="text-4xl mb-3">📭</div>
                <p className="text-sm font-semibold text-gray-700">받은 친구 요청이 없습니다</p>
              </div>
            ) : (
              <div className="space-y-2">
                {pending.map((req) => (
                  <div
                    key={req.friendship_id}
                    className="rounded-xl bg-white border border-gray-100 px-4 py-3 shadow-sm"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-gray-800">
                          {req.nickname ?? `유저 #${req.requester_id}`}
                        </p>
                        <p className="text-xs text-gray-400">
                          {new Date(req.created_at).toLocaleDateString("ko-KR")} 요청
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleAccept(req.friendship_id)}
                          disabled={respondingId === req.friendship_id}
                          className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50 transition-all"
                        >
                          수락
                        </button>
                        <button
                          onClick={() => handleReject(req.friendship_id)}
                          disabled={respondingId === req.friendship_id}
                          className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-500 hover:bg-gray-50 disabled:opacity-50 transition-all"
                        >
                          거절
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* 친구 추가 탭 */}
        {tab === "add" && (
          <div className="rounded-2xl bg-white border border-gray-100 p-5 shadow-sm">
            <p className="mb-4 text-sm text-gray-600">
              친구의 전화번호를 입력하면 친구 요청을 보낼 수 있습니다.
            </p>
            <div className="flex gap-2">
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSendRequest()}
                placeholder="010-0000-0000"
                className="flex-1 min-w-0 rounded-xl border border-gray-200 px-3 py-2.5 text-base text-gray-900 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
              />
              <button
                onClick={handleSendRequest}
                disabled={addLoading || !phone.trim()}
                className="shrink-0 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 transition-all"
              >
                {addLoading ? "..." : "요청"}
              </button>
            </div>

            {addResult && (
              <div className={`mt-3 rounded-xl px-4 py-3 text-sm font-medium ${
                addResult.success
                  ? "bg-emerald-50 text-emerald-700"
                  : "bg-red-50 text-red-600"
              }`}>
                {addResult.success ? "✓ " : "✗ "}{addResult.message}
              </div>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}
