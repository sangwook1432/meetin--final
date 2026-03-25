"use client";

/**
 * /meetings/[id] — 미팅 상세 페이지
 *
 * 핵심 UI:
 * 1. 팀별 슬롯 + confirmed/대기중 뱃지 (TeamSection → SlotCard)
 * 2. 상태별 액션 버튼
 *    - RECRUITING : [참가하기] / [참가중] / [나가기]
 *    - WAITING_CONFIRM : [보증금 결제 + 확정] / [확정 완료]
 *    - CONFIRMED : [채팅방 입장]
 * 3. CONFIRMED 전환 직후 → 자동으로 /chats/[roomId]로 이동
 *
 * Toss 결제 흐름:
 *   ① prepare_deposit → orderId / amount / orderName 획득
 *   ② loadTossPayments(clientKey).requestPayment(...)  [Toss JS SDK]
 *   ③ 성공 콜백 URL: /payments/success?orderId=...&paymentKey=...&amount=...
 *      → confirmTossPayment(order_id, payment_key)  [서버 검증]
 *   ※ 개발 환경(clientKey 없음): mock 결제 경로로 직접 서버 confirm 호출
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

// ─── 상태 뱃지 색상 ───────────────────────────────────────
const STATUS_BADGE: Record<MeetingStatus, { label: string; className: string }> = {
  RECRUITING: { label: "모집중", className: "bg-blue-100 text-blue-700" },
  FULL: { label: "정원마감", className: "bg-gray-100 text-gray-600" },
  WAITING_CONFIRM: { label: "참가확정 대기", className: "bg-yellow-100 text-yellow-700" },
  CONFIRMED: { label: "확정 완료", className: "bg-emerald-100 text-emerald-700" },
  CANCELLED: { label: "취소됨", className: "bg-red-100 text-red-600" },
  COMPLETED: { label: "미팅 완료", className: "bg-purple-100 text-purple-700" },
};

const MEETING_TYPE_LABEL: Record<string, string> = {
  TWO_BY_TWO: "2 : 2",
  THREE_BY_THREE: "3 : 3",
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

  // 폴링: WAITING_CONFIRM 상태에서 다른 유저의 confirm을 실시간 반영
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
    // AuthContext의 user는 앱 시작 시 캐시된 값 → 항상 최신 매칭권 수를 직접 조회
    getMyTickets()
      .then((data) => setMyTickets(data.tickets))
      .catch(() => {});
  }, [fetchMeeting]);

  // WAITING_CONFIRM 상태일 때 5초마다 폴링
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

  // ─── 액션 핸들러 ──────────────────────────────────────────

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
      if (res.meeting_deleted) {
        router.push("/discover");
      } else {
        await fetchMeeting();
      }
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

      // ✅ 전원 확정 → CONFIRMED 전환 → 채팅방으로 자동 이동
      if (res.status === "CONFIRMED" && res.chat_room_id) {
        router.push(`/chats/${res.chat_room_id}`);
        return;
      }

      // 아직 다른 사람 대기 중 → 상세 새로고침
      await fetchMeeting();
    } catch (e) {
      alert(e instanceof Error ? e.message : "확정 실패");
    } finally {
      setActionLoading(false);
    }
  };

  const handleEnterChat = () => {
    if (meeting?.chat_room_id) {
      router.push(`/chats/${meeting.chat_room_id}`);
    }
  };

  // ─── 렌더 ─────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="text-gray-400 text-sm">로딩 중...</div>
      </div>
    );
  }

  if (error || !meeting) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-gray-50">
        <p className="text-red-500 text-sm">{error ?? "미팅을 찾을 수 없습니다"}</p>
        <button
          onClick={() => router.back()}
          className="text-sm text-blue-600 underline"
        >
          뒤로가기
        </button>
      </div>
    );
  }

  const badge = STATUS_BADGE[meeting.status];
  const myTeam = meeting.slots.find(s => s.user?.user_id === user?.id)?.team ?? null;

  // 선호학교 참가 조건 계산
  const allowedUnis =
    !meeting.preferred_universities_any && meeting.preferred_universities_raw
      ? meeting.preferred_universities_raw.split(",").map((u) => u.trim()).filter(Boolean)
      : [];
  const canJoin =
    allowedUnis.length === 0 ||
    (!!user?.university && allowedUnis.includes(user.university.trim()));

  // confirmed 진행률 계산 (WAITING_CONFIRM 전용)
  const memberSlots = meeting.slots.filter((s) => s.user !== null);
  const confirmedCount = memberSlots.filter((s) => s.confirmed).length;
  const totalMembers = memberSlots.length;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-md">
        {/* 헤더 */}
        <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-gray-100 bg-white px-4 py-3">
          <button
            onClick={() => router.back()}
            className="rounded-full p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
          >
            ←
          </button>
          <span className="font-semibold text-gray-900">미팅 상세</span>
        </div>

        {showInviteModal && myTeam && (
          <FriendInviteModal
            meetingId={meetingId}
            userTeam={myTeam}
            onClose={() => setShowInviteModal(false)}
            onInvited={() => { setShowInviteModal(false); fetchMeeting(); }}
          />
        )}

        <div className="px-4 py-5 space-y-5">

          {/* 미팅 기본 정보 카드 */}
          <div className="rounded-2xl bg-white p-5 shadow-sm border border-gray-100">
            <div className="flex items-start justify-between">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">
                  {meeting.title ?? `미팅 #${meeting.meeting_id}`}
                </h1>
                <p className="mt-1 text-sm text-gray-500">
                  {MEETING_TYPE_LABEL[meeting.meeting_type] ?? meeting.meeting_type}
                </p>
              </div>
              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold ${badge.className}`}
              >
                {badge.label}
              </span>
            </div>

            {/* 참가 현황 */}
            <div className="mt-4 flex items-center gap-4 text-sm text-gray-600">
              <span>👨 남성 {meeting.filled.male}/{meeting.filled.capacity / 2}명</span>
              <span className="text-gray-300">|</span>
              <span>👩 여성 {meeting.filled.female}/{meeting.filled.capacity / 2}명</span>
            </div>

            {/* WAITING_CONFIRM 확정 진행률 */}
            {meeting.status === "WAITING_CONFIRM" && (
              <div className="mt-4">
                <div className="flex justify-between text-xs text-gray-500 mb-1.5">
                  <span>참가 확정 현황</span>
                  <span className="font-semibold text-yellow-600">
                    {confirmedCount} / {totalMembers} 확정
                  </span>
                </div>
                <div className="h-2 w-full rounded-full bg-gray-100">
                  <div
                    className="h-2 rounded-full bg-yellow-400 transition-all duration-500"
                    style={{
                      width: `${totalMembers > 0 ? (confirmedCount / totalMembers) * 100 : 0}%`,
                    }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* 미팅 수정 — HOST만 */}
          {user?.id === meeting.host_user_id && (
            <MeetingSettingsEditor
              meetingId={meeting.meeting_id}
              initialUniAny={meeting.preferred_universities_any}
              initialUniRaw={meeting.preferred_universities_raw}
              initialEntryYearMin={meeting.entry_year_min}
              initialEntryYearMax={meeting.entry_year_max}
              onSaved={fetchMeeting}
            />
          )}

          {/* 팀 슬롯 — 핵심 UI */}
          <div className="space-y-4">
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

          {/* 액션 영역 */}
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
// 액션 버튼 영역 (상태별 분기)
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

  // ── CONFIRMED: 채팅방 입장 버튼만 표시
  if (status === "CONFIRMED") {
    return (
      <div className="rounded-2xl bg-emerald-50 border border-emerald-200 p-5 text-center space-y-3">
        <div className="text-emerald-700 font-semibold">🎉 모든 멤버가 확정했습니다!</div>
        <p className="text-sm text-emerald-600">채팅방에서 만날 장소를 정해보세요.</p>
        {chat_room_id && (
          <button
            onClick={onEnterChat}
            className="w-full rounded-xl bg-emerald-600 py-3 text-sm font-bold text-white hover:bg-emerald-700 active:scale-95 transition-all"
          >
            💬 채팅방 입장
          </button>
        )}
      </div>
    );
  }

  // ── WAITING_CONFIRM: 보증금 결제 + 확정 버튼
  if (status === "WAITING_CONFIRM" && is_member) {
    if (my_confirmed) {
      return (
        <div className="rounded-2xl bg-yellow-50 border border-yellow-200 p-5 text-center">
          <div className="text-yellow-700 font-semibold mb-1">✅ 참가 확정 완료</div>
          <p className="text-sm text-yellow-600">
            다른 멤버들의 확정을 기다리고 있습니다...
          </p>
          <p className="mt-2 text-xs text-gray-400">
            (5초마다 자동으로 상태가 갱신됩니다)
          </p>
        </div>
      );
    }

    const hasTicket = userTickets > 0;
    return (
      <div className="space-y-3">
        {/* 매칭권 안내 카드 */}
        <div className="rounded-xl bg-yellow-50 border border-yellow-200 px-4 py-4 space-y-2">
          <p className="text-sm font-semibold text-yellow-800">🎫 매칭권 소모 안내</p>
          <p className="text-xs text-yellow-700 leading-relaxed">
            확정 버튼을 누르면 대기 상태로 전환됩니다.
            모든 멤버가 확정 시 <strong>매칭권 1개</strong>가 소모되며 채팅방이 개설됩니다.
          </p>
          <div className="flex items-center justify-between pt-1">
            <span className="text-xs text-yellow-600">보유 매칭권</span>
            <span className="text-sm font-bold text-yellow-800">{userTickets}개</span>
          </div>
        </div>

        {hasTicket ? (
          <button
            onClick={onConfirm}
            disabled={actionLoading}
            className="w-full rounded-xl bg-blue-600 py-3.5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50 active:scale-95 transition-all"
          >
            {actionLoading ? "처리 중..." : "🎫 참가 확정"}
          </button>
        ) : (
          <div className="space-y-2">
            <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-600 text-center">
              매칭권이 없습니다
            </div>
            <button
              onClick={() => router.push("/me/tickets")}
              className="w-full rounded-xl bg-blue-600 py-3 text-sm font-bold text-white hover:bg-blue-700 transition-all"
            >
              매칭권 구매하러 가기 →
            </button>
          </div>
        )}

        <button
          onClick={onLeave}
          disabled={actionLoading}
          className="w-full rounded-xl border border-red-200 bg-white py-3 text-sm font-medium text-red-500 hover:bg-red-50 disabled:opacity-50 transition-all"
        >
          나가기
        </button>
      </div>
    );
  }

  // ── RECRUITING
  if (status === "RECRUITING") {
    const isFull = filled.total >= filled.capacity;

    if (is_member) {
      return (
        <div className="space-y-3">
          <div className="rounded-xl bg-blue-50 border border-blue-200 px-4 py-3 text-sm text-blue-700">
            참가 중입니다. 팀이 모두 모이면 확정 단계로 진행됩니다.
          </div>
          <button
            onClick={onLeave}
            disabled={actionLoading}
            className="w-full rounded-xl border border-red-200 bg-white py-3 text-sm font-medium text-red-500 hover:bg-red-50 disabled:opacity-50 transition-all"
          >
            {actionLoading ? "처리 중..." : "나가기"}
          </button>
        </div>
      );
    }

    if (isFull) {
      return (
        <div className="rounded-xl bg-gray-100 px-4 py-3 text-center text-sm text-gray-500">
          정원이 마감되었습니다
        </div>
      );
    }

    if (!canJoin) {
      return (
        <div className="rounded-xl bg-orange-50 border border-orange-200 px-4 py-4 text-center space-y-1">
          <p className="text-sm font-semibold text-orange-800">참가 불가</p>
          <p className="text-xs text-orange-600">
            이 미팅은{" "}
            {allowedUnis.slice(0, 3).join(", ")}
            {allowedUnis.length > 3 ? " 외" : ""} 학생만 참가할 수 있습니다.
          </p>
        </div>
      );
    }

    return (
      <button
        onClick={onJoin}
        disabled={actionLoading}
        className="w-full rounded-xl bg-blue-600 py-3.5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50 active:scale-95 transition-all"
      >
        {actionLoading ? "처리 중..." : "참가하기"}
      </button>
    );
  }

  return null;
}

// ─────────────────────────────────────────────
// 미팅 수정 컴포넌트 (HOST 전용) — 선호학교 + 학번 범위 통합
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

  // 읽기 모드 요약 텍스트
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
      {/* 요약 카드 */}
      <div className="rounded-2xl bg-white p-4 shadow-sm border border-gray-100">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold text-gray-700">미팅 조건</span>
          <button
            onClick={() => setShowModal(true)}
            className="rounded-lg bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600 hover:bg-gray-200 transition-colors"
          >
            수정
          </button>
        </div>
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <span className="text-gray-300">🏫</span>
            <span>{uniSummary}</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <span className="text-gray-300">🎓</span>
            <span>{yearSummary}</span>
          </div>
        </div>
      </div>

      {/* 수정 모달 */}
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

  const toggleUni = (uni: string) => {
    setSelectedUnis((prev) =>
      prev.includes(uni) ? prev.filter((u) => u !== uni) : [...prev, uni]
    );
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await Promise.all([
        updatePreferredUniversities(
          meetingId,
          uniAny,
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
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm sm:items-center" onClick={onClose}>
      <div className="w-full max-w-md rounded-t-3xl bg-white p-6 pb-8 shadow-2xl sm:rounded-3xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        {/* 헤더 */}
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">미팅 수정</h2>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            ✕
          </button>
        </div>

        <div className="space-y-5">
          {/* 상대방 학교 선호 */}
          <div>
            <p className="mb-2.5 text-sm font-semibold text-gray-700">상대방 학교 선호</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { setUniAny(true); setSelectedUnis([]); }}
                className={`flex-1 rounded-xl py-2.5 text-sm border-2 font-medium transition-all ${
                  uniAny ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-200 text-gray-500"
                }`}
              >
                🌍 아무 학교
              </button>
              <button
                type="button"
                onClick={() => setUniAny(false)}
                className={`flex-1 rounded-xl py-2.5 text-sm border-2 font-medium transition-all ${
                  !uniAny ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-200 text-gray-500"
                }`}
              >
                🏫 학교 선택
              </button>
            </div>

            {!uniAny && (
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
                      {uni.replace("대학교", "대").replace("학교", "")}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 상대방 가능 학번 */}
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
                    value={minYear}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      setMinYear(v);
                      if (v > maxYear) setMaxYear(v);
                    }}
                    className="flex-1 rounded-lg border border-gray-200 bg-white px-2 py-2 text-sm text-center focus:outline-none focus:border-blue-400"
                  >
                    {ENTRY_YEARS.map((y) => (
                      <option key={y} value={y}>{y}학번</option>
                    ))}
                  </select>
                  <span className="text-sm font-semibold text-gray-500">~</span>
                  <select
                    value={maxYear}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      setMaxYear(v);
                      if (v < minYear) setMinYear(v);
                    }}
                    className="flex-1 rounded-lg border border-gray-200 bg-white px-2 py-2 text-sm text-center focus:outline-none focus:border-blue-400"
                  >
                    {ENTRY_YEARS.map((y) => (
                      <option key={y} value={y}>{y}학번</option>
                    ))}
                  </select>
                </div>
                <p className="mt-1.5 text-xs text-center text-blue-600 font-medium">
                  {minYear}학번 ~ {maxYear}학번
                </p>
              </div>
            )}
          </div>

          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full rounded-xl bg-blue-600 py-3.5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50 active:scale-95 transition-all"
          >
            {saving ? "저장 중..." : "저장하기"}
          </button>
        </div>
      </div>
    </div>
  );
}
