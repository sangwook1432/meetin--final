"use client";

/**
 * /chats/[roomId] — 그룹 채팅방 페이지 (풀 기능)
 *
 * 기능:
 *   - Long Polling (2초마다 새 메시지 조회)
 *   - 채팅방 나가기 (대타 구하기 / 보증금 포기)
 *   - 미팅 취소 제안 버튼
 *   - 일정 제안 버튼 (호스트 전용)
 *   - 현재 일정 표시
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  getMessages,
  sendMessage,
  getToken,
  leaveChat,
  requestCancelMeeting,
  confirmCancelMeeting,
  proposeSchedule,
  getMeetingSchedule,
  getMeeting,
} from "@/lib/api";
import type { ChatMessage, MeetingDetail, MeetingScheduleItem } from "@/types";
import { jwtDecode } from "jwt-decode";

// ─── JWT에서 현재 user_id 추출 ────────────────────────────

function getCurrentUserId(): number | null {
  try {
    const token = getToken();
    if (!token) return null;
    const payload = jwtDecode<{ sub: string }>(token);
    return Number(payload.sub);
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────

export default function ChatRoomPage() {
  const params = useParams();
  const router = useRouter();
  const roomId = Number(params.roomId);
  const myUserId = getCurrentUserId();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [meeting, setMeeting] = useState<MeetingDetail | null>(null);
  const [schedule, setSchedule] = useState<MeetingScheduleItem | null>(null);

  // ── 모달 상태 ──
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [leaveMode, setLeaveMode] = useState<"substitute" | "forfeit" | null>(null);
  const [substitutePhone, setSubstitutePhone] = useState("");
  const [leaveLoading, setLeaveLoading] = useState(false);

  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [scheduleDate, setScheduleDate] = useState("");
  const [scheduleTime, setScheduleTime] = useState("");
  const [scheduleLocation, setScheduleLocation] = useState("");
  const [scheduleNote, setScheduleNote] = useState("");
  const [scheduleLoading, setScheduleLoading] = useState(false);

  const [showMenuPanel, setShowMenuPanel] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);

  const isFetchingRef = useRef(false);
  const lastIdRef = useRef(0);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // ─── 미팅 정보 + 일정 가져오기 ────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const schedRes = await getMeetingSchedule(roomId);
        setSchedule(schedRes.schedule);
      } catch {}
    })();
  }, [roomId]);

  // ─── 메시지 폴링 ──────────────────────────────────────

  const fetchMessages = useCallback(async () => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    try {
      const res = await getMessages(roomId, lastIdRef.current);
      if (res.messages && res.messages.length > 0) {
        setMessages((prev) => {
          const existingIds = new Set(prev.map((m) => m.id));
          const newMsgs = res.messages.filter((m: ChatMessage) => !existingIds.has(m.id));
          if (newMsgs.length === 0) return prev;
          return [...prev, ...newMsgs];
        });
        const lastMsg = res.messages[res.messages.length - 1];
        lastIdRef.current = lastMsg.id;
        setError(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "메시지를 가져올 수 없습니다");
    } finally {
      isFetchingRef.current = false;
    }
  }, [roomId]);

  useEffect(() => {
    fetchMessages();
    const interval = setInterval(fetchMessages, 2000);
    return () => clearInterval(interval);
  }, [fetchMessages]);

  useEffect(() => {
    if (messages.length > 0) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  // ─── 메시지 전송 ────────────────────────────────────────

  const handleSend = async () => {
    const content = input.trim();
    if (!content || sending) return;
    setSending(true);
    try {
      await sendMessage(roomId, content);
      setInput("");
      await fetchMessages();
    } catch (e) {
      alert(e instanceof Error ? e.message : "전송 실패");
    } finally {
      setSending(false);
      textareaRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // ─── 나가기 처리 ────────────────────────────────────────

  const handleLeave = async () => {
    if (!leaveMode) return;
    if (leaveMode === "substitute" && !substitutePhone.trim()) {
      alert("대타 전화번호를 입력해주세요.");
      return;
    }
    if (leaveMode === "forfeit") {
      if (!confirm("보증금을 포기하고 나가시겠습니까? 이 작업은 취소할 수 없습니다.")) return;
    }
    setLeaveLoading(true);
    try {
      await leaveChat(roomId, {
        mode: leaveMode,
        substitute_phone: leaveMode === "substitute" ? substitutePhone.trim() : undefined,
      });
      setShowLeaveModal(false);
      if (leaveMode === "forfeit") {
        alert("보증금을 포기하고 나갔습니다.");
        router.replace("/my-meetings");
      } else {
        alert("대타 요청을 전송했습니다. 수락될 때까지 채팅방에 유지됩니다.");
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : "나가기 실패");
    } finally {
      setLeaveLoading(false);
    }
  };

  // ─── 취소 제안 ──────────────────────────────────────────

  const handleCancelRequest = async () => {
    if (!confirm("미팅 취소를 제안하시겠습니까? 채팅방에 취소 투표 메시지가 올라갑니다.")) return;
    setCancelLoading(true);
    try {
      await requestCancelMeeting(roomId);
      setShowMenuPanel(false);
      await fetchMessages();
    } catch (e) {
      alert(e instanceof Error ? e.message : "취소 제안 실패");
    } finally {
      setCancelLoading(false);
    }
  };

  const handleCancelConfirm = async () => {
    if (!confirm("미팅을 확정 취소하시겠습니까? 모든 보증금이 환불 처리됩니다.")) return;
    setCancelLoading(true);
    try {
      await confirmCancelMeeting(roomId);
      setShowMenuPanel(false);
      alert("미팅이 취소되었습니다. 보증금은 환불 처리됩니다.");
      await fetchMessages();
    } catch (e) {
      alert(e instanceof Error ? e.message : "취소 확정 실패");
    } finally {
      setCancelLoading(false);
    }
  };

  // ─── 일정 제안 ──────────────────────────────────────────

  const handleProposeSchedule = async () => {
    if (!scheduleDate || !scheduleTime) {
      alert("날짜와 시간을 입력해주세요.");
      return;
    }
    setScheduleLoading(true);
    try {
      const scheduledAt = `${scheduleDate}T${scheduleTime}:00`;
      const res = await proposeSchedule(roomId, {
        scheduled_at: scheduledAt,
        location: scheduleLocation.trim() || undefined,
        note: scheduleNote.trim() || undefined,
      });
      setSchedule({
        id: res.schedule_id,
        scheduled_at: res.scheduled_at,
        location: res.location,
      });
      setShowScheduleModal(false);
      setScheduleDate("");
      setScheduleTime("");
      setScheduleLocation("");
      setScheduleNote("");
      setShowMenuPanel(false);
      await fetchMessages();
    } catch (e) {
      alert(e instanceof Error ? e.message : "일정 제안 실패");
    } finally {
      setScheduleLoading(false);
    }
  };

  // ─────────────────────────────────────────────────────────

  const isHost = meeting ? meeting.host_user_id === myUserId : false;

  return (
    <div className="flex h-screen flex-col bg-gray-50">
      {/* 헤더 */}
      <div className="flex items-center gap-3 border-b border-gray-100 bg-white px-4 py-3 shadow-sm">
        <button
          onClick={() => router.back()}
          className="rounded-full p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
        >
          ←
        </button>
        <div className="flex-1">
          <h1 className="font-semibold text-gray-900 text-sm">그룹 채팅방</h1>
          <p className="text-xs text-gray-400">Room #{roomId}</p>
        </div>

        {/* 일정 표시 배지 */}
        {schedule && (
          <div className="flex-shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 border border-emerald-100">
            📅 {new Date(schedule.scheduled_at).toLocaleDateString("ko-KR", { month: "short", day: "numeric" })}
            {schedule.location && ` · ${schedule.location}`}
          </div>
        )}

        {/* 더보기 메뉴 버튼 */}
        <button
          onClick={() => setShowMenuPanel(true)}
          className="flex-shrink-0 rounded-full p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
        >
          <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
            <circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/>
          </svg>
        </button>

        <div className="flex-shrink-0 flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
        </div>
      </div>

      {/* 에러 배너 */}
      {error && (
        <div className="bg-red-50 px-4 py-2 text-xs text-red-600 border-b border-red-100">
          ⚠️ {error}
        </div>
      )}

      {/* 메시지 목록 */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-gray-400">
              아직 메시지가 없습니다. 첫 인사를 건네보세요! 👋
            </p>
          </div>
        ) : (
          messages.map((msg) => (
            <MessageBubble
              key={msg.id}
              message={msg}
              isMe={msg.sender_user_id === myUserId}
            />
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* 입력창 */}
      <div className="border-t border-gray-100 bg-white px-4 py-3">
        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="메시지를 입력하세요..."
            rows={1}
            className="flex-1 resize-none rounded-2xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-blue-400 focus:bg-white transition-all max-h-32 overflow-y-auto"
            style={{ minHeight: "44px" }}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || sending}
            className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 active:scale-95 transition-all"
          >
            <SendIcon />
          </button>
        </div>
        <p className="mt-1.5 text-center text-xs text-gray-300">
          Enter 전송 · Shift+Enter 줄바꿈
        </p>
      </div>

      {/* ── 더보기 패널 (슬라이드 업) ── */}
      {showMenuPanel && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setShowMenuPanel(false)}
          />
          <div className="relative bg-white rounded-t-3xl px-5 py-6 shadow-xl">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-base font-bold text-gray-900">채팅방 메뉴</h2>
              <button
                onClick={() => setShowMenuPanel(false)}
                className="text-gray-400 hover:text-gray-600 text-lg"
              >
                ✕
              </button>
            </div>

            <div className="flex flex-col gap-3">
              {/* 일정 제안 (호스트 전용) */}
              <button
                onClick={() => {
                  setShowMenuPanel(false);
                  setShowScheduleModal(true);
                }}
                className="flex items-center gap-4 rounded-2xl bg-blue-50 px-4 py-3.5 text-left hover:bg-blue-100 transition-colors"
              >
                <span className="text-2xl">📅</span>
                <div>
                  <p className="text-sm font-semibold text-blue-900">
                    일정 제안
                    {/* 호스트 아닌 경우에도 볼 수 있게 */}
                  </p>
                  <p className="text-xs text-blue-600">미팅 날짜·시간·장소를 제안합니다</p>
                </div>
              </button>

              {/* 현재 일정 보기 */}
              {schedule && (
                <div className="rounded-2xl bg-emerald-50 px-4 py-3.5 border border-emerald-100">
                  <p className="text-xs font-semibold text-emerald-700 mb-1">📌 현재 확정 일정</p>
                  <p className="text-sm font-bold text-emerald-900">
                    {new Date(schedule.scheduled_at).toLocaleString("ko-KR", {
                      year: "numeric", month: "long", day: "numeric",
                      hour: "2-digit", minute: "2-digit",
                    })}
                  </p>
                  {schedule.location && (
                    <p className="text-xs text-emerald-700 mt-0.5">📍 {schedule.location}</p>
                  )}
                </div>
              )}

              {/* 미팅 취소 제안 */}
              <button
                onClick={handleCancelRequest}
                disabled={cancelLoading}
                className="flex items-center gap-4 rounded-2xl bg-orange-50 px-4 py-3.5 text-left hover:bg-orange-100 transition-colors disabled:opacity-50"
              >
                <span className="text-2xl">🚫</span>
                <div>
                  <p className="text-sm font-semibold text-orange-900">미팅 취소 제안</p>
                  <p className="text-xs text-orange-600">채팅방에 취소 투표 메시지를 올립니다</p>
                </div>
              </button>

              {/* 미팅 취소 확정 (호스트 전용 표시) */}
              <button
                onClick={handleCancelConfirm}
                disabled={cancelLoading}
                className="flex items-center gap-4 rounded-2xl bg-red-50 px-4 py-3.5 text-left hover:bg-red-100 transition-colors disabled:opacity-50"
              >
                <span className="text-2xl">❌</span>
                <div>
                  <p className="text-sm font-semibold text-red-900">미팅 취소 확정 (호스트)</p>
                  <p className="text-xs text-red-600">모든 보증금을 환불하고 미팅을 취소합니다</p>
                </div>
              </button>

              {/* 채팅방 나가기 */}
              <button
                onClick={() => {
                  setShowMenuPanel(false);
                  setShowLeaveModal(true);
                }}
                className="flex items-center gap-4 rounded-2xl bg-gray-100 px-4 py-3.5 text-left hover:bg-gray-200 transition-colors"
              >
                <span className="text-2xl">🚪</span>
                <div>
                  <p className="text-sm font-semibold text-gray-900">채팅방 나가기</p>
                  <p className="text-xs text-gray-500">대타 구하기 또는 보증금 포기</p>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 나가기 모달 ── */}
      {showLeaveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => { setShowLeaveModal(false); setLeaveMode(null); setSubstitutePhone(""); }}
          />
          <div className="relative bg-white rounded-3xl p-6 w-[90%] max-w-sm shadow-2xl">
            <h2 className="text-base font-bold text-gray-900 mb-1">채팅방 나가기</h2>
            <p className="text-xs text-gray-500 mb-5">
              확정된 미팅에서 나가는 방법을 선택하세요.
            </p>

            {/* 모드 선택 */}
            {!leaveMode ? (
              <div className="flex flex-col gap-3">
                <button
                  onClick={() => setLeaveMode("substitute")}
                  className="flex items-start gap-3 rounded-2xl border-2 border-blue-200 bg-blue-50 p-4 text-left hover:border-blue-400 transition-colors"
                >
                  <span className="text-2xl mt-0.5">🔄</span>
                  <div>
                    <p className="text-sm font-bold text-blue-900">대타 구하기</p>
                    <p className="text-xs text-blue-600 mt-0.5">
                      대타 후보를 지정합니다. 수락하면 보증금 환불 + 퇴장됩니다.
                    </p>
                  </div>
                </button>

                <button
                  onClick={() => setLeaveMode("forfeit")}
                  className="flex items-start gap-3 rounded-2xl border-2 border-red-200 bg-red-50 p-4 text-left hover:border-red-400 transition-colors"
                >
                  <span className="text-2xl mt-0.5">💸</span>
                  <div>
                    <p className="text-sm font-bold text-red-900">보증금 포기하고 나가기</p>
                    <p className="text-xs text-red-600 mt-0.5">
                      보증금이 몰수되고 즉시 나가집니다. 빈 자리는 재모집됩니다.
                    </p>
                  </div>
                </button>

                <button
                  onClick={() => setShowLeaveModal(false)}
                  className="mt-1 text-center text-sm text-gray-400 hover:text-gray-600"
                >
                  취소
                </button>
              </div>
            ) : leaveMode === "substitute" ? (
              <div className="flex flex-col gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                    대타 후보 전화번호
                  </label>
                  <input
                    type="tel"
                    placeholder="010-1234-5678"
                    value={substitutePhone}
                    onChange={(e) => setSubstitutePhone(e.target.value)}
                    className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-blue-400"
                  />
                  <p className="mt-1 text-xs text-gray-400">
                    MEETIN에 가입된 회원의 전화번호를 입력하세요.
                  </p>
                </div>
                <button
                  onClick={handleLeave}
                  disabled={leaveLoading || !substitutePhone.trim()}
                  className="w-full rounded-2xl bg-blue-600 py-3 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-40 transition-colors"
                >
                  {leaveLoading ? "요청 중..." : "대타 요청 보내기"}
                </button>
                <button
                  onClick={() => setLeaveMode(null)}
                  className="text-center text-sm text-gray-400 hover:text-gray-600"
                >
                  ← 뒤로
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="rounded-2xl bg-red-50 p-4 border border-red-100">
                  <p className="text-sm font-bold text-red-800 mb-1">⚠️ 주의사항</p>
                  <ul className="text-xs text-red-700 space-y-1 list-disc list-inside">
                    <li>보증금이 즉시 몰수됩니다.</li>
                    <li>나간 후에는 되돌릴 수 없습니다.</li>
                    <li>빈 자리는 동일 성별로 재모집됩니다.</li>
                  </ul>
                </div>
                <button
                  onClick={handleLeave}
                  disabled={leaveLoading}
                  className="w-full rounded-2xl bg-red-600 py-3 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-40 transition-colors"
                >
                  {leaveLoading ? "처리 중..." : "보증금 포기하고 나가기"}
                </button>
                <button
                  onClick={() => setLeaveMode(null)}
                  className="text-center text-sm text-gray-400 hover:text-gray-600"
                >
                  ← 뒤로
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── 일정 제안 모달 ── */}
      {showScheduleModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setShowScheduleModal(false)}
          />
          <div className="relative bg-white rounded-t-3xl px-5 py-6 w-full max-w-md shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-bold text-gray-900">📅 미팅 일정 제안</h2>
              <button
                onClick={() => setShowScheduleModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>

            <div className="flex flex-col gap-3">
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">날짜 *</label>
                  <input
                    type="date"
                    value={scheduleDate}
                    onChange={(e) => setScheduleDate(e.target.value)}
                    className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-blue-400"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">시간 *</label>
                  <input
                    type="time"
                    value={scheduleTime}
                    onChange={(e) => setScheduleTime(e.target.value)}
                    className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-blue-400"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">장소</label>
                <input
                  type="text"
                  placeholder="예: 강남역 2번 출구 스타벅스"
                  value={scheduleLocation}
                  onChange={(e) => setScheduleLocation(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-blue-400"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">메모 (선택)</label>
                <textarea
                  placeholder="참고 사항을 입력하세요..."
                  value={scheduleNote}
                  onChange={(e) => setScheduleNote(e.target.value)}
                  rows={2}
                  className="w-full resize-none rounded-xl border border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-blue-400"
                />
              </div>

              <button
                onClick={handleProposeSchedule}
                disabled={scheduleLoading || !scheduleDate || !scheduleTime}
                className="w-full rounded-2xl bg-blue-600 py-3 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-40 transition-colors"
              >
                {scheduleLoading ? "제안 중..." : "일정 제안하기"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── 말풍선 컴포넌트 ──────────────────────────────────────

interface MessageBubbleProps {
  message: ChatMessage & { sender_nickname?: string; msg_type?: string };
  isMe: boolean;
}

function MessageBubble({ message, isMe }: MessageBubbleProps) {
  const time = new Date(message.created_at).toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
  });

  // 시스템 메시지 처리
  const isSystem =
    message.msg_type === "SYSTEM" ||
    message.msg_type === "CANCEL_REQUEST" ||
    message.msg_type === "SCHEDULE_PROPOSE";

  if (isSystem) {
    return (
      <div className="flex justify-center my-2">
        <div className="max-w-[85%] rounded-2xl bg-gray-100 px-4 py-2.5 text-center">
          <p className="text-xs text-gray-600 whitespace-pre-wrap">{message.content}</p>
          <p className="text-xs text-gray-400 mt-1">{time}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex items-end gap-2 ${isMe ? "flex-row-reverse" : "flex-row"}`}>
      {!isMe && (
        <div className="flex h-8 w-8 flex-shrink-0 flex-col items-center justify-center rounded-full bg-gradient-to-br from-blue-400 to-blue-600 text-xs font-bold text-white">
          {(message as any).sender_nickname
            ? (message as any).sender_nickname.slice(0, 1)
            : String(message.sender_user_id).slice(-2)}
        </div>
      )}

      <div className={`flex flex-col gap-1 max-w-[72%] ${isMe ? "items-end" : "items-start"}`}>
        {!isMe && (message as any).sender_nickname && (
          <span className="text-xs text-gray-500 px-1">{(message as any).sender_nickname}</span>
        )}
        <div
          className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap break-words ${
            isMe
              ? "rounded-br-sm bg-blue-600 text-white"
              : "rounded-bl-sm bg-white text-gray-900 border border-gray-100 shadow-sm"
          }`}
        >
          {message.content}
        </div>
        <span className="text-xs text-gray-400">{time}</span>
      </div>
    </div>
  );
}

// ─── 전송 아이콘 ──────────────────────────────────────────

function SendIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      className="h-5 w-5"
    >
      <path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z" />
    </svg>
  );
}
