"use client";

/**
 * /meetings/[id] — V1 미팅 상세 (행스택 레이아웃)
 *
 * 핵심 UI:
 *  1. 백 네비게이션 + 미팅 메타 헤더
 *  2. 호스트 + 학교 표시
 *  3. 팀별 슬롯 행스택 (TeamSection)
 *  4. WAITING_CONFIRM 진행률
 *  5. Sticky CTA (상태별 분기)
 *  6. HOST: 미팅 조건 수정 모달
 *  7. 친구 초대 모달 진입
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  getMeeting,
  joinMeeting,
  leaveMeeting,
  confirmMeeting,
  getMyTickets,
  updatePreferredUniversities,
  updateEntryYearRange,
} from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import type { MeetingDetail, MeetingStatus } from "@/types";
import { TeamSection } from "@/components/meeting/TeamSection";
import { FriendInviteModal } from "@/components/meeting/FriendInviteModal";

const STATUS_BADGE: Record<MeetingStatus, { label: string; bg: string; fg: string }> = {
  RECRUITING:      { label: "모집중",     bg: "var(--accent-soft)",  fg: "var(--accent-ink)" },
  FULL:            { label: "정원마감",   bg: "var(--surface-muted)", fg: "var(--ink-soft)" },
  WAITING_CONFIRM: { label: "확정 대기",  bg: "var(--warning-soft)", fg: "oklch(0.45 0.14 70)" },
  CONFIRMED:       { label: "확정 완료",  bg: "var(--success-soft)", fg: "var(--success)" },
  CANCELLED:       { label: "취소됨",     bg: "var(--danger-soft)",  fg: "var(--danger)" },
  COMPLETED:       { label: "미팅 완료",  bg: "oklch(0.94 0.04 290)", fg: "oklch(0.45 0.18 290)" },
};

const MEETING_TYPE_LABEL: Record<string, string> = {
  TWO_BY_TWO: "2 : 2 미팅",
  THREE_BY_THREE: "3 : 3 미팅",
};

export default function MeetingDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const meetingId = Number(params.id);

  const [meeting, setMeeting] = useState<MeetingDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [myTickets, setMyTickets] = useState<number>(user?.matching_tickets ?? 0);
  const [showInviteModal, setShowInviteModal] = useState(false);

  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchMeeting = useCallback(async () => {
    try {
      const data = await getMeeting(meetingId);
      setMeeting(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "오류가 발생했습니다");
    } finally {
      setLoading(false);
    }
  }, [meetingId]);

  useEffect(() => {
    fetchMeeting();
    getMyTickets()
      .then((data) => setMyTickets(data.tickets))
      .catch(() => {});
  }, [fetchMeeting]);

  useEffect(() => {
    if (meeting?.status === "WAITING_CONFIRM") {
      pollingRef.current = setInterval(fetchMeeting, 5000);
    } else {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    }
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [meeting?.status, fetchMeeting]);

  const handleJoin = async () => {
    setActionLoading(true);
    try {
      await joinMeeting(meetingId);
      await fetchMeeting();
    } catch (e) {
      alert(e instanceof Error ? e.message : "참가 실패");
    } finally {
      setActionLoading(false);
    }
  };

  const handleLeave = async () => {
    if (!confirm("정말 나가시겠습니까?")) return;
    setActionLoading(true);
    try {
      const res = await leaveMeeting(meetingId);
      if (res.meeting_deleted) router.push("/discover");
      else await fetchMeeting();
    } catch (e) {
      alert(e instanceof Error ? e.message : "나가기 실패");
    } finally {
      setActionLoading(false);
    }
  };

  const handleConfirm = async () => {
    setActionLoading(true);
    try {
      const res = await confirmMeeting(meetingId);
      if (res.status === "CONFIRMED" && res.chat_room_id) {
        router.push(`/chats/${res.chat_room_id}`);
        return;
      }
      await fetchMeeting();
    } catch (e) {
      alert(e instanceof Error ? e.message : "확정 실패");
    } finally {
      setActionLoading(false);
    }
  };

  const handleEnterChat = () => {
    if (meeting?.chat_room_id) router.push(`/chats/${meeting.chat_room_id}`);
  };

  if (loading) {
    return (
      <div
        className="flex min-h-screen items-center justify-center"
        style={{ background: "var(--bg)", color: "var(--ink-soft)" }}
      >
        <div className="text-sm">로딩 중...</div>
      </div>
    );
  }

  if (error || !meeting) {
    return (
      <div
        className="flex min-h-screen flex-col items-center justify-center gap-3"
        style={{ background: "var(--bg)" }}
      >
        <p className="text-sm" style={{ color: "var(--danger)" }}>{error ?? "미팅을 찾을 수 없습니다"}</p>
        <button
          onClick={() => router.back()}
          className="text-sm underline"
          style={{ color: "var(--accent)" }}
        >
          뒤로가기
        </button>
      </div>
    );
  }

  const badge = STATUS_BADGE[meeting.status];
  const myTeam = meeting.slots.find(s => s.user?.user_id === user?.id)?.team ?? null;
  const hostSlot = meeting.slots.find(s => s.user?.user_id === meeting.host_user_id);
  const hostName = hostSlot?.user?.university ?? "호스트";

  const allowedUnis =
    !meeting.preferred_universities_any && meeting.preferred_universities_raw
      ? meeting.preferred_universities_raw.split(",").map((u) => u.trim()).filter(Boolean)
      : [];
  const canJoin =
    allowedUnis.length === 0 ||
    (!!user?.university && allowedUnis.includes(user.university.trim()));

  const memberSlots = meeting.slots.filter((s) => s.user !== null);
  const confirmedCount = memberSlots.filter((s) => s.confirmed).length;
  const totalMembers = memberSlots.length;

  const uniLabel = meeting.preferred_universities_any
    ? "모든 학교"
    : meeting.preferred_universities_raw
    ? meeting.preferred_universities_raw
        .split(",").slice(0, 3).map((u) => u.trim().replace("학교", "").replace("대학교", "대"))
        .join(" · ")
      + (meeting.preferred_universities_raw.split(",").length > 3 ? " 외" : "")
    : "모든 학교";

  return (
    <div
      className="min-h-screen relative"
      style={{ background: "var(--bg)" }}
    >
      <div
        className="mx-auto max-w-md"
        style={{ paddingBottom: "calc(7rem + env(safe-area-inset-bottom, 0px))" }}
      >
        {/* 백 네비게이션 */}
        <div
          className="sticky top-0 z-10 flex items-center gap-2 px-4 py-3"
          style={{
            background: "var(--surface)",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <button
            onClick={() => router.back()}
            className="flex items-center justify-center transition-all"
            style={{
              width: 36, height: 36, borderRadius: 999,
              color: "var(--ink)",
            }}
            aria-label="뒤로가기"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M15 5l-7 7 7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          <span
            className="font-bold"
            style={{ fontSize: 15, color: "var(--ink)", letterSpacing: "-0.02em" }}
          >
            미팅 #{meeting.meeting_id}
          </span>
        </div>

        {showInviteModal && myTeam && (
          <FriendInviteModal
            meetingId={meetingId}
            userTeam={myTeam}
            onClose={() => setShowInviteModal(false)}
            onInvited={() => { setShowInviteModal(false); fetchMeeting(); }}
          />
        )}

        {/* Hero */}
        <div className="px-5 pt-5 pb-4">
          <div className="flex items-center gap-2 mb-3">
            <span
              className="px-2.5 py-1 font-bold"
              style={{
                fontSize: 11,
                background: badge.bg,
                color: badge.fg,
                borderRadius: 999,
                letterSpacing: "-0.01em",
              }}
            >
              {badge.label}
            </span>
            <span
              style={{
                fontSize: 11,
                color: "var(--ink-soft)",
                letterSpacing: "-0.01em",
              }}
            >
              {MEETING_TYPE_LABEL[meeting.meeting_type] ?? meeting.meeting_type}
            </span>
          </div>
          <h1
            className="font-extrabold"
            style={{
              fontSize: 24,
              color: "var(--ink)",
              letterSpacing: "-0.03em",
              lineHeight: 1.2,
            }}
          >
            {meeting.title ?? `미팅 #${meeting.meeting_id}`}
          </h1>
          <div
            className="mt-2.5 flex items-center gap-2.5"
            style={{ fontSize: 13, color: "var(--ink-mid)" }}
          >
            <span>호스트 <b style={{ color: "var(--ink)" }}>{hostName}</b></span>
            <span style={{ width: 3, height: 3, borderRadius: 999, background: "var(--ink-soft)" }} />
            <span>{uniLabel}</span>
          </div>
        </div>

        {/* HOST 미팅 조건 수정 */}
        {user?.id === meeting.host_user_id && (
          <div className="px-5 pb-3">
            <MeetingSettingsEditor
              meetingId={meeting.meeting_id}
              initialUniAny={meeting.preferred_universities_any}
              initialUniRaw={meeting.preferred_universities_raw}
              initialEntryYearMin={meeting.entry_year_min}
              initialEntryYearMax={meeting.entry_year_max}
              onSaved={fetchMeeting}
            />
          </div>
        )}

        {/* WAITING_CONFIRM 진행률 카드 */}
        {meeting.status === "WAITING_CONFIRM" && (
          <div className="px-5 pb-3">
            <div
              className="px-4 py-3.5"
              style={{
                background: "var(--warning-soft)",
                border: "1px solid var(--warning)",
                borderRadius: "var(--radius-md)",
              }}
            >
              <div
                className="flex justify-between items-baseline mb-2"
              >
                <span style={{ fontSize: 12, color: "var(--ink-mid)", fontWeight: 600 }}>
                  모든 멤버 확정 대기 중
                </span>
                <span
                  className="font-bold"
                  style={{
                    fontSize: 12,
                    color: "oklch(0.45 0.14 70)",
                  }}
                >
                  {confirmedCount} / {totalMembers}
                </span>
              </div>
              <div
                className="overflow-hidden"
                style={{
                  height: 6,
                  borderRadius: 999,
                  background: "var(--surface)",
                }}
              >
                <div
                  className="h-full transition-all duration-500"
                  style={{
                    width: `${totalMembers > 0 ? (confirmedCount / totalMembers) * 100 : 0}%`,
                    background: "var(--warning)",
                    borderRadius: 999,
                  }}
                />
              </div>
            </div>
          </div>
        )}

        {/* 팀 행스택 */}
        <div className="px-5 pb-5 flex flex-col gap-3">
          <TeamSection
            team="MALE"
            slots={meeting.slots}
            hostUserId={meeting.host_user_id}
            canInvite={meeting.is_member && meeting.status === "RECRUITING" && myTeam === "MALE"}
            onInviteSlot={() => setShowInviteModal(true)}
          />
          <TeamSection
            team="FEMALE"
            slots={meeting.slots}
            hostUserId={meeting.host_user_id}
            canInvite={meeting.is_member && meeting.status === "RECRUITING" && myTeam === "FEMALE"}
            onInviteSlot={() => setShowInviteModal(true)}
          />
        </div>
      </div>

      {/* Sticky CTA */}
      <div
        className="fixed bottom-0 left-0 right-0 z-20"
        style={{
          background: "var(--surface)",
          borderTop: "1px solid var(--border)",
          padding: "12px 16px calc(12px + env(safe-area-inset-bottom, 0px))",
        }}
      >
        <div className="mx-auto max-w-md">
          <ActionArea
            meeting={meeting}
            actionLoading={actionLoading}
            userTickets={myTickets}
            canJoin={canJoin}
            allowedUnis={allowedUnis}
            onJoin={handleJoin}
            onLeave={handleLeave}
            onConfirm={handleConfirm}
            onEnterChat={handleEnterChat}
          />
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Sticky CTA 액션 영역 (상태별 분기)
// ─────────────────────────────────────────────

interface ActionAreaProps {
  meeting: MeetingDetail;
  actionLoading: boolean;
  userTickets: number;
  canJoin: boolean;
  allowedUnis: string[];
  onJoin: () => void;
  onLeave: () => void;
  onConfirm: () => void;
  onEnterChat: () => void;
}

function ActionArea({
  meeting,
  actionLoading,
  userTickets,
  canJoin,
  allowedUnis,
  onJoin,
  onLeave,
  onConfirm,
  onEnterChat,
}: ActionAreaProps) {
  const router = useRouter();
  const { status, is_member, my_confirmed, chat_room_id, filled } = meeting;

  if (status === "CONFIRMED") {
    return (
      <button
        onClick={chat_room_id ? onEnterChat : undefined}
        disabled={!chat_room_id}
        className="w-full py-3.5 font-bold text-white transition-all active:scale-[0.99] disabled:opacity-50 flex items-center justify-between px-5"
        style={{
          background: "var(--success)",
          borderRadius: "var(--radius-md)",
          fontSize: 15,
          letterSpacing: "-0.01em",
        }}
      >
        <span>채팅방 입장</span>
        <span style={{ fontSize: 11, fontWeight: 500, opacity: 0.9 }}>확정 완료</span>
      </button>
    );
  }

  if (status === "WAITING_CONFIRM" && is_member) {
    if (my_confirmed) {
      return (
        <div
          className="px-4 py-3 text-center"
          style={{
            background: "var(--warning-soft)",
            border: "1px solid var(--warning)",
            borderRadius: "var(--radius-md)",
          }}
        >
          <div className="font-bold" style={{ color: "oklch(0.45 0.14 70)", fontSize: 14 }}>
            참가 확정 완료
          </div>
          <p className="text-xs" style={{ color: "var(--ink-mid)", marginTop: 2 }}>
            다른 멤버들의 확정을 기다리고 있습니다 (5초마다 자동 갱신)
          </p>
        </div>
      );
    }

    const hasTicket = userTickets > 0;
    return (
      <div className="space-y-2">
        <div
          className="flex items-center justify-between px-3 py-2"
          style={{
            background: "var(--accent-soft)",
            borderRadius: "var(--radius-sm)",
            fontSize: 11,
            color: "var(--accent-ink)",
          }}
        >
          <span>보유 매칭권</span>
          <span className="font-bold">{userTickets}개</span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onLeave}
            disabled={actionLoading}
            className="px-4 py-3.5 font-medium disabled:opacity-50"
            style={{
              fontSize: 14,
              background: "var(--surface)",
              border: "1px solid var(--danger)",
              color: "var(--danger)",
              borderRadius: "var(--radius-md)",
            }}
          >
            나가기
          </button>
          {hasTicket ? (
            <button
              onClick={onConfirm}
              disabled={actionLoading}
              className="flex-1 py-3.5 font-bold text-white disabled:opacity-50 transition-all active:scale-[0.99]"
              style={{
                fontSize: 14,
                background: "var(--ink)",
                borderRadius: "var(--radius-md)",
                letterSpacing: "-0.01em",
              }}
            >
              {actionLoading ? "처리 중..." : "참가 확정"}
            </button>
          ) : (
            <button
              onClick={() => router.push("/me/tickets")}
              className="flex-1 py-3.5 font-bold text-white transition-all"
              style={{
                fontSize: 14,
                background: "var(--accent)",
                borderRadius: "var(--radius-md)",
              }}
            >
              매칭권 구매하기 →
            </button>
          )}
        </div>
      </div>
    );
  }

  if (status === "RECRUITING") {
    const isFull = filled.total >= filled.capacity;

    if (is_member) {
      return (
        <button
          onClick={onLeave}
          disabled={actionLoading}
          className="w-full py-3.5 font-medium transition-all disabled:opacity-50"
          style={{
            fontSize: 14,
            background: "var(--surface)",
            border: "1px solid var(--danger)",
            color: "var(--danger)",
            borderRadius: "var(--radius-md)",
            letterSpacing: "-0.01em",
          }}
        >
          {actionLoading ? "처리 중..." : "나가기"}
        </button>
      );
    }

    if (isFull) {
      return (
        <div
          className="px-4 py-3.5 text-center text-sm font-medium"
          style={{
            background: "var(--surface-muted)",
            color: "var(--ink-soft)",
            borderRadius: "var(--radius-md)",
          }}
        >
          정원이 마감되었습니다
        </div>
      );
    }

    if (!canJoin) {
      return (
        <div
          className="px-4 py-3 text-center"
          style={{
            background: "var(--warning-soft)",
            border: "1px solid var(--warning)",
            borderRadius: "var(--radius-md)",
          }}
        >
          <p className="text-sm font-bold" style={{ color: "oklch(0.45 0.14 70)" }}>참가 불가</p>
          <p className="text-xs" style={{ color: "var(--ink-mid)", marginTop: 2 }}>
            {allowedUnis.slice(0, 3).join(", ")}
            {allowedUnis.length > 3 ? " 외" : ""} 학생만 참가할 수 있습니다
          </p>
        </div>
      );
    }

    return (
      <button
        onClick={onJoin}
        disabled={actionLoading}
        className="w-full py-3.5 font-bold text-white disabled:opacity-50 transition-all active:scale-[0.99] flex items-center justify-between px-5"
        style={{
          fontSize: 15,
          background: "var(--ink)",
          borderRadius: "var(--radius-md)",
          letterSpacing: "-0.01em",
        }}
      >
        <span>{actionLoading ? "처리 중..." : "미팅 참가하기"}</span>
        <span style={{ fontSize: 11, fontWeight: 500, opacity: 0.7 }}>매칭권은 확정 시 사용</span>
      </button>
    );
  }

  return null;
}

// ─────────────────────────────────────────────
// HOST 전용: 미팅 조건 수정 (V1)
// ─────────────────────────────────────────────

const UNIVERSITIES = [
  "서울대학교", "연세대학교", "고려대학교", "성균관대학교", "한양대학교",
  "중앙대학교", "경희대학교", "한국외국어대학교", "이화여자대학교", "숙명여자대학교",
  "서강대학교", "숭실대학교", "건국대학교", "동국대학교", "홍익대학교",
  "국민대학교", "세종대학교", "단국대학교", "아주대학교", "인하대학교",
];

const ENTRY_YEARS = [18, 19, 20, 21, 22, 23, 24, 25, 26];

interface MeetingSettingsEditorProps {
  meetingId: number;
  initialUniAny: boolean;
  initialUniRaw: string | null;
  initialEntryYearMin: number | null;
  initialEntryYearMax: number | null;
  onSaved: () => void;
}

function MeetingSettingsEditor({
  meetingId,
  initialUniAny,
  initialUniRaw,
  initialEntryYearMin,
  initialEntryYearMax,
  onSaved,
}: MeetingSettingsEditorProps) {
  const [showModal, setShowModal] = useState(false);

  const initialSelected = initialUniRaw
    ? initialUniRaw.split(",").map((u) => u.trim()).filter(Boolean)
    : [];
  const uniSummary = initialUniAny || initialSelected.length === 0
    ? "모든 학교"
    : initialSelected.slice(0, 2).join(", ") + (initialSelected.length > 2 ? ` 외 ${initialSelected.length - 2}` : "");
  const hasRange = initialEntryYearMin !== null || initialEntryYearMax !== null;
  const yearSummary = hasRange
    ? `${initialEntryYearMin ?? "?"}학번 ~ ${initialEntryYearMax ?? "?"}학번`
    : "전체 학번";

  return (
    <>
      <div
        className="px-4 py-3"
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-md)",
          boxShadow: "var(--shadow-sm)",
        }}
      >
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-sm font-bold" style={{ color: "var(--ink)", letterSpacing: "-0.01em" }}>
            미팅 조건
          </span>
          <button
            onClick={() => setShowModal(true)}
            className="px-2.5 py-1 text-xs font-medium"
            style={{
              background: "var(--surface-muted)",
              color: "var(--ink-mid)",
              borderRadius: "var(--radius-sm)",
            }}
          >
            수정
          </button>
        </div>
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs" style={{ color: "var(--ink-mid)" }}>
            <span style={{ color: "var(--ink-soft)" }}>학교</span>
            <span>{uniSummary}</span>
          </div>
          <div className="flex items-center gap-2 text-xs" style={{ color: "var(--ink-mid)" }}>
            <span style={{ color: "var(--ink-soft)" }}>학번</span>
            <span>{yearSummary}</span>
          </div>
        </div>
      </div>

      {showModal && (
        <MeetingSettingsModal
          meetingId={meetingId}
          initialUniAny={initialUniAny}
          initialUniRaw={initialUniRaw}
          initialEntryYearMin={initialEntryYearMin}
          initialEntryYearMax={initialEntryYearMax}
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); onSaved(); }}
        />
      )}
    </>
  );
}

interface MeetingSettingsModalProps {
  meetingId: number;
  initialUniAny: boolean;
  initialUniRaw: string | null;
  initialEntryYearMin: number | null;
  initialEntryYearMax: number | null;
  onClose: () => void;
  onSaved: () => void;
}

function MeetingSettingsModal({
  meetingId,
  initialUniAny,
  initialUniRaw,
  initialEntryYearMin,
  initialEntryYearMax,
  onClose,
  onSaved,
}: MeetingSettingsModalProps) {
  const initialSelected = initialUniRaw
    ? initialUniRaw.split(",").map((u) => u.trim()).filter(Boolean)
    : [];
  const hasRange = initialEntryYearMin !== null || initialEntryYearMax !== null;

  const [uniAny, setUniAny] = useState(initialUniAny);
  const [selectedUnis, setSelectedUnis] = useState<string[]>(initialSelected);
  const [entryYearAny, setEntryYearAny] = useState(!hasRange);
  const [minYear, setMinYear] = useState<number>(initialEntryYearMin ?? ENTRY_YEARS[0]);
  const [maxYear, setMaxYear] = useState<number>(initialEntryYearMax ?? ENTRY_YEARS[ENTRY_YEARS.length - 1]);
  const [saving, setSaving] = useState(false);

  const toggleUni = (uni: string) =>
    setSelectedUnis((prev) => prev.includes(uni) ? prev.filter((u) => u !== uni) : [...prev, uni]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await Promise.all([
        updatePreferredUniversities(
          meetingId, uniAny,
          uniAny ? undefined : selectedUnis.length > 0 ? selectedUnis.join(",") : undefined
        ),
        updateEntryYearRange(
          meetingId,
          entryYearAny ? null : minYear,
          entryYearAny ? null : maxYear
        ),
      ]);
      onSaved();
    } catch (e) {
      alert(e instanceof Error ? e.message : "저장 실패");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 animate-fade-in sm:items-center" onClick={onClose}>
      <div
        className="w-full max-w-md p-6 pb-8 max-h-[90vh] overflow-y-auto animate-slide-up"
        style={{
          background: "var(--surface)",
          borderTopLeftRadius: "var(--radius-xl)",
          borderTopRightRadius: "var(--radius-xl)",
          boxShadow: "var(--shadow-lg)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="font-bold" style={{ fontSize: 18, color: "var(--ink)" }}>미팅 수정</h2>
          <button onClick={onClose} style={{ width: 32, height: 32, color: "var(--ink-soft)" }}>✕</button>
        </div>

        <div className="space-y-5">
          <div>
            <p className="mb-2 text-xs font-semibold" style={{ color: "var(--ink-mid)" }}>상대방 학교 선호</p>
            <div className="flex gap-2">
              <button
                onClick={() => { setUniAny(true); setSelectedUnis([]); }}
                className="flex-1 py-2.5 font-medium"
                style={{
                  fontSize: 13,
                  border: `1.5px solid ${uniAny ? "var(--accent)" : "var(--border)"}`,
                  background: uniAny ? "var(--accent-soft)" : "var(--surface)",
                  color: uniAny ? "var(--accent-ink)" : "var(--ink-soft)",
                  borderRadius: "var(--radius-md)",
                }}
              >
                아무 학교
              </button>
              <button
                onClick={() => setUniAny(false)}
                className="flex-1 py-2.5 font-medium"
                style={{
                  fontSize: 13,
                  border: `1.5px solid ${!uniAny ? "var(--accent)" : "var(--border)"}`,
                  background: !uniAny ? "var(--accent-soft)" : "var(--surface)",
                  color: !uniAny ? "var(--accent-ink)" : "var(--ink-soft)",
                  borderRadius: "var(--radius-md)",
                }}
              >
                학교 선택
              </button>
            </div>
            {!uniAny && (
              <div
                className="mt-3 p-3"
                style={{
                  background: "var(--surface-muted)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-md)",
                }}
              >
                <p className="mb-2 text-xs" style={{ color: "var(--ink-soft)" }}>
                  원하는 학교를 선택하세요 (복수 선택 가능)
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {UNIVERSITIES.map((uni) => {
                    const on = selectedUnis.includes(uni);
                    return (
                      <button
                        key={uni}
                        onClick={() => toggleUni(uni)}
                        className="px-3 py-1.5 font-medium"
                        style={{
                          fontSize: 12,
                          border: `1px solid ${on ? "var(--accent)" : "var(--border)"}`,
                          background: on ? "var(--accent)" : "var(--surface)",
                          color: on ? "var(--ink-on-accent)" : "var(--ink-mid)",
                          borderRadius: 999,
                        }}
                      >
                        {uni.replace("대학교", "대").replace("학교", "")}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold" style={{ color: "var(--ink-mid)" }}>상대방 가능 학번</p>
            <div className="flex gap-2">
              <button
                onClick={() => setEntryYearAny(true)}
                className="flex-1 py-2.5 font-medium"
                style={{
                  fontSize: 13,
                  border: `1.5px solid ${entryYearAny ? "var(--accent)" : "var(--border)"}`,
                  background: entryYearAny ? "var(--accent-soft)" : "var(--surface)",
                  color: entryYearAny ? "var(--accent-ink)" : "var(--ink-soft)",
                  borderRadius: "var(--radius-md)",
                }}
              >
                전체 학번
              </button>
              <button
                onClick={() => setEntryYearAny(false)}
                className="flex-1 py-2.5 font-medium"
                style={{
                  fontSize: 13,
                  border: `1.5px solid ${!entryYearAny ? "var(--accent)" : "var(--border)"}`,
                  background: !entryYearAny ? "var(--accent-soft)" : "var(--surface)",
                  color: !entryYearAny ? "var(--accent-ink)" : "var(--ink-soft)",
                  borderRadius: "var(--radius-md)",
                }}
              >
                학번 지정
              </button>
            </div>
            {!entryYearAny && (
              <div
                className="mt-3 p-3"
                style={{
                  background: "var(--surface-muted)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-md)",
                }}
              >
                <p className="mb-2 text-xs" style={{ color: "var(--ink-soft)" }}>
                  참가 가능 학번 범위를 선택하세요
                </p>
                <div className="flex items-center gap-2">
                  <select
                    value={minYear}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      setMinYear(v);
                      if (v > maxYear) setMaxYear(v);
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
                    value={maxYear}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      setMaxYear(v);
                      if (v < minYear) setMinYear(v);
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
              </div>
            )}
          </div>

          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full py-3.5 font-bold text-white disabled:opacity-50 transition-all active:scale-[0.99]"
            style={{
              fontSize: 14,
              background: "var(--ink)",
              borderRadius: "var(--radius-md)",
              letterSpacing: "-0.01em",
            }}
          >
            {saving ? "저장 중..." : "저장하기"}
          </button>
        </div>
      </div>
    </div>
  );
}
