"use client";

/**
 * /chats/[roomId] — 그룹 채팅방 페이지
 *
 * - AppShell로 감싸서 바텀 탭 표시
 * - 채팅 입력창은 바텀 탭(pb-16) 위에 고정
 * - 나가기 버튼: 대체인원 초대 OR 보증금 차감 선택
 * - 미팅 일정 확정: HOST만 날짜/시간/장소 입력 가능
 * - 2초 폴링으로 메시지 실시간 반영
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  getMessages, sendMessage, getToken,
  getChatRoomInfo, leaveChatRoom, setMeetingSchedule,
  getMeetingSchedule, inviteFriendToMeeting,
} from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { AppShell } from "@/components/ui/AppShell";
import type { ChatMessage } from "@/types";
import { jwtDecode } from "jwt-decode";

function getCurrentUserId(): number | null {
  try {
    const token = getToken();
    if (!token) return null;
    const payload = jwtDecode<{ sub: string }>(token);
    return Number(payload.sub);
  } catch { return null; }
}

export default function ChatRoomPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const roomId = Number(params.roomId);
  const myUserId = getCurrentUserId();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 채팅방 메타 정보 (미팅 ID, host 여부)
  const [roomInfo, setRoomInfo] = useState<{ meeting_id: number; host_user_id: number } | null>(null);

  // 나가기 모달
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  // 일정 확정 모달
  const [showScheduleModal, setShowScheduleModal] = useState(false);

  const lastIdRef = useRef(0);
  const bottomRef = useRef<HTMLDivElement>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // ─── 채팅방 정보 로드 ─────────────────────────────────
  useEffect(() => {
    getChatRoomInfo(roomId).then(setRoomInfo).catch(() => {});
  }, [roomId]);

  // ─── 메시지 fetch ─────────────────────────────────────
  const fetchMessages = useCallback(async () => {
    try {
      const res = await getMessages(roomId, lastIdRef.current);
      if (res.messages.length > 0) {
        setMessages((prev) => [...prev, ...res.messages]);
        lastIdRef.current = res.messages[res.messages.length - 1].id;
        setError(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "메시지를 가져올 수 없습니다");
    }
  }, [roomId]);

  useEffect(() => { fetchMessages(); }, [fetchMessages]);

  useEffect(() => {
    pollingRef.current = setInterval(fetchMessages, 2000);
    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
  }, [fetchMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ─── 메시지 전송 ──────────────────────────────────────
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

  const isHost = roomInfo && myUserId === roomInfo.host_user_id;

  return (
    <AppShell noPadding>
      {/* 채팅방 헤더 */}
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

        {/* 일정 확정 버튼 (HOST만) */}
        {isHost && (
          <button
            onClick={() => setShowScheduleModal(true)}
            className="rounded-xl bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-600 hover:bg-blue-100 transition-colors"
          >
            📅 일정 확정
          </button>
        )}

        {/* 나가기 버튼 */}
        <button
          onClick={() => setShowLeaveModal(true)}
          className="rounded-xl bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-500 hover:bg-red-100 transition-colors"
        >
          나가기
        </button>

        <span className="flex items-center gap-1 text-xs text-gray-400">
          <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
          연결됨
        </span>
      </div>

      {/* 에러 배너 */}
      {error && (
        <div className="bg-red-50 px-4 py-2 text-xs text-red-600 border-b border-red-100">
          ⚠️ {error}
        </div>
      )}

      {/* 메시지 목록 — 하단 탭(56px) + 입력창(80px) 공간 확보 */}
      <div className="overflow-y-auto px-4 py-4 space-y-3" style={{ height: "calc(100vh - 56px - 80px - 60px)" }}>
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-gray-400">첫 인사를 건네보세요! 👋</p>
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

      {/* 입력창 — 바텀 탭 위에 고정 (pb-16 = 64px 탭 높이) */}
      <div className="border-t border-gray-100 bg-white px-4 py-3 pb-20">
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
        <p className="mt-1 text-center text-xs text-gray-300">Enter 전송 · Shift+Enter 줄바꿈</p>
      </div>

      {/* 나가기 모달 */}
      {showLeaveModal && roomInfo && (
        <LeaveModal
          roomId={roomId}
          meetingId={roomInfo.meeting_id}
          onClose={() => setShowLeaveModal(false)}
          onLeft={() => router.replace("/discover")}
        />
      )}

      {/* 일정 확정 모달 */}
      {showScheduleModal && roomInfo && (
        <ScheduleModal
          roomId={roomId}
          meetingId={roomInfo.meeting_id}
          onClose={() => setShowScheduleModal(false)}
          onSent={async () => {
            setShowScheduleModal(false);
            await fetchMessages();
          }}
        />
      )}
    </AppShell>
  );
}

// ─── 나가기 모달 ──────────────────────────────────────────────
function LeaveModal({
  roomId, meetingId, onClose, onLeft,
}: {
  roomId: number; meetingId: number; onClose: () => void; onLeft: () => void;
}) {
  const [step, setStep] = useState<"choice" | "replace" | "forfeit">("choice");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleForfeit = async () => {
    if (!confirm("보증금을 포기하고 나가시겠습니까? 보증금은 환급되지 않습니다.")) return;
    setLoading(true);
    try {
      await leaveChatRoom(roomId, "forfeit");
      onLeft();
    } catch (e) {
      setError(e instanceof Error ? e.message : "처리 실패");
    } finally {
      setLoading(false);
    }
  };

  const handleInviteReplace = async () => {
    if (!phone.trim()) { setError("전화번호를 입력해주세요"); return; }
    setLoading(true);
    try {
      await leaveChatRoom(roomId, "replace", phone.trim());
      alert("대체 인원에게 초대를 발송했습니다. 수락 전까지 채팅방에 남아있어야 합니다.");
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "초대 발송 실패");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40">
      <div className="w-full max-w-md rounded-t-3xl bg-white p-6 pb-10">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">채팅방 나가기</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
        </div>

        {step === "choice" && (
          <div className="space-y-3">
            <p className="text-sm text-gray-600">나가기 방법을 선택해주세요</p>
            <button
              onClick={() => setStep("replace")}
              className="w-full rounded-2xl border-2 border-blue-200 bg-blue-50 p-4 text-left"
            >
              <p className="font-semibold text-blue-800">👥 대체 인원 초대</p>
              <p className="mt-1 text-xs text-blue-600">대체 인원이 수락하면 보증금 환급 후 나갑니다</p>
            </button>
            <button
              onClick={() => setStep("forfeit")}
              className="w-full rounded-2xl border-2 border-red-200 bg-red-50 p-4 text-left"
            >
              <p className="font-semibold text-red-700">💸 보증금 포기 후 나가기</p>
              <p className="mt-1 text-xs text-red-500">보증금은 환급되지 않으며, 미팅은 다시 모집 중 상태로 변경됩니다</p>
            </button>
          </div>
        )}

        {step === "replace" && (
          <div className="space-y-4">
            <button onClick={() => setStep("choice")} className="text-sm text-blue-600">← 뒤로</button>
            <p className="text-sm font-semibold text-gray-700">대체 인원의 전화번호 입력</p>
            <p className="text-xs text-gray-400">친구 목록에 있는 동성 친구에게만 초대할 수 있습니다</p>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="010-0000-0000"
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none focus:border-blue-400"
            />
            {error && <p className="text-xs text-red-500">{error}</p>}
            <button
              onClick={handleInviteReplace}
              disabled={loading}
              className="w-full rounded-xl bg-blue-600 py-3 text-sm font-bold text-white disabled:opacity-50"
            >
              {loading ? "발송 중..." : "초대 발송"}
            </button>
          </div>
        )}

        {step === "forfeit" && (
          <div className="space-y-4">
            <button onClick={() => setStep("choice")} className="text-sm text-blue-600">← 뒤로</button>
            <div className="rounded-2xl bg-red-50 border border-red-200 p-4">
              <p className="font-semibold text-red-800">⚠️ 보증금 포기 안내</p>
              <ul className="mt-2 space-y-1 text-xs text-red-700">
                <li>• 납부한 보증금은 환급되지 않습니다</li>
                <li>• 나가면 미팅이 다시 모집 중 상태로 변경됩니다</li>
                <li>• 기존 채팅 내역은 다른 멤버들에게 유지됩니다</li>
              </ul>
            </div>
            {error && <p className="text-xs text-red-500">{error}</p>}
            <button
              onClick={handleForfeit}
              disabled={loading}
              className="w-full rounded-xl bg-red-500 py-3 text-sm font-bold text-white disabled:opacity-50"
            >
              {loading ? "처리 중..." : "보증금 포기 후 나가기"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── 일정 확정 모달 ────────────────────────────────────────────
function ScheduleModal({
  roomId, meetingId, onClose, onSent,
}: {
  roomId: number; meetingId: number; onClose: () => void; onSent: () => void;
}) {
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [place, setPlace] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 기존 일정 불러오기
  useEffect(() => {
    getMeetingSchedule(meetingId).then((s) => {
      if (s) {
        setDate(s.date ?? "");
        setTime(s.time ?? "");
        setPlace(s.place ?? "");
      }
    }).catch(() => {});
  }, [meetingId]);

  const handleSubmit = async () => {
    if (!date || !time || !place) { setError("날짜, 시간, 장소를 모두 입력해주세요"); return; }
    setLoading(true);
    try {
      await setMeetingSchedule(meetingId, { date, time, place });
      onSent();
    } catch (e) {
      setError(e instanceof Error ? e.message : "일정 설정 실패");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40">
      <div className="w-full max-w-md rounded-t-3xl bg-white p-6 pb-10">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">📅 미팅 일정 설정</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">날짜</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none focus:border-blue-400" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">시간</label>
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)}
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none focus:border-blue-400" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">장소</label>
            <input type="text" value={place} onChange={(e) => setPlace(e.target.value)}
              placeholder="예) 강남역 스타벅스 2층"
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none focus:border-blue-400" />
          </div>
          {error && <p className="text-xs text-red-500">{error}</p>}
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="w-full rounded-xl bg-blue-600 py-3 text-sm font-bold text-white disabled:opacity-50"
          >
            {loading ? "설정 중..." : "일정 확정 알림 보내기"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── 말풍선 ───────────────────────────────────────────────────
function MessageBubble({ message, isMe }: { message: ChatMessage; isMe: boolean }) {
  const time = new Date(message.created_at).toLocaleTimeString("ko-KR", {
    hour: "2-digit", minute: "2-digit",
  });

  // 시스템 메시지 (content가 [SYSTEM]으로 시작)
  if (message.content.startsWith("[SYSTEM]")) {
    return (
      <div className="flex justify-center">
        <div className="rounded-full bg-gray-100 px-4 py-1.5 text-xs text-gray-500">
          {message.content.replace("[SYSTEM] ", "")}
        </div>
      </div>
    );
  }

  return (
    <div className={`flex items-end gap-2 ${isMe ? "flex-row-reverse" : "flex-row"}`}>
      {!isMe && (
        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gray-200 text-xs font-semibold text-gray-600">
          {message.sender_user_id}
        </div>
      )}
      <div className={`flex flex-col gap-1 max-w-[72%] ${isMe ? "items-end" : "items-start"}`}>
        <div className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap break-words ${
          isMe
            ? "rounded-br-sm bg-blue-600 text-white"
            : "rounded-bl-sm bg-white text-gray-900 border border-gray-100 shadow-sm"
        }`}>
          {message.content}
        </div>
        <span className="text-xs text-gray-400">{time}</span>
      </div>
    </div>
  );
}

function SendIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
      <path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z" />
    </svg>
  );
}
