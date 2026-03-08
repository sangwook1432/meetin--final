"use client";

/**
 * /discover — 미팅 탐색 페이지
 *
 * 기능:
 *  1. 내 성별 반대팀이 호스트인 모집 중 미팅 목록 표시
 *  2. 미팅 생성 모달 (2:2 / 3:3, 학교 선호 설정)
 *  3. 미팅 카드 클릭 → /meetings/[id]로 이동
 *  4. 폴링: 30초마다 목록 자동 갱신
 *  5. 친구 초대 알림 배너 (받은 초대 + 친구 요청 수락)
 */

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import {
  discoverMeetings, createMeeting,
  getMyInvitations, respondToInvitation,
  pendingFriendRequests, acceptFriendRequest, rejectFriendRequest,
} from "@/lib/api";
import { AppShell } from "@/components/ui/AppShell";
import { MeetingCard } from "@/components/meeting/MeetingCard";
import type { MeetingListItem, MeetingType } from "@/types";

const UNIVERSITIES = [
  "서울대학교", "연세대학교", "고려대학교", "성균관대학교", "한양대학교",
  "중앙대학교", "경희대학교", "한국외국어대학교", "이화여자대학교", "숙명여자대학교",
  "서강대학교", "숭실대학교", "건국대학교", "동국대학교", "홍익대학교",
  "국민대학교", "세종대학교", "단국대학교", "아주대학교", "인하대학교",
];

export default function DiscoverPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [meetings, setMeetings] = useState<MeetingListItem[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  // 미팅 생성 모달
  const [showModal, setShowModal] = useState(false);

  // 알림 관련
  const [pendingInvites, setPendingInvites] = useState<{
    id: number; meeting_id: number; invite_type: string; inviter_nickname: string | null;
  }[]>([]);
  const [pendingFriends, setPendingFriends] = useState<{
    friendship_id: number; requester_id: number; nickname: string | null;
  }[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);

  // ─── 목록 불러오기 ─────────────────────────────────────
  const fetchMeetings = useCallback(async () => {
    try {
      const res = await discoverMeetings();
      setMeetings(res.meetings);
      setListError(null);
    } catch (e) {
      setListError(e instanceof Error ? e.message : "목록 로드 실패");
    } finally {
      setListLoading(false);
    }
  }, []);

  // ─── 알림 불러오기 ────────────────────────────────────
  const fetchNotifications = useCallback(async () => {
    try {
      const [inviteRes, friendRes] = await Promise.all([
        getMyInvitations(),
        pendingFriendRequests(),
      ]);
      setPendingInvites(inviteRes.invitations);
      setPendingFriends(friendRes.requests);
    } catch {}
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    fetchMeetings();
    fetchNotifications();
    const id = setInterval(() => { fetchMeetings(); fetchNotifications(); }, 30_000);
    return () => clearInterval(id);
  }, [authLoading, user, fetchMeetings, fetchNotifications, router]);

  const handleInviteRespond = async (inviteId: number, accept: boolean) => {
    try {
      const res = await respondToInvitation(inviteId, accept);
      if (accept && res.meeting_id) {
        router.push(`/meetings/${res.meeting_id}`);
      } else {
        fetchNotifications();
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : "처리 실패");
    }
  };

  const handleFriendAccept = async (friendshipId: number) => {
    try {
      await acceptFriendRequest(friendshipId);
      fetchNotifications();
    } catch (e) {
      alert(e instanceof Error ? e.message : "처리 실패");
    }
  };

  const handleFriendReject = async (friendshipId: number) => {
    try {
      await rejectFriendRequest(friendshipId);
      fetchNotifications();
    } catch (e) {
      alert(e instanceof Error ? e.message : "처리 실패");
    }
  };

  const totalNotifications = pendingInvites.length + pendingFriends.length;

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-gray-400">
        로딩 중...
      </div>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-md px-4 py-5">
        {/* 헤더 */}
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-black text-gray-900">미팅 탐색</h1>
            <p className="mt-0.5 text-xs text-gray-400">
              {user?.gender === "MALE" ? "여성 팀이 호스트인" : "남성 팀이 호스트인"} 미팅 목록
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* 알림 버튼 */}
            <button
              onClick={() => setShowNotifications(true)}
              className="relative flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200 transition-all"
            >
              🔔
              {totalNotifications > 0 && (
                <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs font-bold text-white">
                  {totalNotifications}
                </span>
              )}
            </button>
            <button
              onClick={() => setShowModal(true)}
              className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-700 active:scale-95 transition-all shadow-md shadow-blue-200"
            >
              <span className="text-base leading-none">+</span>
              미팅 만들기
            </button>
          </div>
        </div>

        {/* 미인증 안내 배너 */}
        {user?.verification_status !== "VERIFIED" && (
          <div
            onClick={() => router.push("/me/docs")}
            className="mb-4 cursor-pointer rounded-2xl border border-yellow-200 bg-yellow-50 px-4 py-3"
          >
            <p className="text-sm font-semibold text-yellow-800">⚠️ 재학 인증이 필요합니다</p>
            <p className="mt-0.5 text-xs text-yellow-600">
              미팅에 참가하려면 재학증명서를 제출해야 합니다. 탭하여 진행하세요 →
            </p>
          </div>
        )}

        {/* 목록 */}
        {listLoading ? (
          <div className="flex flex-col gap-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-32 animate-pulse rounded-2xl bg-gray-100" />
            ))}
          </div>
        ) : listError ? (
          <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-6 text-center">
            <p className="text-sm text-red-600">{listError}</p>
            <button onClick={fetchMeetings} className="mt-3 text-sm text-blue-600 underline">
              다시 시도
            </button>
          </div>
        ) : meetings.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <span className="text-5xl">🔍</span>
            <p className="text-base font-semibold text-gray-600">아직 미팅이 없어요</p>
            <p className="text-sm text-gray-400">먼저 미팅을 만들어보세요!</p>
            <button
              onClick={() => setShowModal(true)}
              className="mt-2 rounded-xl bg-blue-600 px-6 py-2.5 text-sm font-bold text-white hover:bg-blue-700"
            >
              미팅 만들기
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {meetings.map((m) => (
              <MeetingCard
                key={m.meeting_id}
                meeting={m}
                onClick={() => router.push(`/meetings/${m.meeting_id}`)}
              />
            ))}
          </div>
        )}
      </div>

      {/* 미팅 생성 모달 */}
      {showModal && (
        <CreateMeetingModal
          onClose={() => setShowModal(false)}
          onCreated={(id) => {
            setShowModal(false);
            router.push(`/meetings/${id}`);
          }}
        />
      )}

      {/* 알림 모달 */}
      {showNotifications && (
        <NotificationModal
          pendingInvites={pendingInvites}
          pendingFriends={pendingFriends}
          onInviteRespond={handleInviteRespond}
          onFriendAccept={handleFriendAccept}
          onFriendReject={handleFriendReject}
          onClose={() => setShowNotifications(false)}
        />
      )}
    </AppShell>
  );
}

// ─────────────────────────────────────────────────────
// 알림 모달
// ─────────────────────────────────────────────────────

function NotificationModal({
  pendingInvites, pendingFriends,
  onInviteRespond, onFriendAccept, onFriendReject, onClose,
}: {
  pendingInvites: { id: number; meeting_id: number; invite_type: string; inviter_nickname: string | null }[];
  pendingFriends: { friendship_id: number; requester_id: number; nickname: string | null }[];
  onInviteRespond: (id: number, accept: boolean) => void;
  onFriendAccept: (id: number) => void;
  onFriendReject: (id: number) => void;
  onClose: () => void;
}) {
  const total = pendingInvites.length + pendingFriends.length;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40">
      <div className="w-full max-w-md rounded-t-3xl bg-white p-6 pb-10 max-h-[80vh] overflow-y-auto">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">
            알림 {total > 0 && <span className="text-red-500">({total})</span>}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
        </div>

        {total === 0 ? (
          <div className="py-8 text-center">
            <p className="text-sm text-gray-400">새로운 알림이 없습니다</p>
          </div>
        ) : (
          <div className="space-y-3">
            {/* 미팅 초대 */}
            {pendingInvites.map((inv) => (
              <div key={inv.id} className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
                <p className="text-sm font-semibold text-blue-800">
                  {inv.invite_type === "REPLACE" ? "🔄 대체 인원 초대" : "👥 미팅 초대"}
                </p>
                <p className="mt-1 text-xs text-blue-600">
                  {inv.inviter_nickname || "누군가"}님이 미팅 #{inv.meeting_id}에 초대했습니다
                </p>
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => onInviteRespond(inv.id, true)}
                    className="flex-1 rounded-xl bg-blue-600 py-2 text-xs font-bold text-white hover:bg-blue-700"
                  >
                    수락
                  </button>
                  <button
                    onClick={() => onInviteRespond(inv.id, false)}
                    className="flex-1 rounded-xl border border-gray-200 bg-white py-2 text-xs font-medium text-gray-600 hover:bg-gray-50"
                  >
                    거절
                  </button>
                </div>
              </div>
            ))}

            {/* 친구 요청 */}
            {pendingFriends.map((req) => (
              <div key={req.friendship_id} className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
                <p className="text-sm font-semibold text-emerald-800">👤 친구 요청</p>
                <p className="mt-1 text-xs text-emerald-600">
                  {req.nickname || `유저 #${req.requester_id}`}님이 친구 요청을 보냈습니다
                </p>
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => onFriendAccept(req.friendship_id)}
                    className="flex-1 rounded-xl bg-emerald-600 py-2 text-xs font-bold text-white hover:bg-emerald-700"
                  >
                    수락
                  </button>
                  <button
                    onClick={() => onFriendReject(req.friendship_id)}
                    className="flex-1 rounded-xl border border-gray-200 bg-white py-2 text-xs font-medium text-gray-600 hover:bg-gray-50"
                  >
                    거절
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────
// 미팅 생성 모달
// ─────────────────────────────────────────────────────

interface CreateMeetingModalProps {
  onClose: () => void;
  onCreated: (meetingId: number) => void;
}

function CreateMeetingModal({ onClose, onCreated }: CreateMeetingModalProps) {
  const [meetingType, setMeetingType] = useState<MeetingType>("TWO_BY_TWO");
  const [preferAny, setPreferAny] = useState(true);
  const [selectedUnis, setSelectedUnis] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleUni = (uni: string) => {
    setSelectedUnis((prev) =>
      prev.includes(uni) ? prev.filter((u) => u !== uni) : [...prev, uni]
    );
  };

  const handleCreate = async () => {
    setError(null);
    setCreating(true);
    try {
      const res = await createMeeting({
        meeting_type: meetingType,
        preferred_universities_any: preferAny,
        preferred_universities_raw: !preferAny && selectedUnis.length > 0
          ? selectedUnis.join(",")
          : undefined,
      });
      onCreated(res.meeting_id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "미팅 생성 실패");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm sm:items-center">
      <div className="w-full max-w-md rounded-t-3xl bg-white p-6 pb-8 shadow-2xl sm:rounded-3xl">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">새 미팅 만들기</h2>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            ✕
          </button>
        </div>

        <div className="space-y-5">
          {/* 미팅 유형 */}
          <div>
            <p className="mb-2.5 text-sm font-semibold text-gray-700">미팅 유형</p>
            <div className="grid grid-cols-2 gap-3">
              {(["TWO_BY_TWO", "THREE_BY_THREE"] as MeetingType[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setMeetingType(t)}
                  className={`rounded-2xl border-2 py-4 text-center transition-all ${
                    meetingType === t
                      ? "border-blue-500 bg-blue-50"
                      : "border-gray-100 bg-gray-50 hover:border-gray-200"
                  }`}
                >
                  <div className="text-2xl font-black text-gray-900">
                    {t === "TWO_BY_TWO" ? "2 : 2" : "3 : 3"}
                  </div>
                  <div className={`mt-1 text-xs font-medium ${meetingType === t ? "text-blue-600" : "text-gray-400"}`}>
                    {t === "TWO_BY_TWO" ? "2명씩 미팅" : "3명씩 미팅"}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* 학교 선호 */}
          <div>
            <p className="mb-2.5 text-sm font-semibold text-gray-700">상대방 학교 선호</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { setPreferAny(true); setSelectedUnis([]); }}
                className={`flex-1 rounded-xl py-2.5 text-sm border-2 font-medium transition-all ${
                  preferAny ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-200 text-gray-500"
                }`}
              >
                🌍 아무 학교
              </button>
              <button
                type="button"
                onClick={() => setPreferAny(false)}
                className={`flex-1 rounded-xl py-2.5 text-sm border-2 font-medium transition-all ${
                  !preferAny ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-200 text-gray-500"
                }`}
              >
                🏫 학교 선택
              </button>
            </div>

            {!preferAny && (
              <div className="mt-3 rounded-2xl border border-gray-100 bg-gray-50 p-3">
                <p className="mb-2 text-xs text-gray-400">원하는 학교를 선택하세요 (복수 선택 가능)</p>
                <div className="flex flex-wrap gap-1.5">
                  {UNIVERSITIES.map((uni) => (
                    <button
                      key={uni}
                      type="button"
                      onClick={() => toggleUni(uni)}
                      className={`rounded-full px-3 py-1.5 text-xs font-medium transition-all border ${
                        selectedUnis.includes(uni)
                          ? "border-blue-400 bg-blue-500 text-white"
                          : "border-gray-200 bg-white text-gray-600 hover:border-blue-200"
                      }`}
                    >
                      {uni.replace("학교", "").replace("대학교", "대")}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {error && (
            <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
              {error}
            </div>
          )}

          <button
            onClick={handleCreate}
            disabled={creating}
            className="w-full rounded-xl bg-blue-600 py-3.5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50 active:scale-95 transition-all"
          >
            {creating ? "생성 중..." : "미팅 만들기 →"}
          </button>
        </div>
      </div>
    </div>
  );
}
