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
  getMyInvitations, respondToInvitation, replaceConfirm,
  pendingFriendRequests, acceptFriendRequest, rejectFriendRequest,
  getMyNotifications, markNotificationRead,
  submitFeedback, getAfterTargets, submitAfterRequest,
} from "@/lib/api";
import { AppShell } from "@/components/ui/AppShell";
import { MeetingCard } from "@/components/meeting/MeetingCard";
import type { MeetingListItem, MeetingType, AfterTarget } from "@/types";

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
  const [visitedIds, setVisitedIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (!user) return;
    try {
      const raw = localStorage.getItem(`visited_meetings_${user.id}`);
      setVisitedIds(new Set(raw ? JSON.parse(raw) : []));
    } catch { /* ignore */ }
  }, [user?.id]);

  const markVisited = (id: number) => {
    if (!user) return;
    setVisitedIds((prev) => {
      const next = new Set(prev).add(id);
      localStorage.setItem(`visited_meetings_${user.id}`, JSON.stringify([...next]));
      return next;
    });
  };

  // 미팅 생성 모달
  const [showModal, setShowModal] = useState(false);

  // 알림 관련
  const [pendingInvites, setPendingInvites] = useState<{
    id: number; meeting_id: number; invite_type: string; status: string; inviter_nickname: string | null;
  }[]>([]);
  const [pendingFriends, setPendingFriends] = useState<{
    friendship_id: number; requester_id: number; nickname: string | null;
  }[]>([]);
  const [systemNotifs, setSystemNotifs] = useState<{
    id: number; notif_type: string; message: string; meeting_id: number | null;
  }[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  // 대체인원 매칭권 납부 확인 모달 (REPLACE 초대용)
  const [replaceConfirm, setReplaceConfirm] = useState<{ inviteId: number; inviteeNick: string | null } | null>(null);
  const [replaceLoading, setReplaceLoading] = useState(false);

  // 미팅 완료 후 후기/애프터 모달
  const [postMeetingState, setPostMeetingState] = useState<{ meetingId: number; startAt: "ask_after" | "complaint" } | null>(null);

  // 재학 인증 서류 제출 여부 (localStorage 기반)
  const [docPending, setDocPending] = useState(false);
  useEffect(() => {
    if (user) {
      setDocPending(localStorage.getItem(`doc_pending_${user.id}`) === "1");
    }
  }, [user?.id]);

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
      const [inviteRes, friendRes, notifRes] = await Promise.all([
        getMyInvitations(),
        pendingFriendRequests(),
        getMyNotifications(),
      ]);
      setPendingInvites(inviteRes.invitations);
      setPendingFriends(friendRes.requests);
      setSystemNotifs(notifRes.notifications);
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

  // REPLACE 초대: 수락 클릭 → 보증금 확인 모달 표시
  const handleInviteAccept = (inv: { id: number; invite_type: string; inviter_nickname: string | null }) => {
    if (inv.invite_type === "REPLACE") {
      setReplaceConfirm({ inviteId: inv.id, inviteeNick: inv.inviter_nickname });
    } else {
      handleFriendInviteAccept(inv.id);
    }
  };

  // FRIEND 초대 수락
  const handleFriendInviteAccept = async (inviteId: number) => {
    try {
      const res = await respondToInvitation(inviteId, true);
      if (res.meeting_id) router.push(`/meetings/${res.meeting_id}`);
      else fetchNotifications();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "처리 실패";
      if (msg.includes("이미") || msg.includes("만료") || msg.includes("410") || msg.includes("400")) {
        alert("이미 참여한 미팅입니다.");
      } else {
        alert(msg);
      }
      fetchNotifications();
    }
  };

  // 초대 거절
  const handleInviteReject = async (inviteId: number) => {
    try {
      await respondToInvitation(inviteId, false);
      fetchNotifications();
    } catch (e) {
      alert(e instanceof Error ? e.message : "처리 실패");
    }
  };

  // 보증금 확인 모달 — 예 클릭
  const handleReplaceConfirm = async () => {
    if (!replaceConfirm) return;
    setReplaceLoading(true);
    try {
      const res = await replaceConfirm(replaceConfirm.inviteId);
      setReplaceConfirm(null);
      if (res.chat_room_id) router.push(`/chats/${res.chat_room_id}`);
      else router.push(`/meetings/${res.meeting_id}`);
    } catch (e) {
      alert(e instanceof Error ? e.message : "처리 실패");
    } finally {
      setReplaceLoading(false);
    }
  };

  // 보증금 확인 모달 — 아니요 클릭 = 거절
  const handleReplaceCancel = async () => {
    if (!replaceConfirm) return;
    setReplaceConfirm(null);
    await handleInviteReject(replaceConfirm.inviteId);
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

  const totalNotifications = pendingInvites.length + pendingFriends.length + systemNotifs.length;

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
        {user?.verification_status !== "VERIFIED" && !docPending && (
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
        {user?.verification_status !== "VERIFIED" && docPending && (
          <div className="mb-4 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3">
            <p className="text-sm font-semibold text-blue-800">⏳ 재학 인증 검토 중</p>
            <p className="mt-0.5 text-xs text-blue-600">
              서류를 제출했습니다. 관리자 검토 후 인증이 완료됩니다.
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
                visited={visitedIds.has(m.meeting_id)}
                onClick={() => { markVisited(m.meeting_id); router.push(`/meetings/${m.meeting_id}`); }}
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
          systemNotifs={systemNotifs}
          onInviteAccept={(inv) => { setShowNotifications(false); handleInviteAccept(inv); }}
          onInviteReject={(id) => { handleInviteReject(id); fetchNotifications(); }}
          onFriendAccept={handleFriendAccept}
          onFriendReject={handleFriendReject}
          onSystemNotifDismiss={async (id) => {
            await markNotificationRead(id).catch(() => {});
            setSystemNotifs((prev) => prev.filter((n) => n.id !== id));
          }}
          onMeetingCompleted={(notifId, meetingId, startAt) => {
            markNotificationRead(notifId).catch(() => {});
            setSystemNotifs((prev) => prev.filter((n) => n.id !== notifId));
            setShowNotifications(false);
            if (startAt === "complaint") {
              setPostMeetingState({ meetingId, startAt: "complaint" });
            } else {
              submitFeedback(meetingId, true).catch(() => {});
              setPostMeetingState({ meetingId, startAt: "ask_after" });
            }
          }}
          onClose={() => setShowNotifications(false)}
        />
      )}

      {/* 미팅 완료 후 후기/애프터 모달 */}
      {postMeetingState !== null && (
        <PostMeetingModal
          meetingId={postMeetingState.meetingId}
          startAt={postMeetingState.startAt}
          userPhone={user?.phone ?? null}
          onClose={() => setPostMeetingState(null)}
        />
      )}


      {/* 매칭권 소모 확인 모달 (REPLACE 초대) */}
      {replaceConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" onClick={() => setReplaceConfirm(null)}>
          <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <p className="text-base font-bold text-gray-900">매칭권 소모 확인</p>
              <button
                onClick={() => setReplaceConfirm(null)}
                className="flex h-7 w-7 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600 text-lg"
              >✕</button>
            </div>
            <p className="mt-3 text-sm text-gray-600 text-center leading-relaxed">
              {replaceConfirm.inviteeNick || "누군가"}님이 초대한 미팅에 참가하려면<br />
              <span className="font-bold text-blue-600">매칭권 1개</span>를 소모해야 합니다.
            </p>
            <div className="mt-5 flex gap-3">
              <button
                onClick={handleReplaceCancel}
                disabled={replaceLoading}
                className="flex-1 rounded-xl border border-gray-200 py-3 text-sm font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50"
              >
                아니요 (거절)
              </button>
              <button
                onClick={handleReplaceConfirm}
                disabled={replaceLoading}
                className="flex-1 rounded-xl bg-blue-600 py-3 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {replaceLoading ? "처리 중..." : "예, 참가하기"}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}

// ─────────────────────────────────────────────────────
// 알림 모달
// ─────────────────────────────────────────────────────

function NotificationModal({
  pendingInvites, pendingFriends, systemNotifs,
  onInviteAccept, onInviteReject, onFriendAccept, onFriendReject,
  onSystemNotifDismiss, onMeetingCompleted, onClose,
}: {
  pendingInvites: { id: number; meeting_id: number; invite_type: string; status: string; inviter_nickname: string | null }[];
  pendingFriends: { friendship_id: number; requester_id: number; nickname: string | null }[];
  systemNotifs: { id: number; notif_type: string; message: string; meeting_id: number | null }[];
  onInviteAccept: (inv: { id: number; invite_type: string; inviter_nickname: string | null }) => void;
  onInviteReject: (id: number) => void;
  onFriendAccept: (id: number) => void;
  onFriendReject: (id: number) => void;
  onSystemNotifDismiss: (id: number) => void;
  onMeetingCompleted: (notifId: number, meetingId: number, startAt?: "complaint") => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const total = pendingInvites.length + pendingFriends.length + systemNotifs.length;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={onClose}>
      <div className="w-full max-w-md rounded-t-3xl bg-white p-6 pb-10 max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
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
            {pendingInvites.map((inv) => {
              const isReplace = inv.invite_type === "REPLACE";
              const isDepositPending = inv.status === "DEPOSIT_PENDING";
              return (
                <div key={inv.id} className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
                  <p className="text-sm font-semibold text-blue-800">
                    {isReplace ? "🔄 대체 인원 초대" : "👥 미팅 초대"}
                  </p>
                  <p className="mt-1 text-xs text-blue-600">
                    {inv.inviter_nickname || "누군가"}님이 미팅 #{inv.meeting_id}에 초대했습니다
                  </p>
                  {isDepositPending && (
                    <p className="mt-1 text-xs font-semibold text-orange-600">
                      ⏳ 매칭권 납부 대기 중
                    </p>
                  )}
                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={() => onInviteAccept(inv)}
                      className="flex-1 rounded-xl bg-blue-600 py-2 text-xs font-bold text-white hover:bg-blue-700"
                    >
                      {isReplace ? (isDepositPending ? "매칭권 납부" : "수락") : "수락"}
                    </button>
                    {!isDepositPending && (
                      <button
                        onClick={() => onInviteReject(inv.id)}
                        className="flex-1 rounded-xl border border-gray-200 bg-white py-2 text-xs font-medium text-gray-600 hover:bg-gray-50"
                      >
                        거절
                      </button>
                    )}
                  </div>
                </div>
              );
            })}

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

            {/* 시스템 알림 */}
            {systemNotifs.map((notif) => {
              if (notif.notif_type === "MEETING_COMPLETED" && notif.meeting_id) {
                return (
                  <div key={notif.id} className="rounded-2xl border border-purple-100 bg-purple-50 p-4">
                    <p className="text-sm font-semibold text-purple-800">✨ 미팅 완료</p>
                    <p className="mt-1 text-xs text-purple-600">{notif.message}</p>
                    <div className="mt-3 flex gap-2">
                      <button
                        onClick={() => onMeetingCompleted(notif.id, notif.meeting_id!)}
                        className="flex-1 rounded-xl bg-purple-600 py-2 text-xs font-bold text-white hover:bg-purple-700"
                      >
                        예
                      </button>
                      <button
                        onClick={() => onMeetingCompleted(notif.id, notif.meeting_id!, "complaint")}
                        className="flex-1 rounded-xl border border-gray-200 bg-white py-2 text-xs font-medium text-gray-600 hover:bg-gray-50"
                      >
                        아니요
                      </button>
                    </div>
                  </div>
                );
              }
              if (notif.notif_type === "AFTER_REQUEST_RECEIVED") {
                return (
                  <div key={notif.id} className="rounded-2xl border border-pink-100 bg-pink-50 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-semibold text-pink-800">💌 애프터 신청</p>
                      <button
                        onClick={() => onSystemNotifDismiss(notif.id)}
                        className="flex h-6 w-6 items-center justify-center rounded-full text-pink-400 hover:bg-pink-100 text-sm"
                      >✕</button>
                    </div>
                    <p className="mt-1 text-xs text-pink-700">{notif.message}</p>
                    <button
                      onClick={() => { onSystemNotifDismiss(notif.id); window.location.href = "/me/messages"; }}
                      className="mt-3 w-full rounded-xl bg-pink-500 py-2 text-xs font-bold text-white hover:bg-pink-600"
                    >
                      쪽지함 보기
                    </button>
                  </div>
                );
              }
              if (notif.notif_type === "CHAT_ROOM_ACTIVATED") {
                return (
                  <div key={notif.id} className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-semibold text-emerald-800">💬 채팅방 활성화</p>
                      <button
                        onClick={() => onSystemNotifDismiss(notif.id)}
                        className="flex h-6 w-6 items-center justify-center rounded-full text-emerald-400 hover:bg-emerald-100 text-sm"
                      >✕</button>
                    </div>
                    <p className="mt-1 text-xs text-emerald-700">{notif.message}</p>
                    <button
                      onClick={() => {
                        onSystemNotifDismiss(notif.id);
                        if (notif.meeting_id) router.push(`/meetings/${notif.meeting_id}`);
                      }}
                      className="mt-3 w-full rounded-xl bg-emerald-600 py-2 text-xs font-bold text-white hover:bg-emerald-700"
                    >
                      채팅방 입장 →
                    </button>
                  </div>
                );
              }
              if (notif.notif_type === "WAITING_CONFIRM") {
                return (
                  <div key={notif.id} className="rounded-2xl border border-yellow-100 bg-yellow-50 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-semibold text-yellow-800">🎉 인원 충족</p>
                      <button
                        onClick={() => onSystemNotifDismiss(notif.id)}
                        className="flex h-6 w-6 items-center justify-center rounded-full text-yellow-400 hover:bg-yellow-100 hover:text-yellow-600 text-sm"
                      >✕</button>
                    </div>
                    <p className="mt-1 text-xs text-yellow-700">{notif.message}</p>
                    {notif.meeting_id && (
                      <button
                        onClick={() => {
                          onSystemNotifDismiss(notif.id);
                          router.push(`/meetings/${notif.meeting_id}`);
                        }}
                        className="mt-3 w-full rounded-xl bg-yellow-500 py-2 text-xs font-bold text-white hover:bg-yellow-600"
                      >
                        미팅 확인하기 →
                      </button>
                    )}
                  </div>
                );
              }
              if (notif.notif_type === "ACCOUNT_PENALTY") {
                return (
                  <div key={notif.id} className="rounded-2xl border border-red-100 bg-red-50 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-semibold text-red-800">🚨 계정 제재</p>
                      <button
                        onClick={() => onSystemNotifDismiss(notif.id)}
                        className="flex h-6 w-6 items-center justify-center rounded-full text-red-400 hover:bg-red-100 hover:text-red-600 text-sm"
                      >✕</button>
                    </div>
                    <p className="mt-1 text-xs text-red-700">{notif.message}</p>
                  </div>
                );
              }
              return (
                <div key={notif.id} className="rounded-2xl border border-orange-100 bg-orange-50 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold text-orange-800">⚠️ 미팅 취소</p>
                    <button
                      onClick={() => onSystemNotifDismiss(notif.id)}
                      className="flex h-6 w-6 items-center justify-center rounded-full text-orange-400 hover:bg-orange-100 hover:text-orange-600 text-sm"
                    >✕</button>
                  </div>
                  <p className="mt-1 text-xs text-orange-700">{notif.message}</p>
                </div>
              );
            })}
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

const ENTRY_YEARS = [18, 19, 20, 21, 22, 23, 24, 25, 26];

function CreateMeetingModal({ onClose, onCreated }: CreateMeetingModalProps) {
  const [meetingType, setMeetingType] = useState<MeetingType>("TWO_BY_TWO");
  const [title, setTitle] = useState("");
  // 상대팀 조건
  const [preferAny, setPreferAny] = useState(true);
  const [selectedUnis, setSelectedUnis] = useState<string[]>([]);
  const [entryYearAny, setEntryYearAny] = useState(true);
  const [entryYearMin, setEntryYearMin] = useState<number>(ENTRY_YEARS[0]);
  const [entryYearMax, setEntryYearMax] = useState<number>(ENTRY_YEARS[ENTRY_YEARS.length - 1]);
  // 우리팀 조건
  const [myPreferAny, setMyPreferAny] = useState(true);
  const [mySelectedUnis, setMySelectedUnis] = useState<string[]>([]);
  const [myEntryYearAny, setMyEntryYearAny] = useState(true);
  const [myEntryYearMin, setMyEntryYearMin] = useState<number>(ENTRY_YEARS[0]);
  const [myEntryYearMax, setMyEntryYearMax] = useState<number>(ENTRY_YEARS[ENTRY_YEARS.length - 1]);

  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleUni = (uni: string) => {
    setSelectedUnis((prev) =>
      prev.includes(uni) ? prev.filter((u) => u !== uni) : [...prev, uni]
    );
  };

  const toggleMyUni = (uni: string) => {
    setMySelectedUnis((prev) =>
      prev.includes(uni) ? prev.filter((u) => u !== uni) : [...prev, uni]
    );
  };

  const handleCreate = async () => {
    setError(null);
    setCreating(true);
    try {
      const res = await createMeeting({
        meeting_type: meetingType,
        title: title.trim() || undefined,
        preferred_universities_any: preferAny,
        preferred_universities_raw: !preferAny && selectedUnis.length > 0
          ? selectedUnis.join(",")
          : undefined,
        entry_year_min: entryYearAny ? undefined : entryYearMin,
        entry_year_max: entryYearAny ? undefined : entryYearMax,
        my_team_universities_any: myPreferAny,
        my_team_universities_raw: !myPreferAny && mySelectedUnis.length > 0
          ? mySelectedUnis.join(",")
          : undefined,
        my_team_entry_year_min: myEntryYearAny ? undefined : myEntryYearMin,
        my_team_entry_year_max: myEntryYearAny ? undefined : myEntryYearMax,
      });
      onCreated(res.meeting_id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "미팅 생성 실패");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm sm:items-center" onClick={onClose}>
      <div className="w-full max-w-md rounded-t-3xl bg-white p-6 pb-8 shadow-2xl sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">새 미팅 만들기</h2>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            ✕
          </button>
        </div>

        <div className="space-y-5 max-h-[70vh] overflow-y-auto pb-1">
          {/* 제목 */}
          <div>
            <p className="mb-2.5 text-sm font-semibold text-gray-700">미팅 제목</p>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="예) 연고대 환영 3:3"
              maxLength={30}
              className="w-full rounded-xl border-2 border-gray-200 px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-400 focus:outline-none"
            />
          </div>

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

          {/* 우리팀 조건 구분선 */}
          <div className="flex items-center gap-2">
            <div className="flex-1 border-t border-gray-100" />
            <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full">우리팀 조건</span>
            <div className="flex-1 border-t border-gray-100" />
          </div>

          {/* 우리팀 학교 조건 */}
          <div>
            <p className="mb-2.5 text-sm font-semibold text-gray-700">우리팀 학교 조건</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { setMyPreferAny(true); setMySelectedUnis([]); }}
                className={`flex-1 rounded-xl py-2.5 text-sm border-2 font-medium transition-all ${
                  myPreferAny ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-gray-200 text-gray-500"
                }`}
              >
                🌍 아무 학교
              </button>
              <button
                type="button"
                onClick={() => setMyPreferAny(false)}
                className={`flex-1 rounded-xl py-2.5 text-sm border-2 font-medium transition-all ${
                  !myPreferAny ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-gray-200 text-gray-500"
                }`}
              >
                🏫 학교 선택
              </button>
            </div>

            {!myPreferAny && (
              <div className="mt-3 rounded-2xl border border-gray-100 bg-gray-50 p-3">
                <p className="mb-2 text-xs text-gray-400">원하는 학교를 선택하세요 (복수 선택 가능)</p>
                <div className="flex flex-wrap gap-1.5">
                  {UNIVERSITIES.map((uni) => (
                    <button
                      key={uni}
                      type="button"
                      onClick={() => toggleMyUni(uni)}
                      className={`rounded-full px-3 py-1.5 text-xs font-medium transition-all border ${
                        mySelectedUnis.includes(uni)
                          ? "border-emerald-400 bg-emerald-500 text-white"
                          : "border-gray-200 bg-white text-gray-600 hover:border-emerald-200"
                      }`}
                    >
                      {uni.replace("학교", "").replace("대학교", "대")}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 우리팀 학번 조건 */}
          <div>
            <p className="mb-2.5 text-sm font-semibold text-gray-700">우리팀 가능 학번</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setMyEntryYearAny(true)}
                className={`flex-1 rounded-xl py-2.5 text-sm border-2 font-medium transition-all ${
                  myEntryYearAny ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-gray-200 text-gray-500"
                }`}
              >
                🎓 전체 학번
              </button>
              <button
                type="button"
                onClick={() => setMyEntryYearAny(false)}
                className={`flex-1 rounded-xl py-2.5 text-sm border-2 font-medium transition-all ${
                  !myEntryYearAny ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-gray-200 text-gray-500"
                }`}
              >
                📅 학번 지정
              </button>
            </div>

            {!myEntryYearAny && (
              <div className="mt-3 rounded-2xl border border-gray-100 bg-gray-50 p-3">
                <p className="mb-2 text-xs text-gray-400">참가 가능 학번 범위를 선택하세요</p>
                <div className="flex items-center gap-2">
                  <select
                    value={myEntryYearMin}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      setMyEntryYearMin(v);
                      if (v > myEntryYearMax) setMyEntryYearMax(v);
                    }}
                    className="flex-1 rounded-lg border border-gray-200 bg-white px-2 py-2 text-sm text-center focus:outline-none focus:border-emerald-400"
                  >
                    {ENTRY_YEARS.map((y) => (
                      <option key={y} value={y}>{y}학번</option>
                    ))}
                  </select>
                  <span className="text-sm font-semibold text-gray-500">~</span>
                  <select
                    value={myEntryYearMax}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      setMyEntryYearMax(v);
                      if (v < myEntryYearMin) setMyEntryYearMin(v);
                    }}
                    className="flex-1 rounded-lg border border-gray-200 bg-white px-2 py-2 text-sm text-center focus:outline-none focus:border-emerald-400"
                  >
                    {ENTRY_YEARS.map((y) => (
                      <option key={y} value={y}>{y}학번</option>
                    ))}
                  </select>
                </div>
                <p className="mt-1.5 text-xs text-center text-emerald-600 font-medium">
                  {myEntryYearMin}학번 ~ {myEntryYearMax}학번
                </p>
              </div>
            )}
          </div>

          {/* 상대팀 조건 구분선 */}
          <div className="flex items-center gap-2">
            <div className="flex-1 border-t border-gray-100" />
            <span className="text-xs font-semibold text-blue-500 bg-blue-50 px-2.5 py-1 rounded-full">상대팀 조건</span>
            <div className="flex-1 border-t border-gray-100" />
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

          {/* 학번 범위 */}
          <div>
            <p className="mb-2.5 text-sm font-semibold text-gray-700">상대방 가능 학번</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setEntryYearAny(true)}
                className={`flex-1 rounded-xl py-2.5 text-sm border-2 font-medium transition-all ${
                  entryYearAny ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-200 text-gray-500"
                }`}
              >
                🎓 전체 학번
              </button>
              <button
                type="button"
                onClick={() => setEntryYearAny(false)}
                className={`flex-1 rounded-xl py-2.5 text-sm border-2 font-medium transition-all ${
                  !entryYearAny ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-200 text-gray-500"
                }`}
              >
                📅 학번 지정
              </button>
            </div>

            {!entryYearAny && (
              <div className="mt-3 rounded-2xl border border-gray-100 bg-gray-50 p-3">
                <p className="mb-2 text-xs text-gray-400">참가 가능 학번 범위를 선택하세요</p>
                <div className="flex items-center gap-2">
                  <select
                    value={entryYearMin}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      setEntryYearMin(v);
                      if (v > entryYearMax) setEntryYearMax(v);
                    }}
                    className="flex-1 rounded-lg border border-gray-200 bg-white px-2 py-2 text-sm text-center focus:outline-none focus:border-blue-400"
                  >
                    {ENTRY_YEARS.map((y) => (
                      <option key={y} value={y}>{y}학번</option>
                    ))}
                  </select>
                  <span className="text-sm font-semibold text-gray-500">~</span>
                  <select
                    value={entryYearMax}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      setEntryYearMax(v);
                      if (v < entryYearMin) setEntryYearMin(v);
                    }}
                    className="flex-1 rounded-lg border border-gray-200 bg-white px-2 py-2 text-sm text-center focus:outline-none focus:border-blue-400"
                  >
                    {ENTRY_YEARS.map((y) => (
                      <option key={y} value={y}>{y}학번</option>
                    ))}
                  </select>
                </div>
                <p className="mt-1.5 text-xs text-center text-blue-600 font-medium">
                  {entryYearMin}학번 ~ {entryYearMax}학번
                </p>
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

// ─────────────────────────────────────────────────────
// 미팅 완료 후기 & 애프터 신청 모달
// ─────────────────────────────────────────────────────

type PostMeetingStep =
  | { kind: "ask_after" }
  | { kind: "complaint" }
  | { kind: "profiles"; targets: AfterTarget[] }
  | { kind: "after"; target: AfterTarget };

function PostMeetingModal({ meetingId, startAt, userPhone, onClose }: {
  meetingId: number;
  startAt: "ask_after" | "complaint";
  userPhone: string | null;
  onClose: () => void;
}) {
  const [step, setStep] = useState<PostMeetingStep>(
    startAt === "complaint" ? { kind: "complaint" } : { kind: "ask_after" }
  );
  const [cachedTargets, setCachedTargets] = useState<AfterTarget[]>([]);
  const [complaint, setComplaint] = useState("");
  const [message, setMessage] = useState("");
  const [phone] = useState(userPhone ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAskAfterYes = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getAfterTargets(meetingId);
      setCachedTargets(res.targets);
      setStep({ kind: "profiles", targets: res.targets });
    } catch (e) {
      setError(e instanceof Error ? e.message : "오류가 발생했습니다");
    } finally {
      setLoading(false);
    }
  };

  const handleComplaintSubmit = async () => {
    setLoading(true);
    setError(null);
    try {
      await submitFeedback(meetingId, false, complaint);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "제출 실패");
    } finally {
      setLoading(false);
    }
  };

  const handleAfterSubmit = async (target: AfterTarget) => {
    if (!message.trim()) { setError("메시지를 입력해주세요"); return; }
    if (!phone.trim()) { setError("프로필에 전화번호가 등록되어 있지 않습니다"); return; }
    if (message.length > 50) { setError("메시지는 50자 이하로 입력해주세요"); return; }
    setLoading(true);
    setError(null);
    try {
      await submitAfterRequest(meetingId, target.user_id, message);
      alert(`${target.nickname || "상대방"}님께 애프터 신청을 보냈습니다!`);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "신청 실패");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md rounded-t-3xl bg-white p-6 pb-10 shadow-2xl max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">
            {step.kind === "ask_after" && "미팅은 잘 진행되었나요?"}
            {step.kind === "complaint" && "불편사항 접수"}
            {step.kind === "profiles" && "맘에 들었던 분에게 애프터를 신청해보세요"}
            {step.kind === "after" && "애프터 신청"}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
        </div>

        {error && (
          <div className="mb-4 rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-600">{error}</div>
        )}

        {step.kind === "ask_after" && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600 text-center">맘에 들었던 분께 애프터를 신청해보시겠습니까?</p>
            <div className="flex gap-3">
              <button
                onClick={handleAskAfterYes}
                disabled={loading}
                className="flex-1 rounded-2xl bg-purple-600 py-4 text-sm font-bold text-white hover:bg-purple-700 disabled:opacity-50"
              >
                {loading ? "로딩 중..." : "예 💌"}
              </button>
              <button
                onClick={onClose}
                disabled={loading}
                className="flex-1 rounded-2xl border border-gray-200 bg-white py-4 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                아니요
              </button>
            </div>
          </div>
        )}

        {step.kind === "complaint" && (
          <div className="space-y-4">
            <p className="text-xs text-gray-400">불편사항을 적어주세요. 내용은 관리자만 확인합니다.</p>
            <textarea
              value={complaint}
              onChange={(e) => setComplaint(e.target.value)}
              placeholder="불편했던 점을 자유롭게 작성해주세요..."
              rows={4}
              className="w-full resize-none rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-purple-400 focus:bg-white"
            />
            <button
              onClick={handleComplaintSubmit}
              disabled={loading}
              className="w-full rounded-xl bg-gray-800 py-3 text-sm font-bold text-white hover:bg-gray-900 disabled:opacity-50"
            >
              {loading ? "제출 중..." : "제출하기"}
            </button>
          </div>
        )}

        {step.kind === "profiles" && (
          <div className="space-y-3">
            {step.targets.length === 0 ? (
              <p className="py-8 text-center text-sm text-gray-400">상대방 프로필을 불러올 수 없습니다</p>
            ) : (
              step.targets.map((target) => (
                <div key={target.user_id} className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                  <div className="flex items-center gap-3">
                    {target.photo_url_1 ? (
                      <img src={target.photo_url_1} alt="" className="h-12 w-12 rounded-full object-cover" />
                    ) : (
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-200 text-gray-400 text-xl">👤</div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900 text-sm">{target.nickname || "익명"}</p>
                      <p className="text-xs text-gray-400 truncate">
                        {[target.university, target.entry_label, target.age ? `${target.age}세` : null].filter(Boolean).join(" · ")}
                      </p>
                      {target.bio_short && (
                        <p className="mt-0.5 text-xs text-gray-500 truncate">{target.bio_short}</p>
                      )}
                    </div>
                    <button
                      onClick={() => { setStep({ kind: "after", target }); setMessage(""); setError(null); }}
                      className="rounded-xl bg-pink-500 px-3 py-2 text-xs font-bold text-white hover:bg-pink-600 whitespace-nowrap"
                    >
                      💌 애프터
                    </button>
                  </div>
                </div>
              ))
            )}
            <button
              onClick={onClose}
              className="w-full rounded-xl border border-gray-200 py-3 text-sm text-gray-500 hover:bg-gray-50"
            >
              없음
            </button>
          </div>
        )}

        {step.kind === "after" && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-pink-100 bg-pink-50 p-3 text-xs text-pink-700">
              {step.target.nickname || "상대방"}님에게 애프터를 신청합니다
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-gray-700">메시지 (최대 50자)</label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="전하고 싶은 말을 적어주세요..."
                rows={3}
                maxLength={50}
                className="w-full resize-none rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-pink-400 focus:bg-white"
              />
              <p className="mt-1 text-right text-xs text-gray-400">{message.length}/50</p>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-gray-700">내 전화번호</label>
              <div className="flex items-center rounded-2xl border border-gray-200 bg-gray-100 px-4 py-3">
                <span className="flex-1 text-sm text-gray-700">{phone || "등록된 전화번호 없음"}</span>
                <span className="text-xs text-gray-400">자동 입력</span>
              </div>
              <p className="mt-1 text-xs text-gray-400">프로필의 휴대폰 번호가 상대방에게 전달됩니다</p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setStep({ kind: "profiles", targets: cachedTargets })}
                className="flex-1 rounded-xl border border-gray-200 py-3 text-sm text-gray-500 hover:bg-gray-50"
              >
                취소
              </button>
              <button
                onClick={() => handleAfterSubmit((step as { kind: "after"; target: AfterTarget }).target)}
                disabled={loading}
                className="flex-1 rounded-xl bg-pink-500 py-3 text-sm font-bold text-white hover:bg-pink-600 disabled:opacity-50"
              >
                {loading ? "신청 중..." : "신청하기"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
