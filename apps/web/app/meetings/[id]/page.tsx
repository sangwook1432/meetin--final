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
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  getMeeting,
  joinMeeting,
  leaveMeeting,
  confirmMeeting,
  prepareDeposit,
  confirmTossPayment,
  getMyDeposits,
} from "@/lib/api";
import type { MeetingDetail, MeetingStatus } from "@/types";
import { TeamSection } from "@/components/meeting/TeamSection";

// ─── 상태 뱃지 색상 ───────────────────────────────────────
const STATUS_BADGE: Record<MeetingStatus, { label: string; className: string }> = {
  RECRUITING: { label: "모집중", className: "bg-blue-100 text-blue-700" },
  FULL: { label: "정원마감", className: "bg-gray-100 text-gray-600" },
  WAITING_CONFIRM: { label: "참가확정 대기", className: "bg-yellow-100 text-yellow-700" },
  CONFIRMED: { label: "확정 완료", className: "bg-emerald-100 text-emerald-700" },
  CANCELLED: { label: "취소됨", className: "bg-red-100 text-red-600" },
};

const MEETING_TYPE_LABEL: Record<string, string> = {
  TWO_BY_TWO: "2 : 2",
  THREE_BY_THREE: "3 : 3",
};

const TOSS_CLIENT_KEY = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY ?? "";

export default function MeetingDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const meetingId = Number(params.id);

  const [meeting, setMeeting] = useState<MeetingDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<string | null>(null);

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
  }, [fetchMeeting]);

  // ─── Toss 결제 성공 콜백 처리 ────────────────────────────
  // URL: /meetings/[id]?orderId=...&paymentKey=...&amount=... (Toss 리다이렉트)
  useEffect(() => {
    const orderId = searchParams.get("orderId");
    const paymentKey = searchParams.get("paymentKey");
    const paymentAmount = searchParams.get("amount");

    if (!orderId) return;

    // Toss 결제 성공 콜백 → 서버 검증
    (async () => {
      setPaymentLoading(true);
      setPaymentStatus("결제 검증 중...");
      try {
        const result = await confirmTossPayment({
          order_id: orderId,
          payment_key: paymentKey ?? undefined,
        });
        setPaymentStatus("✅ 결제 완료! 확정 처리 중...");

        if (result.meeting_status === "CONFIRMED" && result.chat_room_id) {
          router.push(`/chats/${result.chat_room_id}`);
          return;
        }
        await fetchMeeting();
        setPaymentStatus("✅ 보증금 결제 완료. 다른 멤버를 기다리는 중...");

        // URL 파라미터 정리 (히스토리 교체)
        router.replace(`/meetings/${meetingId}`);
      } catch (e) {
        setPaymentStatus(null);
        alert(e instanceof Error ? e.message : "결제 검증 실패");
      } finally {
        setPaymentLoading(false);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  /**
   * Toss 결제 위젯 실행
   * - TOSS_CLIENT_KEY가 있으면 실결제 위젯 실행
   * - 없으면 개발용 mock: 바로 서버 confirm 호출
   */
  const handlePayment = async () => {
    setPaymentLoading(true);
    try {
      // 1. 서버에서 주문 정보 획득
      const order = await prepareDeposit(meetingId);

      if (!TOSS_CLIENT_KEY) {
        // ── 개발/테스트 환경: mock 결제 (Toss 위젯 없이 서버 직접 confirm) ──
        setPaymentStatus("개발 환경: mock 결제 진행 중...");
        const result = await confirmTossPayment({ order_id: order.orderId });
        setPaymentStatus("✅ Mock 결제 완료!");

        if (result.meeting_status === "CONFIRMED" && result.chat_room_id) {
          router.push(`/chats/${result.chat_room_id}`);
          return;
        }
        await fetchMeeting();
        return;
      }

      // ── 실제 환경: Toss 결제 위젯 SDK 실행 ──
      // @ts-expect-error — 글로벌 window.TossPayments (CDN 로드)
      const tossPayments = window.TossPayments?.(TOSS_CLIENT_KEY);
      if (!tossPayments) {
        alert("Toss 결제 모듈을 불러오는 중입니다. 잠시 후 다시 시도해주세요.");
        return;
      }

      const successUrl = `${window.location.origin}/meetings/${meetingId}`;
      const failUrl = `${window.location.origin}/meetings/${meetingId}?paymentFail=1`;

      await tossPayments.requestPayment("카드", {
        amount: order.amount,
        orderId: order.orderId,
        orderName: order.orderName,
        customerName: "MEETIN 참가자",
        successUrl,
        failUrl,
      });
      // 성공 시 Toss가 successUrl로 리다이렉트 → useEffect에서 자동 처리
    } catch (e) {
      const msg = e instanceof Error ? e.message : "결제 실패";
      // 사용자가 결제 취소한 경우 에러 무시
      if (msg.includes("취소") || msg.includes("cancel")) {
        setPaymentStatus(null);
      } else {
        alert(msg);
      }
    } finally {
      setPaymentLoading(false);
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

  // confirmed 진행률 계산 (WAITING_CONFIRM 전용)
  const memberSlots = meeting.slots.filter((s) => s.user !== null);
  const confirmedCount = memberSlots.filter((s) => s.confirmed).length;
  const totalMembers = memberSlots.length;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Toss SDK CDN 로드 (실결제 환경만) */}
      {TOSS_CLIENT_KEY && (
        // eslint-disable-next-line @next/next/no-sync-scripts
        <script src="https://js.tosspayments.com/v1/payment" />
      )}

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

        <div className="px-4 py-5 space-y-5">
          {/* 결제 상태 알림 */}
          {paymentStatus && (
            <div className="rounded-xl bg-blue-50 border border-blue-200 px-4 py-3 text-sm text-blue-700 flex items-center gap-2">
              <span className="animate-spin">⏳</span>
              {paymentStatus}
            </div>
          )}

          {/* 미팅 기본 정보 카드 */}
          <div className="rounded-2xl bg-white p-5 shadow-sm border border-gray-100">
            <div className="flex items-start justify-between">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">
                  {MEETING_TYPE_LABEL[meeting.meeting_type] ?? meeting.meeting_type}
                </h1>
                <p className="mt-1 text-sm text-gray-500">
                  미팅 #{meeting.meeting_id}
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

          {/* 팀 슬롯 — 핵심 UI */}
          <div className="space-y-4">
            <TeamSection team="MALE" slots={meeting.slots} />
            <TeamSection team="FEMALE" slots={meeting.slots} />
          </div>

          {/* 액션 영역 */}
          <ActionArea
            meeting={meeting}
            actionLoading={actionLoading}
            paymentLoading={paymentLoading}
            onJoin={handleJoin}
            onLeave={handleLeave}
            onConfirm={handleConfirm}
            onPayment={handlePayment}
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
  paymentLoading: boolean;
  onJoin: () => void;
  onLeave: () => void;
  onConfirm: () => void;
  onPayment: () => void;
  onEnterChat: () => void;
}

function ActionArea({
  meeting,
  actionLoading,
  paymentLoading,
  onJoin,
  onLeave,
  onConfirm,
  onPayment,
  onEnterChat,
}: ActionAreaProps) {
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

    return (
      <div className="space-y-3">
        {/* 결제 안내 카드 */}
        <div className="rounded-xl bg-yellow-50 border border-yellow-200 px-4 py-4 space-y-2">
          <p className="text-sm font-semibold text-yellow-800">⚠️ 보증금 납부 후 참가 확정</p>
          <p className="text-xs text-yellow-700 leading-relaxed">
            노쇼 방지를 위해 <strong>보증금 10,000원</strong>을 납부해야 합니다.
            미팅이 정상적으로 진행되면 전액 환불됩니다.
          </p>
          <div className="flex items-center justify-between pt-1">
            <span className="text-xs text-yellow-600">납부 금액</span>
            <span className="text-sm font-bold text-yellow-800">₩10,000</span>
          </div>
        </div>

        {/* Toss 결제 버튼 */}
        <button
          onClick={onPayment}
          disabled={paymentLoading || actionLoading}
          className="w-full rounded-xl bg-blue-600 py-3.5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50 active:scale-95 transition-all flex items-center justify-center gap-2"
        >
          {paymentLoading ? (
            <>
              <span className="animate-spin">⏳</span>
              결제 처리 중...
            </>
          ) : (
            <>
              💳 보증금 결제 후 참가 확정
            </>
          )}
        </button>

        {/* 직접 확정 버튼 (Toss 키 없는 개발환경에서는 같은 효과) */}
        {!process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY && (
          <p className="text-center text-xs text-gray-400">
            개발 환경: 위 버튼이 mock 결제를 실행합니다
          </p>
        )}

        <button
          onClick={onLeave}
          disabled={actionLoading || paymentLoading}
          className="w-full rounded-xl border border-red-200 bg-white py-3 text-sm font-medium text-red-500 hover:bg-red-50 disabled:opacity-50 transition-all"
        >
          나가기 (보증금 없이)
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
