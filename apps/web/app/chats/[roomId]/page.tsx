"use client";

/**
 * /chats/[roomId] — 그룹 채팅방 페이지
 *
 * 구현 방식: Long Polling (MVP)
 *   - 2초마다 GET /chats/{roomId}?since_id={lastId} 호출
 *   - 새 메시지 있으면 리스트에 append
 *   - WebSocket은 다음 단계에서 도입 예정
 *
 * 접근 제어:
 *   - 백엔드에서 meeting_slots 기반으로 멤버 여부 검증
 *   - 비멤버 → 403 → login redirect (api.ts에서 처리)
 *
 * 핵심 UX:
 *   - 새 메시지 수신 시 자동 스크롤 (scrollIntoView)
 *   - 내 메시지 오른쪽 / 상대 메시지 왼쪽 정렬
 *   - Enter로 전송, Shift+Enter로 줄바꿈
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { getMessages, sendMessage, getToken } from "@/lib/api";
import type { ChatMessage } from "@/types";
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

  const lastIdRef = useRef(0);
  const bottomRef = useRef<HTMLDivElement>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // ─── 메시지 fetch ──────────────────────────────────────

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

  // 초기 로드
  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  // 폴링: 2초마다
  useEffect(() => {
    pollingRef.current = setInterval(fetchMessages, 2000);
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [fetchMessages]);

  // 새 메시지 수신 시 자동 스크롤
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ─── 메시지 전송 ───────────────────────────────────────

  const handleSend = async () => {
    const content = input.trim();
    if (!content || sending) return;

    setSending(true);
    try {
      await sendMessage(roomId, content);
      setInput("");
      // 전송 직후 즉시 폴링 → 내 메시지도 바로 보임
      await fetchMessages();
    } catch (e) {
      alert(e instanceof Error ? e.message : "전송 실패");
    } finally {
      setSending(false);
      textareaRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter 전송, Shift+Enter 줄바꿈
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // ─── 렌더 ─────────────────────────────────────────────

  return (
    <div className="flex h-screen flex-col bg-gray-50">
      {/* 채팅방 헤더 */}
      <div className="flex items-center gap-3 border-b border-gray-100 bg-white px-4 py-3 shadow-sm">
        <button
          onClick={() => router.back()}
          className="rounded-full p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
        >
          ←
        </button>
        <div>
          <h1 className="font-semibold text-gray-900 text-sm">그룹 채팅방</h1>
          <p className="text-xs text-gray-400">Room #{roomId}</p>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          {/* 실시간 연결 표시 (폴링이지만 UX용) */}
          <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-xs text-gray-400">연결됨</span>
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
        {/* 자동 스크롤 앵커 */}
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
    </div>
  );
}

// ─── 말풍선 컴포넌트 ───────────────────────────────────────

interface MessageBubbleProps {
  message: ChatMessage;
  isMe: boolean;
}

function MessageBubble({ message, isMe }: MessageBubbleProps) {
  const time = new Date(message.created_at).toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className={`flex items-end gap-2 ${isMe ? "flex-row-reverse" : "flex-row"}`}>
      {/* 상대방 아바타 (내 메시지에는 표시 안 함) */}
      {!isMe && (
        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gray-200 text-xs font-semibold text-gray-600">
          {message.sender_user_id}
        </div>
      )}

      <div className={`flex flex-col gap-1 max-w-[72%] ${isMe ? "items-end" : "items-start"}`}>
        {/* 메시지 버블 */}
        <div
          className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap break-words ${
            isMe
              ? "rounded-br-sm bg-blue-600 text-white"
              : "rounded-bl-sm bg-white text-gray-900 border border-gray-100 shadow-sm"
          }`}
        >
          {message.content}
        </div>
        {/* 시간 */}
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
