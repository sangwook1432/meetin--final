"use client";

/**
 * /discover — 통합 둘러보기 페이지
 *
 * 기능:
 *  1. 참가 가능한 모든 미팅 표시 (이성/동성 호스트 통합)
 *  2. 필터: 전체 / 2:2 / 3:3 / 내 학교
 *  3. 미팅 생성 모달
 *  4. 미팅 카드 클릭 → /meetings/[id]
 *  5. 폴링: 30초마다 목록 자동 갱신
 *  6. 알림/완료 후기/애프터 모달, 미인증 안내 배너
 */

import { useEffect, useState, useCallback, Suspense, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import {
  discoverMeetings, vacanciesMeetings, createMeeting,
  getMyInvitations, respondToInvitation, replaceConfirm,
  pendingFriendRequests, acceptFriendRequest, rejectFriendRequest,
  getMyNotifications, markNotificationRead,
  submitFeedback, getAfterTargets, submitAfterRequest,
} from "@/lib/api";
import { AppShell } from "@/components/ui/AppShell";
import { MeetingCard } from "@/components/meeting/MeetingCard";
import type { MeetingListItem, MeetingType, AfterTarget } from "@/types";

type MeetingSource = "discover" | "vacancies";
type MergedMeeting = MeetingListItem & { _source: MeetingSource };
type FilterKey = "all" | "2x2" | "3x3" | "my_school";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "2x2", label: "2:2" },
  { key: "3x3", label: "3:3" },
  // { key: "my_school", label: "내 학교" }, // 유저 수 늘어나면 활성화
];

const UNIVERSITIES = [
  "서울대학교", "연세대학교", "고려대학교", "성균관대학교", "한양대학교",
  "중앙대학교", "경희대학교", "한국외국어대학교", "이화여자대학교", "숙명여자대학교",
  "서강대학교", "숭실대학교", "건국대학교", "동국대학교", "홍익대학교",
  "국민대학교", "세종대학교", "단국대학교", "아주대학교", "인하대학교",
];

const ENTRY_YEARS = [18, 19, 20, 21, 22, 23, 24, 25, 26];

export default function DiscoverPage() {
  return (
    <Suspense fallback={
      <div
        className="flex min-h-screen items-center justify-center text-sm"
        style={{ color: "var(--ink-soft)", background: "var(--bg)" }}
      >
        로딩 중...
      </div>
    }>
      <DiscoverPageInner />
    </Suspense>
  );
}

function DiscoverPageInner() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [filter, setFilter] = useState<FilterKey>("all");
  const [meetings, setMeetings] = useState<MergedMeeting[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [visitedIds, setVisitedIds] = useState<Set<number>>(new Set());

  const [showModal, setShowModal] = useState(false);

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
  const [replacePending, setReplacePending] = useState<{ inviteId: number; inviteeNick: string | null } | null>(null);
  const [replaceLoading, setReplaceLoading] = useState(false);

  const [postMeetingState, setPostMeetingState] = useState<{ meetingId: number; startAt: "ask_after" | "complaint" } | null>(null);

  const [docPending, setDocPending] = useState(false);

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

  useEffect(() => {
    const anyOpen = showModal || showNotifications || !!replacePending || postMeetingState !== null;
    document.body.style.overflow = anyOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [showModal, showNotifications, replacePending, postMeetingState]);

  useEffect(() => {
    if (user) {
      setDocPending(localStorage.getItem(`doc_pending_${user.id}`) === "1");
    }
  }, [user?.id]);

  // ─── 목록 불러오기 (둘러보기 + 빈자리 통합)
  const fetchMeetings = useCallback(async () => {
    try {
      const [discoverRes, vacancyRes] = await Promise.all([
        discoverMeetings(),
        vacanciesMeetings(),
      ]);
      const tagged: MergedMeeting[] = [
        ...discoverRes.meetings.map((m) => ({ ...m, _source: "discover" as const })),
        ...vacancyRes.meetings.map((m) => ({ ...m, _source: "vacancies" as const })),
      ];
      // meeting_id 기준 dedupe (드물지만 안전)
      const seen = new Set<number>();
      const merged: MergedMeeting[] = [];
      for (const m of tagged) {
        if (seen.has(m.meeting_id)) continue;
        seen.add(m.meeting_id);
        merged.push(m);
      }
      merged.sort((a, b) => b.meeting_id - a.meeting_id);
      setMeetings(merged);
      setListError(null);
    } catch (e) {
      setListError(e instanceof Error ? e.message : "목록 로드 실패");
    } finally {
      setListLoading(false);
    }
  }, []);

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
    setListLoading(true);
    fetchMeetings();
    fetchNotifications();
    const id = setInterval(() => { fetchMeetings(); fetchNotifications(); }, 30_000);
    return () => clearInterval(id);
  }, [authLoading, user, fetchMeetings, fetchNotifications, router]);

  const handleInviteAccept = (inv: { id: number; invite_type: string; inviter_nickname: string | null }) => {
    if (inv.invite_type === "REPLACE") {
      setReplacePending({ inviteId: inv.id, inviteeNick: inv.inviter_nickname });
    } else {
      handleFriendInviteAccept(inv.id);
    }
  };

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

  const handleInviteReject = async (inviteId: number) => {
    try {
      await respondToInvitation(inviteId, false);
      fetchNotifications();
    } catch (e) {
      alert(e instanceof Error ? e.message : "처리 실패");
    }
  };

  const handleReplaceConfirm = async () => {
    if (!replacePending) return;
    setReplaceLoading(true);
    try {
      const res = await replaceConfirm(replacePending.inviteId);
      setReplacePending(null);
      if (res.chat_room_id) router.push(`/chats/${res.chat_room_id}`);
      else router.push(`/meetings/${res.meeting_id}`);
    } catch (e) {
      alert(e instanceof Error ? e.message : "처리 실패");
    } finally {
      setReplaceLoading(false);
    }
  };

  const handleReplaceCancel = async () => {
    if (!replacePending) return;
    setReplacePending(null);
    await handleInviteReject(replacePending.inviteId);
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

  // ─── 클라이언트 필터링 ────────────────────────────────────
  const filteredMeetings = useMemo(() => {
    if (filter === "all") return meetings;
    if (filter === "2x2") return meetings.filter((m) => m.meeting_type === "TWO_BY_TWO");
    if (filter === "3x3") return meetings.filter((m) => m.meeting_type === "THREE_BY_THREE");
    // 내 학교: 내가 들어갈 팀의 학교 조건이 명시적으로 내 학교를 포함하는 경우
    if (filter === "my_school") {
      const myUni = user?.university?.trim();
      if (!myUni) return [];
      return meetings.filter((m) => {
        // 내가 속할 팀의 학교 필터를 결정
        // discover (이성 호스트) → 내가 상대팀 → preferred_universities_*
        // vacancies (동성 호스트) → 내가 호스트팀 → my_team_universities_*
        const isAny = m._source === "discover"
          ? m.preferred_universities_any
          : m.my_team_universities_any;
        const raw = m._source === "discover"
          ? m.preferred_universities_raw
          : m.my_team_universities_raw;
        if (isAny) return false;
        if (!raw) return false;
        const allowed = raw.split(",").map((u) => u.trim()).filter(Boolean);
        return allowed.includes(myUni);
      });
    }
    return meetings;
  }, [meetings, filter, user?.university]);

  if (authLoading) {
    return (
      <div
        className="flex min-h-screen items-center justify-center text-sm"
        style={{ color: "var(--ink-soft)", background: "var(--bg)" }}
      >
        로딩 중...
      </div>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-md px-5 pt-5">
        {/* 인사 + 액션 */}
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h1
              className="font-extrabold"
              style={{ fontSize: 24, color: "var(--ink)", letterSpacing: "-0.03em", lineHeight: 1.2 }}
            >
              안녕하세요{user?.nickname ? `, ${user.nickname}님` : ""}
            </h1>
            <p
              style={{ fontSize: 13, color: "var(--ink-mid)", marginTop: 4 }}
            >
              참여할 수 있는 <b style={{ color: "var(--accent)" }}>미팅 {meetings.length}개</b>가 있어요
            </p>
          </div>
          <button
            onClick={() => setShowNotifications(true)}
            className="relative flex items-center justify-center"
            style={{
              width: 40, height: 40,
              borderRadius: "50%",
              background: "var(--surface)",
              border: "1px solid var(--border)",
              color: "var(--ink)",
            }}
            aria-label="알림"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M6 8a6 6 0 1112 0c0 7 3 9 3 9H3s3-2 3-9z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M10 21a2 2 0 004 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
            </svg>
            {totalNotifications > 0 && (
              <span
                className="absolute flex items-center justify-center font-bold text-white"
                style={{
                  top: -4, right: -4,
                  minWidth: 18, height: 18, padding: "0 5px",
                  borderRadius: 999,
                  background: "var(--danger)",
                  fontSize: 10,
                }}
              >
                {totalNotifications}
              </span>
            )}
          </button>
        </div>

        {/* 미인증 안내 배너 */}
        {user?.verification_status !== "VERIFIED" && !docPending && (
          <button
            onClick={() => router.push("/me/docs")}
            className="mb-4 w-full text-left px-4 py-3"
            style={{
              background: "var(--warning-soft)",
              border: "1px solid var(--warning)",
              borderRadius: "var(--radius-md)",
            }}
          >
            <p className="text-sm font-bold" style={{ color: "oklch(0.45 0.14 70)" }}>
              ⚠️ 재학 인증이 필요합니다
            </p>
            <p className="mt-0.5" style={{ fontSize: 12, color: "var(--ink-mid)" }}>
              미팅에 참가하려면 재학증명서를 제출해야 합니다 →
            </p>
          </button>
        )}
        {user?.verification_status !== "VERIFIED" && docPending && (
          <div
            className="mb-4 px-4 py-3"
            style={{
              background: "var(--accent-soft)",
              border: "1px solid var(--accent)",
              borderRadius: "var(--radius-md)",
            }}
          >
            <p className="text-sm font-bold" style={{ color: "var(--accent-ink)" }}>
              ⏳ 재학 인증 검토 중
            </p>
            <p className="mt-0.5" style={{ fontSize: 12, color: "var(--ink-mid)" }}>
              서류를 제출했습니다. 관리자 검토 후 인증이 완료됩니다.
            </p>
          </div>
        )}

        {/* 필터 칩 + 미팅 만들기 */}
        <div className="mb-4 flex items-center gap-2">
          <div
            className="flex flex-1 gap-1.5 overflow-x-auto no-scrollbar"
          >
            {FILTERS.map((f) => {
              const on = filter === f.key;
              return (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  className="font-semibold transition-all whitespace-nowrap active:scale-95"
                  style={{
                    padding: "7px 14px",
                    borderRadius: 999,
                    border: `1px solid ${on ? "var(--accent)" : "var(--border)"}`,
                    background: on ? "var(--accent)" : "var(--surface)",
                    color: on ? "var(--ink-on-accent)" : "var(--ink-mid)",
                    fontSize: 13,
                    letterSpacing: "-0.01em",
                  }}
                >
                  {f.label}
                </button>
              );
            })}
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-1 px-3.5 py-2.5 font-bold text-white transition-all active:scale-95 whitespace-nowrap shrink-0"
            style={{
              background: "var(--accent)",
              borderRadius: 999,
              fontSize: 12,
              boxShadow: "var(--shadow-sm)",
              letterSpacing: "-0.01em",
            }}
          >
            <span style={{ fontSize: 14, lineHeight: 1 }}>+</span>
            미팅 만들기
          </button>
        </div>

        {/* 목록 */}
        {listLoading ? (
          <div className="flex flex-col gap-3">
            {[...Array(3)].map((_, i) => (
              <div
                key={i}
                className="animate-pulse"
                style={{
                  height: 132,
                  background: "var(--surface-muted)",
                  borderRadius: "var(--radius-lg)",
                }}
              />
            ))}
          </div>
        ) : listError ? (
          <div
            className="px-4 py-6 text-center"
            style={{
              background: "var(--danger-soft)",
              border: "1px solid var(--danger)",
              borderRadius: "var(--radius-lg)",
            }}
          >
            <p className="text-sm" style={{ color: "var(--danger)" }}>{listError}</p>
            <button
              onClick={fetchMeetings}
              className="mt-3 underline text-sm font-semibold"
              style={{ color: "var(--accent)" }}
            >
              다시 시도
            </button>
          </div>
        ) : filteredMeetings.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <span className="text-5xl">🔍</span>
            <p className="text-base font-bold" style={{ color: "var(--ink)" }}>
              {filter === "all" ? "참여 가능한 미팅이 없어요" :
               filter === "my_school" ? "내 학교 조건의 미팅이 없어요" :
               `${filter === "2x2" ? "2:2" : "3:3"} 미팅이 없어요`}
            </p>
            <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
              {filter === "all"
                ? "먼저 미팅을 만들어보세요!"
                : "다른 필터를 선택하거나 미팅을 만들어보세요"}
            </p>
            {filter === "all" ? (
              <button
                onClick={() => setShowModal(true)}
                className="mt-2 px-6 py-2.5 font-bold text-white transition-all active:scale-95"
                style={{
                  background: "var(--accent)",
                  borderRadius: "var(--radius-md)",
                  fontSize: 13,
                }}
              >
                미팅 만들기
              </button>
            ) : (
              <button
                onClick={() => setFilter("all")}
                className="mt-2 px-6 py-2.5 font-semibold transition-all"
                style={{
                  border: "1px solid var(--accent)",
                  color: "var(--accent)",
                  borderRadius: "var(--radius-md)",
                  fontSize: 13,
                }}
              >
                전체 보기 →
              </button>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {filteredMeetings.map((m) => (
              <MeetingCard
                key={m.meeting_id}
                meeting={m}
                visited={visitedIds.has(m.meeting_id)}
                onClick={() => { markVisited(m.meeting_id); router.push(`/meetings/${m.meeting_id}`); }}
                variant="vacancy"
              />
            ))}
          </div>
        )}
      </div>

      {/* 미팅 생성 모달 */}
      {showModal && (
        <CreateMeetingModal
          onClose={() => setShowModal(false)}
          onCreated={(id) => { setShowModal(false); router.push(`/meetings/${id}`); }}
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

      {/* 미팅 완료 후기/애프터 모달 */}
      {postMeetingState !== null && (
        <PostMeetingModal
          meetingId={postMeetingState.meetingId}
          startAt={postMeetingState.startAt}
          userPhone={user?.phone ?? null}
          onClose={() => setPostMeetingState(null)}
        />
      )}

      {/* 매칭권 소모 확인 (REPLACE) */}
      {replacePending && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 animate-fade-in"
          onClick={() => setReplacePending(null)}
        >
          <div
            className="w-full max-w-sm p-6"
            style={{
              background: "var(--surface)",
              borderRadius: "var(--radius-xl)",
              boxShadow: "var(--shadow-lg)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <p className="font-bold" style={{ fontSize: 16, color: "var(--ink)" }}>매칭권 소모 확인</p>
              <button
                onClick={() => setReplacePending(null)}
                className="flex items-center justify-center"
                style={{ width: 28, height: 28, color: "var(--ink-soft)" }}
              >✕</button>
            </div>
            <p
              className="mt-3 text-center leading-relaxed"
              style={{ fontSize: 13, color: "var(--ink-mid)" }}
            >
              {replacePending.inviteeNick || "누군가"}님이 초대한 미팅에 참가하려면<br />
              <span className="font-bold" style={{ color: "var(--accent)" }}>매칭권 1개</span>를 소모해야 합니다.
            </p>
            <div className="mt-5 flex gap-3">
              <button
                onClick={handleReplaceCancel}
                disabled={replaceLoading}
                className="flex-1 py-3 font-semibold disabled:opacity-50"
                style={{
                  fontSize: 13,
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-md)",
                  color: "var(--ink-mid)",
                }}
              >
                아니요 (거절)
              </button>
              <button
                onClick={handleReplaceConfirm}
                disabled={replaceLoading}
                className="flex-1 py-3 font-bold text-white disabled:opacity-50"
                style={{
                  fontSize: 13,
                  background: "var(--accent)",
                  borderRadius: "var(--radius-md)",
                }}
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

// ─────────────────────────────────────────────────────────
// 알림 모달 (V1 스타일)
// ─────────────────────────────────────────────────────────

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
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 animate-fade-in" onClick={onClose}>
      <div
        className="w-full max-w-md p-6 pb-10 max-h-[80vh] overflow-y-auto animate-slide-up"
        style={{
          background: "var(--surface)",
          borderTopLeftRadius: "var(--radius-xl)",
          borderTopRightRadius: "var(--radius-xl)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="font-bold" style={{ fontSize: 18, color: "var(--ink)" }}>
            알림 {total > 0 && <span style={{ color: "var(--danger)" }}>({total})</span>}
          </h2>
          <button onClick={onClose} style={{ color: "var(--ink-soft)", fontSize: 20 }}>✕</button>
        </div>

        {total === 0 ? (
          <div className="py-8 text-center">
            <p className="text-sm" style={{ color: "var(--ink-soft)" }}>새로운 알림이 없습니다</p>
          </div>
        ) : (
          <div className="space-y-3">
            {pendingInvites.map((inv) => {
              const isReplace = inv.invite_type === "REPLACE";
              const isDepositPending = inv.status === "DEPOSIT_PENDING";
              return (
                <div key={inv.id} className="p-4" style={notifBoxStyle("var(--accent-soft)", "var(--accent)")}>
                  <p className="text-sm font-bold" style={{ color: "var(--accent-ink)" }}>
                    {isReplace ? "🔄 대체 인원 초대" : "👥 미팅 초대"}
                  </p>
                  <p className="mt-1 text-xs" style={{ color: "var(--ink-mid)" }}>
                    {inv.inviter_nickname || "누군가"}님이 미팅 #{inv.meeting_id}에 초대했습니다
                  </p>
                  {isDepositPending && (
                    <p className="mt-1 text-xs font-bold" style={{ color: "oklch(0.55 0.16 70)" }}>
                      ⏳ 매칭권 납부 대기 중
                    </p>
                  )}
                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={() => onInviteAccept(inv)}
                      className="flex-1 py-2 text-xs font-bold text-white"
                      style={{ background: "var(--accent)", borderRadius: "var(--radius-md)" }}
                    >
                      {isReplace ? (isDepositPending ? "매칭권 납부" : "수락") : "수락"}
                    </button>
                    {!isDepositPending && (
                      <button
                        onClick={() => onInviteReject(inv.id)}
                        className="flex-1 py-2 text-xs font-medium"
                        style={{
                          background: "var(--surface)",
                          border: "1px solid var(--border)",
                          color: "var(--ink-mid)",
                          borderRadius: "var(--radius-md)",
                        }}
                      >
                        거절
                      </button>
                    )}
                  </div>
                </div>
              );
            })}

            {pendingFriends.map((req) => (
              <div key={req.friendship_id} className="p-4" style={notifBoxStyle("var(--success-soft)", "var(--success)")}>
                <p className="text-sm font-bold" style={{ color: "var(--success)" }}>👤 친구 요청</p>
                <p className="mt-1 text-xs" style={{ color: "var(--ink-mid)" }}>
                  {req.nickname || `유저 #${req.requester_id}`}님이 친구 요청을 보냈습니다
                </p>
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => onFriendAccept(req.friendship_id)}
                    className="flex-1 py-2 text-xs font-bold text-white"
                    style={{ background: "var(--success)", borderRadius: "var(--radius-md)" }}
                  >
                    수락
                  </button>
                  <button
                    onClick={() => onFriendReject(req.friendship_id)}
                    className="flex-1 py-2 text-xs font-medium"
                    style={{
                      background: "var(--surface)",
                      border: "1px solid var(--border)",
                      color: "var(--ink-mid)",
                      borderRadius: "var(--radius-md)",
                    }}
                  >
                    거절
                  </button>
                </div>
              </div>
            ))}

            {systemNotifs.map((notif) => {
              if (notif.notif_type === "MEETING_COMPLETED" && notif.meeting_id) {
                return (
                  <div key={notif.id} className="p-4" style={notifBoxStyle("oklch(0.94 0.04 290)", "oklch(0.55 0.18 290)")}>
                    <p className="text-sm font-bold" style={{ color: "oklch(0.45 0.18 290)" }}>✨ 미팅 완료</p>
                    <p className="mt-1 text-xs" style={{ color: "var(--ink-mid)" }}>{notif.message}</p>
                    <div className="mt-3 flex gap-2">
                      <button
                        onClick={() => onMeetingCompleted(notif.id, notif.meeting_id!)}
                        className="flex-1 py-2 text-xs font-bold text-white"
                        style={{ background: "oklch(0.55 0.18 290)", borderRadius: "var(--radius-md)" }}
                      >
                        예
                      </button>
                      <button
                        onClick={() => onMeetingCompleted(notif.id, notif.meeting_id!, "complaint")}
                        className="flex-1 py-2 text-xs font-medium"
                        style={{
                          background: "var(--surface)",
                          border: "1px solid var(--border)",
                          color: "var(--ink-mid)",
                          borderRadius: "var(--radius-md)",
                        }}
                      >
                        아니요
                      </button>
                    </div>
                  </div>
                );
              }
              if (notif.notif_type === "AFTER_REQUEST_RECEIVED") {
                return (
                  <div key={notif.id} className="p-4" style={notifBoxStyle("oklch(0.95 0.04 0)", "oklch(0.7 0.15 10)")}>
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-bold" style={{ color: "oklch(0.5 0.15 10)" }}>💌 애프터 신청</p>
                      <button onClick={() => onSystemNotifDismiss(notif.id)} style={{ color: "var(--ink-soft)", fontSize: 14 }}>✕</button>
                    </div>
                    <p className="mt-1 text-xs" style={{ color: "var(--ink-mid)" }}>{notif.message}</p>
                    <button
                      onClick={() => { onSystemNotifDismiss(notif.id); window.location.href = "/me/messages"; }}
                      className="mt-3 w-full py-2 text-xs font-bold text-white"
                      style={{ background: "oklch(0.7 0.15 10)", borderRadius: "var(--radius-md)" }}
                    >
                      쪽지함 보기
                    </button>
                  </div>
                );
              }
              if (notif.notif_type === "CHAT_ROOM_ACTIVATED") {
                return (
                  <div key={notif.id} className="p-4" style={notifBoxStyle("var(--success-soft)", "var(--success)")}>
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-bold" style={{ color: "var(--success)" }}>💬 채팅방 활성화</p>
                      <button onClick={() => onSystemNotifDismiss(notif.id)} style={{ color: "var(--ink-soft)", fontSize: 14 }}>✕</button>
                    </div>
                    <p className="mt-1 text-xs" style={{ color: "var(--ink-mid)" }}>{notif.message}</p>
                    <button
                      onClick={() => {
                        onSystemNotifDismiss(notif.id);
                        if (notif.meeting_id) router.push(`/meetings/${notif.meeting_id}`);
                      }}
                      className="mt-3 w-full py-2 text-xs font-bold text-white"
                      style={{ background: "var(--success)", borderRadius: "var(--radius-md)" }}
                    >
                      채팅방 입장 →
                    </button>
                  </div>
                );
              }
              if (notif.notif_type === "WAITING_CONFIRM") {
                return (
                  <div key={notif.id} className="p-4" style={notifBoxStyle("var(--warning-soft)", "var(--warning)")}>
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-bold" style={{ color: "oklch(0.45 0.14 70)" }}>🎉 인원 충족</p>
                      <button onClick={() => onSystemNotifDismiss(notif.id)} style={{ color: "var(--ink-soft)", fontSize: 14 }}>✕</button>
                    </div>
                    <p className="mt-1 text-xs" style={{ color: "var(--ink-mid)" }}>{notif.message}</p>
                    {notif.meeting_id && (
                      <button
                        onClick={() => {
                          onSystemNotifDismiss(notif.id);
                          router.push(`/meetings/${notif.meeting_id}`);
                        }}
                        className="mt-3 w-full py-2 text-xs font-bold text-white"
                        style={{ background: "var(--warning)", borderRadius: "var(--radius-md)" }}
                      >
                        미팅 확인하기 →
                      </button>
                    )}
                  </div>
                );
              }
              if (notif.notif_type === "ACCOUNT_PENALTY") {
                return (
                  <div key={notif.id} className="p-4" style={notifBoxStyle("var(--danger-soft)", "var(--danger)")}>
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-bold" style={{ color: "var(--danger)" }}>🚨 계정 제재</p>
                      <button onClick={() => onSystemNotifDismiss(notif.id)} style={{ color: "var(--ink-soft)", fontSize: 14 }}>✕</button>
                    </div>
                    <p className="mt-1 text-xs" style={{ color: "var(--ink-mid)" }}>{notif.message}</p>
                  </div>
                );
              }
              return (
                <div key={notif.id} className="p-4" style={notifBoxStyle("var(--warning-soft)", "var(--warning)")}>
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-bold" style={{ color: "oklch(0.45 0.14 70)" }}>⚠️ 미팅 취소</p>
                    <button onClick={() => onSystemNotifDismiss(notif.id)} style={{ color: "var(--ink-soft)", fontSize: 14 }}>✕</button>
                  </div>
                  <p className="mt-1 text-xs" style={{ color: "var(--ink-mid)" }}>{notif.message}</p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function notifBoxStyle(bg: string, border: string): React.CSSProperties {
  return {
    background: bg,
    border: `1px solid ${border}`,
    borderRadius: "var(--radius-lg)",
  };
}

// ─────────────────────────────────────────────────────────
// 미팅 생성 모달 (V1 스타일, 모든 기존 기능 유지)
// ─────────────────────────────────────────────────────────

interface CreateMeetingModalProps {
  onClose: () => void;
  onCreated: (meetingId: number) => void;
}

function CreateMeetingModal({ onClose, onCreated }: CreateMeetingModalProps) {
  const [meetingType, setMeetingType] = useState<MeetingType>("TWO_BY_TWO");
  const [title, setTitle] = useState("");

  const [preferAny, setPreferAny] = useState(true);
  const [selectedUnis, setSelectedUnis] = useState<string[]>([]);
  const [entryYearAny, setEntryYearAny] = useState(true);
  const [entryYearMin, setEntryYearMin] = useState<number>(ENTRY_YEARS[0]);
  const [entryYearMax, setEntryYearMax] = useState<number>(ENTRY_YEARS[ENTRY_YEARS.length - 1]);

  const [myPreferAny, setMyPreferAny] = useState(true);
  const [mySelectedUnis, setMySelectedUnis] = useState<string[]>([]);
  const [myEntryYearAny, setMyEntryYearAny] = useState(true);
  const [myEntryYearMin, setMyEntryYearMin] = useState<number>(ENTRY_YEARS[0]);
  const [myEntryYearMax, setMyEntryYearMax] = useState<number>(ENTRY_YEARS[ENTRY_YEARS.length - 1]);

  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleUni = (uni: string) =>
    setSelectedUnis((prev) => prev.includes(uni) ? prev.filter((u) => u !== uni) : [...prev, uni]);
  const toggleMyUni = (uni: string) =>
    setMySelectedUnis((prev) => prev.includes(uni) ? prev.filter((u) => u !== uni) : [...prev, uni]);

  const handleCreate = async () => {
    setError(null);
    setCreating(true);
    try {
      const res = await createMeeting({
        meeting_type: meetingType,
        title: title.trim() || undefined,
        preferred_universities_any: preferAny,
        preferred_universities_raw: !preferAny && selectedUnis.length > 0 ? selectedUnis.join(",") : undefined,
        entry_year_min: entryYearAny ? undefined : entryYearMin,
        entry_year_max: entryYearAny ? undefined : entryYearMax,
        my_team_universities_any: myPreferAny,
        my_team_universities_raw: !myPreferAny && mySelectedUnis.length > 0 ? mySelectedUnis.join(",") : undefined,
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
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 animate-fade-in sm:items-center" onClick={onClose}>
      <div
        className="w-full max-w-md p-6 pb-8 animate-slide-up"
        style={{
          background: "var(--surface)",
          borderTopLeftRadius: "var(--radius-xl)",
          borderTopRightRadius: "var(--radius-xl)",
          boxShadow: "var(--shadow-lg)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="font-bold" style={{ fontSize: 18, color: "var(--ink)", letterSpacing: "-0.02em" }}>
            새 미팅 만들기
          </h2>
          <button
            onClick={onClose}
            className="flex items-center justify-center"
            style={{ width: 32, height: 32, borderRadius: 999, color: "var(--ink-soft)" }}
          >
            ✕
          </button>
        </div>

        <div className="space-y-5 max-h-[70vh] overflow-y-auto pb-1 no-scrollbar">
          <FormField label="미팅 제목">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="예) 연고대 환영 3:3"
              maxLength={30}
              className="w-full px-4 py-3 outline-none"
              style={{
                fontSize: 14,
                background: "var(--surface)",
                border: "1.5px solid var(--border)",
                borderRadius: "var(--radius-md)",
                color: "var(--ink)",
                fontFamily: "var(--font-sans)",
                letterSpacing: "-0.01em",
              }}
            />
          </FormField>

          <FormField label="미팅 유형">
            <div className="grid grid-cols-2 gap-2.5">
              {(["TWO_BY_TWO", "THREE_BY_THREE"] as MeetingType[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setMeetingType(t)}
                  className="py-4 text-center transition-all"
                  style={{
                    border: `1.5px solid ${meetingType === t ? "var(--accent)" : "var(--border)"}`,
                    background: meetingType === t ? "var(--accent-soft)" : "var(--surface)",
                    borderRadius: "var(--radius-md)",
                  }}
                >
                  <div className="font-extrabold" style={{ fontSize: 22, color: "var(--ink)", letterSpacing: "-0.02em" }}>
                    {t === "TWO_BY_TWO" ? "2 : 2" : "3 : 3"}
                  </div>
                  <div
                    className="font-medium mt-1"
                    style={{
                      fontSize: 11,
                      color: meetingType === t ? "var(--accent-ink)" : "var(--ink-soft)",
                    }}
                  >
                    {t === "TWO_BY_TWO" ? "2명씩 미팅" : "3명씩 미팅"}
                  </div>
                </button>
              ))}
            </div>
          </FormField>

          <Divider label="우리팀 조건" tone="success" />

          <ToggleSection
            label="우리팀 학교 조건"
            anyValue={myPreferAny}
            onAnyChange={(v) => { setMyPreferAny(v); if (v) setMySelectedUnis([]); }}
            anyLabel="🌍 아무 학교"
            specificLabel="🏫 학교 선택"
          >
            <UnisGrid universities={UNIVERSITIES} selected={mySelectedUnis} onToggle={toggleMyUni} />
          </ToggleSection>

          <ToggleSection
            label="우리팀 가능 학번"
            anyValue={myEntryYearAny}
            onAnyChange={setMyEntryYearAny}
            anyLabel="🎓 전체 학번"
            specificLabel="📅 학번 지정"
          >
            <YearRange
              min={myEntryYearMin}
              max={myEntryYearMax}
              setMin={setMyEntryYearMin}
              setMax={setMyEntryYearMax}
            />
          </ToggleSection>

          <Divider label="상대팀 조건" tone="accent" />

          <ToggleSection
            label="상대방 학교 선호"
            anyValue={preferAny}
            onAnyChange={(v) => { setPreferAny(v); if (v) setSelectedUnis([]); }}
            anyLabel="🌍 아무 학교"
            specificLabel="🏫 학교 선택"
          >
            <UnisGrid universities={UNIVERSITIES} selected={selectedUnis} onToggle={toggleUni} />
          </ToggleSection>

          <ToggleSection
            label="상대방 가능 학번"
            anyValue={entryYearAny}
            onAnyChange={setEntryYearAny}
            anyLabel="🎓 전체 학번"
            specificLabel="📅 학번 지정"
          >
            <YearRange
              min={entryYearMin}
              max={entryYearMax}
              setMin={setEntryYearMin}
              setMax={setEntryYearMax}
            />
          </ToggleSection>

          {error && (
            <div
              className="px-4 py-3 text-sm"
              style={{
                background: "var(--danger-soft)",
                border: "1px solid var(--danger)",
                color: "var(--danger)",
                borderRadius: "var(--radius-md)",
              }}
            >
              {error}
            </div>
          )}

          <button
            onClick={handleCreate}
            disabled={creating}
            className="w-full py-3.5 font-bold text-white disabled:opacity-50 transition-all active:scale-[0.99]"
            style={{
              fontSize: 14,
              background: "var(--ink)",
              borderRadius: "var(--radius-md)",
              letterSpacing: "-0.01em",
            }}
          >
            {creating ? "생성 중..." : "미팅 만들기 →"}
          </button>
        </div>
      </div>
    </div>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 font-semibold" style={{ fontSize: 12, color: "var(--ink-mid)", letterSpacing: "-0.01em" }}>
        {label}
      </p>
      {children}
    </div>
  );
}

function Divider({ label, tone }: { label: string; tone: "success" | "accent" }) {
  const color = tone === "success" ? "var(--success)" : "var(--accent)";
  const bg = tone === "success" ? "var(--success-soft)" : "var(--accent-soft)";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 border-t" style={{ borderColor: "var(--border)" }} />
      <span
        className="font-bold"
        style={{
          fontSize: 11,
          letterSpacing: "-0.01em",
          color,
          background: bg,
          padding: "4px 10px",
          borderRadius: 999,
        }}
      >
        {label}
      </span>
      <div className="flex-1 border-t" style={{ borderColor: "var(--border)" }} />
    </div>
  );
}

function ToggleSection({
  label, anyValue, onAnyChange, anyLabel, specificLabel, children,
}: {
  label: string;
  anyValue: boolean;
  onAnyChange: (v: boolean) => void;
  anyLabel: string;
  specificLabel: string;
  children: React.ReactNode;
}) {
  return (
    <FormField label={label}>
      <div className="flex gap-2">
        <button
          onClick={() => onAnyChange(true)}
          className="flex-1 py-2.5 font-medium transition-all"
          style={{
            fontSize: 13,
            border: `1.5px solid ${anyValue ? "var(--accent)" : "var(--border)"}`,
            background: anyValue ? "var(--accent-soft)" : "var(--surface)",
            color: anyValue ? "var(--accent-ink)" : "var(--ink-soft)",
            borderRadius: "var(--radius-md)",
          }}
        >
          {anyLabel}
        </button>
        <button
          onClick={() => onAnyChange(false)}
          className="flex-1 py-2.5 font-medium transition-all"
          style={{
            fontSize: 13,
            border: `1.5px solid ${!anyValue ? "var(--accent)" : "var(--border)"}`,
            background: !anyValue ? "var(--accent-soft)" : "var(--surface)",
            color: !anyValue ? "var(--accent-ink)" : "var(--ink-soft)",
            borderRadius: "var(--radius-md)",
          }}
        >
          {specificLabel}
        </button>
      </div>
      {!anyValue && (
        <div
          className="mt-3 p-3"
          style={{
            background: "var(--surface-muted)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-md)",
          }}
        >
          {children}
        </div>
      )}
    </FormField>
  );
}

function UnisGrid({
  universities, selected, onToggle,
}: { universities: string[]; selected: string[]; onToggle: (u: string) => void }) {
  return (
    <>
      <p className="mb-2 text-xs" style={{ color: "var(--ink-soft)" }}>
        원하는 학교를 선택하세요 (복수 선택 가능)
      </p>
      <div className="flex flex-wrap gap-1.5">
        {universities.map((uni) => {
          const on = selected.includes(uni);
          return (
            <button
              key={uni}
              onClick={() => onToggle(uni)}
              className="px-3 py-1.5 font-medium transition-all"
              style={{
                fontSize: 12,
                border: `1px solid ${on ? "var(--accent)" : "var(--border)"}`,
                background: on ? "var(--accent)" : "var(--surface)",
                color: on ? "var(--ink-on-accent)" : "var(--ink-mid)",
                borderRadius: 999,
                letterSpacing: "-0.01em",
              }}
            >
              {uni.replace("학교", "").replace("대학교", "대")}
            </button>
          );
        })}
      </div>
    </>
  );
}

function YearRange({
  min, max, setMin, setMax,
}: { min: number; max: number; setMin: (n: number) => void; setMax: (n: number) => void }) {
  return (
    <>
      <p className="mb-2 text-xs" style={{ color: "var(--ink-soft)" }}>
        참가 가능 학번 범위를 선택하세요
      </p>
      <div className="flex items-center gap-2">
        <select
          value={min}
          onChange={(e) => {
            const v = Number(e.target.value);
            setMin(v);
            if (v > max) setMax(v);
          }}
          className="flex-1 px-2 py-2 text-center outline-none"
          style={{
            fontSize: 13,
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-sm)",
            color: "var(--ink)",
            fontFamily: "var(--font-sans)",
          }}
        >
          {ENTRY_YEARS.map((y) => <option key={y} value={y}>{y}학번</option>)}
        </select>
        <span className="text-sm font-semibold" style={{ color: "var(--ink-soft)" }}>~</span>
        <select
          value={max}
          onChange={(e) => {
            const v = Number(e.target.value);
            setMax(v);
            if (v < min) setMin(v);
          }}
          className="flex-1 px-2 py-2 text-center outline-none"
          style={{
            fontSize: 13,
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-sm)",
            color: "var(--ink)",
            fontFamily: "var(--font-sans)",
          }}
        >
          {ENTRY_YEARS.map((y) => <option key={y} value={y}>{y}학번</option>)}
        </select>
      </div>
      <p
        className="mt-1.5 text-center font-medium"
        style={{ fontSize: 11, color: "var(--accent-ink)" }}
      >
        {min}학번 ~ {max}학번
      </p>
    </>
  );
}

// ─────────────────────────────────────────────────────────
// 미팅 완료 후기/애프터 모달 (V1 스타일)
// ─────────────────────────────────────────────────────────

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
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 animate-fade-in" onClick={onClose}>
      <div
        className="w-full max-w-md p-6 pb-10 max-h-[85vh] overflow-y-auto animate-slide-up"
        style={{
          background: "var(--surface)",
          borderTopLeftRadius: "var(--radius-xl)",
          borderTopRightRadius: "var(--radius-xl)",
          boxShadow: "var(--shadow-lg)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="font-bold" style={{ fontSize: 18, color: "var(--ink)" }}>
            {step.kind === "ask_after" && "미팅은 잘 진행되었나요?"}
            {step.kind === "complaint" && "불편사항 접수"}
            {step.kind === "profiles" && "맘에 들었던 분에게 애프터를 신청해보세요"}
            {step.kind === "after" && "애프터 신청"}
          </h2>
          <button onClick={onClose} style={{ color: "var(--ink-soft)", fontSize: 20 }}>✕</button>
        </div>

        {error && (
          <div
            className="mb-4 px-3 py-2 text-xs"
            style={{
              background: "var(--danger-soft)",
              border: "1px solid var(--danger)",
              color: "var(--danger)",
              borderRadius: "var(--radius-md)",
            }}
          >
            {error}
          </div>
        )}

        {step.kind === "ask_after" && (
          <div className="space-y-4">
            <p className="text-sm text-center" style={{ color: "var(--ink-mid)" }}>
              맘에 들었던 분께 애프터를 신청해보시겠습니까?
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleAskAfterYes}
                disabled={loading}
                className="flex-1 py-4 text-sm font-bold text-white disabled:opacity-50"
                style={{ background: "var(--accent)", borderRadius: "var(--radius-lg)" }}
              >
                {loading ? "로딩 중..." : "예 💌"}
              </button>
              <button
                onClick={onClose}
                disabled={loading}
                className="flex-1 py-4 text-sm font-semibold disabled:opacity-50"
                style={{
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  color: "var(--ink-mid)",
                  borderRadius: "var(--radius-lg)",
                }}
              >
                아니요
              </button>
            </div>
          </div>
        )}

        {step.kind === "complaint" && (
          <div className="space-y-4">
            <p className="text-xs" style={{ color: "var(--ink-soft)" }}>
              불편사항을 적어주세요. 내용은 관리자만 확인합니다.
            </p>
            <textarea
              value={complaint}
              onChange={(e) => setComplaint(e.target.value)}
              placeholder="불편했던 점을 자유롭게 작성해주세요..."
              rows={4}
              className="w-full resize-none px-4 py-3 outline-none"
              style={{
                fontSize: 13,
                background: "var(--surface-muted)",
                border: "1px solid var(--border)",
                color: "var(--ink)",
                borderRadius: "var(--radius-md)",
                fontFamily: "var(--font-sans)",
              }}
            />
            <button
              onClick={handleComplaintSubmit}
              disabled={loading}
              className="w-full py-3 text-sm font-bold text-white disabled:opacity-50"
              style={{ background: "var(--ink)", borderRadius: "var(--radius-md)" }}
            >
              {loading ? "제출 중..." : "제출하기"}
            </button>
          </div>
        )}

        {step.kind === "profiles" && (
          <div className="space-y-3">
            {step.targets.length === 0 ? (
              <p className="py-8 text-center text-sm" style={{ color: "var(--ink-soft)" }}>
                상대방 프로필을 불러올 수 없습니다
              </p>
            ) : (
              step.targets.map((target) => (
                <div
                  key={target.user_id}
                  className="p-4"
                  style={{
                    background: "var(--surface-muted)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-lg)",
                  }}
                >
                  <div className="flex items-center gap-3">
                    {target.photo_url_1 ? (
                      <img src={target.photo_url_1} alt="" className="h-12 w-12 rounded-full object-cover" />
                    ) : (
                      <div
                        className="flex h-12 w-12 items-center justify-center rounded-full"
                        style={{ background: "var(--border)", color: "var(--ink-soft)", fontSize: 20 }}
                      >
                        👤
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm" style={{ color: "var(--ink)" }}>
                        {target.nickname || "익명"}
                      </p>
                      <p className="text-xs truncate" style={{ color: "var(--ink-soft)" }}>
                        {[target.university, target.entry_label, target.age ? `${target.age}세` : null].filter(Boolean).join(" · ")}
                      </p>
                      {target.bio_short && (
                        <p className="mt-0.5 text-xs truncate" style={{ color: "var(--ink-mid)" }}>
                          {target.bio_short}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => { setStep({ kind: "after", target }); setMessage(""); setError(null); }}
                      className="px-3 py-2 text-xs font-bold text-white whitespace-nowrap"
                      style={{ background: "oklch(0.7 0.15 10)", borderRadius: "var(--radius-md)" }}
                    >
                      💌 애프터
                    </button>
                  </div>
                </div>
              ))
            )}
            <button
              onClick={onClose}
              className="w-full py-3 text-sm"
              style={{
                color: "var(--ink-soft)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-md)",
              }}
            >
              없음
            </button>
          </div>
        )}

        {step.kind === "after" && (
          <div className="space-y-4">
            <div
              className="p-3 text-xs"
              style={{
                background: "oklch(0.95 0.04 0)",
                border: "1px solid oklch(0.7 0.15 10)",
                color: "oklch(0.5 0.15 10)",
                borderRadius: "var(--radius-md)",
              }}
            >
              {step.target.nickname || "상대방"}님에게 애프터를 신청합니다
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-bold" style={{ color: "var(--ink-mid)" }}>
                메시지 (최대 50자)
              </label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="전하고 싶은 말을 적어주세요..."
                rows={3}
                maxLength={50}
                className="w-full resize-none px-4 py-3 outline-none"
                style={{
                  fontSize: 13,
                  background: "var(--surface-muted)",
                  border: "1px solid var(--border)",
                  color: "var(--ink)",
                  borderRadius: "var(--radius-md)",
                  fontFamily: "var(--font-sans)",
                }}
              />
              <p className="mt-1 text-right text-xs" style={{ color: "var(--ink-soft)" }}>
                {message.length}/50
              </p>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-bold" style={{ color: "var(--ink-mid)" }}>
                내 전화번호
              </label>
              <div
                className="flex items-center px-4 py-3"
                style={{
                  background: "var(--surface-muted)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-md)",
                }}
              >
                <span className="flex-1 text-sm" style={{ color: "var(--ink)" }}>
                  {phone || "등록된 전화번호 없음"}
                </span>
                <span className="text-xs" style={{ color: "var(--ink-soft)" }}>자동 입력</span>
              </div>
              <p className="mt-1 text-xs" style={{ color: "var(--ink-soft)" }}>
                프로필의 휴대폰 번호가 상대방에게 전달됩니다
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setStep({ kind: "profiles", targets: cachedTargets })}
                className="flex-1 py-3 text-sm"
                style={{
                  color: "var(--ink-soft)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-md)",
                }}
              >
                취소
              </button>
              <button
                onClick={() => handleAfterSubmit((step as { kind: "after"; target: AfterTarget }).target)}
                disabled={loading}
                className="flex-1 py-3 text-sm font-bold text-white disabled:opacity-50"
                style={{ background: "oklch(0.7 0.15 10)", borderRadius: "var(--radius-md)" }}
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
