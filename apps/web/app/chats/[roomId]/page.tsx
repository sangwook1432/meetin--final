"use client";

/**
 * /chats/[roomId] — 그룹 채팅방 페이지
 *
 * 기능:
 * - 닉네임 / 미읽음 수 표시
 * - 🗳️ 투표함 버튼 → 활성 투표 모달 (동의 / 비동의 / 철회)
 * - 나가기 버튼 (forfeit / replace)
 * - HOST: 일정 제안 / 수정
 * - 채팅 메시지에서 투표 버튼 제거 → 정보성 표시만
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  getMessages, sendMessage, getToken, markRead,
  getChatRoomInfo, leaveChatRoom, setMeetingSchedule,
  getMeetingSchedule, proposeCancelMeeting,
  agreeToCancelMeeting, agreeToSchedule,
  withdrawCancelVote, disagreeToCancelMeeting,
  withdrawScheduleVote, disagreeToSchedule,
  listFriends,
} from "@/lib/api";
import type { ChatRoomInfo, FriendItem } from "@/lib/api";

const WS_BASE = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000")
  .replace(/^https:\/\//, "wss://")
  .replace(/^http:\/\//, "ws://");
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
  const roomId = Number(params.roomId);
  const myUserId = getCurrentUserId();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [roomInfo, setRoomInfo] = useState<ChatRoomInfo | null>(null);

  // 모달 상태
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [showVoteModal, setShowVoteModal] = useState(false);

  const lastIdRef = useRef(0);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // ─── WebSocket ────────────────────────────────────────────────
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectDelayRef = useRef(1000);
  const [wsConnected, setWsConnected] = useState(false);
  const mountedRef = useRef(true);   // 컴포넌트 언마운트 후 reconnect 방지
  const navigatedRef = useRef(false); // room_closed 이중 navigate 방지
  const readTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null); // 읽음 기록 디바운스

  // ─── 채팅방 정보 로드 ─────────────────────────────────────────
  const fetchRoomInfo = useCallback(async () => {
    try {
      const info = await getChatRoomInfo(roomId);
      setRoomInfo(info);
    } catch { /* ignore */ }
  }, [roomId]);

  // ─── 초기 메시지 로드 (마운트 1회 + WS 재연결 캐치업) ────────
  const fetchMessages = useCallback(async (sinceId = 0) => {
    try {
      const res = await getMessages(roomId, sinceId);
      if (res.messages.length > 0) {
        setMessages((prev) => {
          const fetchedMap = new Map(res.messages.map((m) => [m.id, m]));
          // 기존 메시지의 unread_count 갱신 (읽은 사람 수 반영)
          const updated = prev.map((m) => {
            const fresh = fetchedMap.get(m.id);
            return fresh ? { ...m, unread_count: fresh.unread_count } : m;
          });
          // 새 메시지 추가
          const existingIds = new Set(prev.map((m) => m.id));
          const newMsgs = res.messages.filter((m) => !existingIds.has(m.id));
          return newMsgs.length > 0 ? [...updated, ...newMsgs] : updated;
        });
        lastIdRef.current = res.messages[res.messages.length - 1].id;
        setError(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "메시지를 가져올 수 없습니다");
    }
  }, [roomId]);

  // ─── WS 연결 ──────────────────────────────────────────────────
  const connectWs = useCallback(() => {
    const token = getToken();
    if (!token) return;

    const ws = new WebSocket(`${WS_BASE}/ws/chats/${roomId}?token=${token}`);
    wsRef.current = ws;

    ws.onopen = () => {
      setWsConnected(true);
      reconnectDelayRef.current = 1000;
      // 재연결 시 놓친 메시지 캐치업
      fetchMessages(lastIdRef.current);
      fetchRoomInfo();
    };

    ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);

        if (data.type === "message") {
          setMessages((prev) => {
            if (prev.some((m) => m.id === data.id)) return prev;
            return [...prev, {
              id: data.id,
              room_id: data.room_id,
              sender_user_id: data.sender_user_id,
              sender_nickname: data.sender_nickname ?? null,
              sender_photo_url: data.sender_photo_url ?? null,
              content: data.content,
              created_at: data.created_at,
              unread_count: data.unread_count ?? 0,
            }];
          });
          lastIdRef.current = Math.max(lastIdRef.current, data.id);
          // 디바운스 2초 후 읽음 기록 갱신 → 서버가 refresh_unreads 브로드캐스트
          if (readTimerRef.current) clearTimeout(readTimerRef.current);
          readTimerRef.current = setTimeout(() => {
            markRead(roomId, lastIdRef.current).catch(() => {});
          }, 2000);

        } else if (data.type === "refresh_unreads") {
          // 읽음 기록 변경 → 최근 메시지 unread_count 갱신
          fetchMessages(Math.max(0, lastIdRef.current - 99));

        } else if (data.type === "refresh_info") {
          fetchRoomInfo();

        } else if (data.type === "room_closed") {
          fetchRoomInfo();
          // 이미 navigate한 경우(forfeit/투표 완료) 중복 이동 방지
          setTimeout(() => {
            if (!navigatedRef.current) {
              navigatedRef.current = true;
              router.replace("/chats");
            }
          }, 1500);
        }
      } catch { /* JSON parse 실패 무시 */ }
    };

    ws.onclose = (event) => {
      setWsConnected(false);
      wsRef.current = null;
      // 4001~4099: 영구 에러(잘못된 토큰/비멤버/방 없음) → 재연결 불필요
      const isPermanent = event.code >= 4001 && event.code <= 4099;
      if (!isPermanent && mountedRef.current) {
        reconnectRef.current = setTimeout(() => {
          if (!mountedRef.current) return;
          reconnectDelayRef.current = Math.min(reconnectDelayRef.current * 2, 30_000);
          connectWs();
        }, reconnectDelayRef.current);
      }
    };

    ws.onerror = () => ws.close(); // onclose에서 재연결 처리
  }, [roomId, fetchMessages, fetchRoomInfo, router]);

  useEffect(() => {
    fetchRoomInfo();
    fetchMessages(0);
    connectWs();
    return () => {
      mountedRef.current = false;
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      if (readTimerRef.current) clearTimeout(readTimerRef.current);
      wsRef.current?.close();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ─── 메시지 전송 ───────────────────────────────────────────────
  const handleSend = async () => {
    const content = input.trim();
    if (!content || sending) return;
    setSending(true);
    try {
      await sendMessage(roomId, content);
      setInput("");
      // WS 브로드캐스트로 메시지가 자동 추가됨 (fetchMessages 불필요)
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

  // ─── 취소 투표 제안 ─────────────────────────────────────────────
  const handleCancelPropose = async () => {
    if (!confirm("미팅 취소 투표를 시작하시겠습니까? 전원 동의 시 미팅이 취소되고 매칭권이 환급됩니다.")) return;
    try {
      await proposeCancelMeeting(roomId);
      await fetchRoomInfo();
      setShowVoteModal(true);
    } catch (e) {
      alert(e instanceof Error ? e.message : "투표 시작 실패");
    }
  };

  const isHost = roomInfo && myUserId === roomInfo.host_user_id;
  const isClosed = roomInfo?.is_closed ?? false;
  const isScheduleConfirmed = roomInfo?.schedule?.confirmed ?? false;
  const hasCancelVote = (roomInfo?.cancel_vote_count ?? 0) > 0;
  const hasScheduleVote = (roomInfo?.schedule_vote_count ?? 0) > 0 && !isScheduleConfirmed;
  const activeVoteCount = (hasCancelVote ? 1 : 0) + (hasScheduleVote ? 1 : 0);

  return (
    <AppShell noPadding>
      {/* 헤더 */}
      <div className="flex items-center gap-2 border-b border-gray-100 bg-white px-4 py-3 shadow-sm">
        <button
          onClick={() => router.back()}
          className="rounded-full p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
        >
          ←
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="font-semibold text-gray-900 text-sm truncate">그룹 채팅방</h1>
          <p className="text-xs text-gray-400 flex items-center gap-1">
            <span className={`inline-block h-1.5 w-1.5 rounded-full ${wsConnected ? "bg-green-400" : "bg-gray-300"}`} />
            {wsConnected ? "실시간 연결됨" : "연결 중..."}
          </p>
        </div>

        {/* 일정 미확정 상태 버튼들 — 읽기전용이면 숨김 */}
        {!isScheduleConfirmed && !isClosed && (
          <>
            {activeVoteCount > 0 && (
              <button
                onClick={() => setShowVoteModal(true)}
                className="relative rounded-xl bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-100 transition-colors whitespace-nowrap"
              >
                🗳️ 투표함
                <span className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
                  {activeVoteCount}
                </span>
              </button>
            )}
            {isHost && (
              <button
                onClick={() => setShowScheduleModal(true)}
                className="rounded-xl bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-600 hover:bg-blue-100 transition-colors whitespace-nowrap"
              >
                📅 일정 제안
              </button>
            )}
            {!hasCancelVote && (
              <button
                onClick={handleCancelPropose}
                className="rounded-xl bg-orange-50 px-3 py-1.5 text-xs font-semibold text-orange-600 hover:bg-orange-100 transition-colors whitespace-nowrap"
              >
                ❌
              </button>
            )}
          </>
        )}

        {/* 일정 확정 후 버튼들 — 읽기전용이면 숨김 */}
        {isScheduleConfirmed && !isClosed && (
          <>
            {isHost && (
              <button
                onClick={() => setShowScheduleModal(true)}
                className="rounded-xl bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-600 hover:bg-blue-100 transition-colors whitespace-nowrap"
              >
                ✏️ 미팅 수정
              </button>
            )}
            <button
              onClick={hasCancelVote ? () => setShowVoteModal(true) : handleCancelPropose}
              className="relative rounded-xl bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-100 transition-colors whitespace-nowrap"
            >
              🚫 미팅 취소
              {hasCancelVote && (
                <span className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
                  !
                </span>
              )}
            </button>
          </>
        )}

        {/* 나가기 버튼 */}
        <button
          onClick={() => setShowLeaveModal(true)}
          className="rounded-xl bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-500 hover:bg-red-100 transition-colors whitespace-nowrap"
        >
          나가기
        </button>
      </div>

      {/* 채팅방 종료 배너 */}
      {isClosed && (
        <div className="bg-purple-50 px-4 py-2 text-xs text-purple-700 border-b border-purple-100 text-center font-medium">
          미팅이 완료된 채팅방입니다. 읽기 전용으로 전환되었습니다.
        </div>
      )}

      {/* 에러 배너 */}
      {error && (
        <div className="bg-red-50 px-4 py-2 text-xs text-red-600 border-b border-red-100">
          ⚠️ {error}
        </div>
      )}

      {/* 메시지 목록 */}
      <div className="overflow-y-auto px-4 py-4 space-y-3" style={{ height: "calc(100vh - 56px - 80px - 60px)" }}>
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-gray-400">첫 인사를 건네보세요! 👋</p>
          </div>
        ) : (
          messages.map((msg, idx) => {
            const prevMsg = idx > 0 ? messages[idx - 1] : null;
            const sameSenderAsPrev = prevMsg?.sender_user_id === msg.sender_user_id;
            return (
              <MessageBubble
                key={msg.id}
                message={msg}
                isMe={msg.sender_user_id === myUserId}
                showNickname={!sameSenderAsPrev}
              />
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* 입력창 */}
      {isClosed ? (
        <div className="border-t border-gray-100 bg-gray-50 px-4 py-4 pb-20 text-center text-sm text-gray-400">
          채팅이 종료되었습니다
        </div>
      ) : (
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
      )}

      {/* 투표함 모달 */}
      {showVoteModal && roomInfo && (
        <VoteModal
          roomId={roomId}
          roomInfo={roomInfo}
          myUserId={myUserId}
          onClose={() => setShowVoteModal(false)}
          onVoted={async () => {
            await fetchRoomInfo();
          }}
          onCancelled={() => {
            if (!navigatedRef.current) { navigatedRef.current = true; router.replace("/chats"); }
          }}
        />
      )}

      {/* 나가기 모달 */}
      {showLeaveModal && roomInfo && (
        <LeaveModal
          roomId={roomId}
          meetingId={roomInfo.meeting_id}
          isClosed={isClosed}
          onClose={() => setShowLeaveModal(false)}
          onLeft={() => {
            if (!navigatedRef.current) { navigatedRef.current = true; router.replace("/discover"); }
          }}
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
            await fetchRoomInfo();
            setShowVoteModal(true);
          }}
        />
      )}
    </AppShell>
  );
}

// ─── 투표함 모달 ──────────────────────────────────────────────────
function VoteModal({
  roomId, roomInfo, myUserId, onClose, onVoted, onCancelled,
}: {
  roomId: number;
  roomInfo: ChatRoomInfo;
  myUserId: number | null;
  onClose: () => void;
  onVoted: () => Promise<void>;
  onCancelled: () => void;
}) {
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const hasCancelVote = roomInfo.cancel_vote_count > 0;
  const hasScheduleVote = roomInfo.schedule_vote_count > 0 && !roomInfo.schedule?.confirmed;
  const hasNoVote = !hasCancelVote && !hasScheduleVote;

  const act = async (action: () => Promise<unknown>, key: string) => {
    setLoading(key);
    setError(null);
    try {
      const res = await action() as { status?: string };
      await onVoted();
      if (res?.status === "cancelled") {
        onCancelled();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "처리 실패");
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={onClose}>
      <div className="w-full max-w-md rounded-t-3xl bg-white p-6 pb-10 max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">🗳️ 투표함</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
        </div>

        {error && (
          <div className="mb-4 rounded-xl bg-red-50 border border-red-100 px-4 py-2 text-sm text-red-600">
            {error}
          </div>
        )}

        {hasNoVote && (
          <div className="rounded-2xl bg-gray-50 border border-gray-100 p-8 text-center">
            <p className="text-sm text-gray-400">현재 진행 중인 투표가 없습니다</p>
          </div>
        )}

        {/* ── 취소 투표 ── */}
        {hasCancelVote && (
          <div className="mb-4 rounded-2xl bg-red-50 border border-red-200 p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="font-bold text-red-700 text-sm">❌ 미팅 취소 투표</p>
              <span className="rounded-full bg-red-200 px-2.5 py-0.5 text-xs font-bold text-red-800">
                {roomInfo.cancel_vote_count}/{roomInfo.total_members}명 동의
              </span>
            </div>
            <p className="text-xs text-red-600 mb-4">
              전원 동의 시 미팅이 취소되고 매칭권이 환급됩니다.
            </p>

            {roomInfo.my_cancel_voted ? (
              /* 이미 동의한 경우 → 취소 버튼만 */
              <button
                onClick={() => act(() => withdrawCancelVote(roomId), "cancel-withdraw")}
                disabled={loading !== null}
                className="w-full rounded-xl border-2 border-red-300 bg-white py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50 transition-colors"
              >
                {loading === "cancel-withdraw" ? "처리 중..." : "동의 취소"}
              </button>
            ) : (
              /* 아직 투표 안 한 경우 → 동의 + 비동의 */
              <div className="flex gap-3">
                <button
                  onClick={() => act(() => agreeToCancelMeeting(roomId), "cancel-agree")}
                  disabled={loading !== null}
                  className="flex-1 rounded-xl bg-red-500 py-2.5 text-sm font-bold text-white hover:bg-red-600 disabled:opacity-50 transition-colors"
                >
                  {loading === "cancel-agree" ? "처리 중..." : "동의"}
                </button>
                <button
                  onClick={() => act(() => disagreeToCancelMeeting(roomId), "cancel-disagree")}
                  disabled={loading !== null}
                  className="flex-1 rounded-xl border-2 border-gray-200 bg-white py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors"
                >
                  {loading === "cancel-disagree" ? "처리 중..." : "비동의"}
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── 일정 투표 ── */}
        {hasScheduleVote && roomInfo.schedule && (
          <div className="rounded-2xl bg-blue-50 border border-blue-200 p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="font-bold text-blue-700 text-sm">📅 일정 확정 투표</p>
              <span className="rounded-full bg-blue-200 px-2.5 py-0.5 text-xs font-bold text-blue-800">
                {roomInfo.schedule_vote_count}/{roomInfo.total_members}명 동의
              </span>
            </div>
            <div className="mb-4 space-y-1.5 rounded-xl bg-white border border-blue-100 px-4 py-3">
              <p className="text-xs text-gray-700">
                <span className="font-semibold text-gray-500">날짜</span>&nbsp; {roomInfo.schedule.date}
              </p>
              <p className="text-xs text-gray-700">
                <span className="font-semibold text-gray-500">시간</span>&nbsp; {roomInfo.schedule.time}
              </p>
              <p className="text-xs text-gray-700">
                <span className="font-semibold text-gray-500">장소</span>&nbsp; {roomInfo.schedule.place}
              </p>
            </div>

            {roomInfo.my_schedule_voted ? (
              /* 이미 동의한 경우 → 취소 버튼만 */
              <button
                onClick={() => act(() => withdrawScheduleVote(roomId), "schedule-withdraw")}
                disabled={loading !== null}
                className="w-full rounded-xl border-2 border-blue-300 bg-white py-2.5 text-sm font-semibold text-blue-600 hover:bg-blue-50 disabled:opacity-50 transition-colors"
              >
                {loading === "schedule-withdraw" ? "처리 중..." : "동의 취소"}
              </button>
            ) : (
              /* 아직 투표 안 한 경우 → 동의 + 비동의 */
              <div className="flex gap-3">
                <button
                  onClick={() => act(() => agreeToSchedule(roomId), "schedule-agree")}
                  disabled={loading !== null}
                  className="flex-1 rounded-xl bg-blue-500 py-2.5 text-sm font-bold text-white hover:bg-blue-600 disabled:opacity-50 transition-colors"
                >
                  {loading === "schedule-agree" ? "처리 중..." : "동의"}
                </button>
                <button
                  onClick={() => act(() => disagreeToSchedule(roomId), "schedule-disagree")}
                  disabled={loading !== null}
                  className="flex-1 rounded-xl border-2 border-gray-200 bg-white py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors"
                >
                  {loading === "schedule-disagree" ? "처리 중..." : "비동의"}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── 나가기 모달 ──────────────────────────────────────────────────
function LeaveModal({
  roomId, meetingId, isClosed, onClose, onLeft,
}: {
  roomId: number; meetingId: number; isClosed: boolean; onClose: () => void; onLeft: () => void;
}) {
  const [step, setStep] = useState<"choice" | "replace" | "forfeit">("choice");
  const [friends, setFriends] = useState<FriendItem[]>([]);
  const [friendsLoading, setFriendsLoading] = useState(false);
  const [selectedFriendId, setSelectedFriendId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadFriends = async () => {
    setFriendsLoading(true);
    try {
      const res = await listFriends();
      setFriends(res.friends);
    } catch { /* ignore */ } finally {
      setFriendsLoading(false);
    }
  };

  // COMPLETED 읽기전용 채팅방: 단순 확인 UI
  if (isClosed) {
    return (
      <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={onClose}>
        <div className="w-full max-w-md rounded-t-3xl bg-white p-6 pb-10" onClick={(e) => e.stopPropagation()}>
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-lg font-bold text-gray-900">채팅방 나가기</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
          </div>
          <p className="text-sm text-gray-600 mb-6">정말 나가시겠습니까?</p>
          {error && <p className="text-xs text-red-500 mb-4">{error}</p>}
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 rounded-xl border border-gray-200 py-3 text-sm font-semibold text-gray-600"
            >
              아니요
            </button>
            <button
              onClick={async () => {
                setLoading(true);
                try {
                  await leaveChatRoom(roomId, "forfeit");
                  onLeft();
                } catch (e) {
                  setError(e instanceof Error ? e.message : "처리 실패");
                } finally {
                  setLoading(false);
                }
              }}
              disabled={loading}
              className="flex-1 rounded-xl bg-red-500 py-3 text-sm font-bold text-white disabled:opacity-50"
            >
              {loading ? "처리 중..." : "예"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const handleForfeit = async () => {
    if (!confirm("정말 나가시겠습니까? 매칭권은 환급되지 않습니다.")) return;
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
    if (!selectedFriendId) { setError("초대할 친구를 선택해주세요"); return; }
    setLoading(true);
    try {
      const res = await leaveChatRoom(roomId, "replace", selectedFriendId);
      const remaining = res.remaining_attempts ?? 0;
      const remainingMsg = remaining === 0
        ? "⚠️ 마지막 초대 기회를 사용했습니다."
        : `초대 기회가 ${remaining}번 남았습니다.`;
      alert(`대체 인원에게 초대를 발송했습니다.\n${remainingMsg}`);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "초대 발송 실패");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={onClose}>
      <div className="w-full max-w-md rounded-t-3xl bg-white p-6 pb-10 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">채팅방 나가기</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
        </div>

        {step === "choice" && (
          <div className="space-y-3">
            <p className="text-sm text-gray-600">나가기 방법을 선택해주세요</p>
            <button
              onClick={() => { setStep("replace"); loadFriends(); }}
              className="w-full rounded-2xl border-2 border-blue-200 bg-blue-50 p-4 text-left"
            >
              <p className="font-semibold text-blue-800">👥 대체 인원 초대</p>
              <p className="mt-1 text-xs text-blue-600">대체인원이 수락하면 매칭권이 환급됩니다.</p>
            </button>
            <button
              onClick={() => setStep("forfeit")}
              className="w-full rounded-2xl border-2 border-red-200 bg-red-50 p-4 text-left"
            >
              <p className="font-semibold text-red-700">💸 나가기</p>
              <p className="mt-1 text-xs text-red-500">매칭권은 환급되지 않습니다.</p>
            </button>
          </div>
        )}

        {step === "replace" && (
          <div className="space-y-4">
            <button onClick={() => setStep("choice")} className="text-sm text-blue-600">← 뒤로</button>
            <p className="text-sm font-semibold text-gray-700">대체 인원 선택</p>
            <p className="text-xs text-gray-400">친구 목록에 있는 동성 친구에게만 초대할 수 있습니다</p>

            {friendsLoading ? (
              <div className="space-y-2">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-16 animate-pulse rounded-xl bg-gray-100" />
                ))}
              </div>
            ) : friends.length === 0 ? (
              <div className="rounded-xl bg-gray-50 border border-gray-100 py-8 text-center">
                <p className="text-sm text-gray-400">친구가 없습니다</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {friends.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => setSelectedFriendId(f.id)}
                    className={`w-full rounded-xl border-2 p-3 text-left transition-colors ${
                      selectedFriendId === f.id
                        ? "border-blue-400 bg-blue-50"
                        : "border-gray-100 bg-white hover:border-blue-200 hover:bg-blue-50/50"
                    }`}
                  >
                    <p className="font-semibold text-gray-900 text-sm">{f.nickname ?? `유저#${f.id}`}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {f.university ?? "학교 미입력"} · {f.gender === "MALE" ? "남" : f.gender === "FEMALE" ? "여" : "-"}
                    </p>
                  </button>
                ))}
              </div>
            )}

            {error && <p className="text-xs text-red-500">{error}</p>}
            <button
              onClick={handleInviteReplace}
              disabled={loading || !selectedFriendId}
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
              <p className="font-semibold text-red-800">⚠️ 매칭권 포기 안내</p>
              <ul className="mt-2 space-y-1 text-xs text-red-700">
                <li>• 납부한 매칭권은 환급되지 않습니다</li>
                <li>• 나가면 미팅이 취소되고 채팅방이 삭제됩니다</li>
                <li>• 다른 멤버들의 매칭권은 환급됩니다</li>
              </ul>
            </div>
            {error && <p className="text-xs text-red-500">{error}</p>}
            <button
              onClick={handleForfeit}
              disabled={loading}
              className="w-full rounded-xl bg-red-500 py-3 text-sm font-bold text-white disabled:opacity-50"
            >
              {loading ? "처리 중..." : "매칭권 포기 후 나가기"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── 일정 제안 모달 ────────────────────────────────────────────────
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
      await setMeetingSchedule(roomId, { date, time, place });
      onSent();
    } catch (e) {
      setError(e instanceof Error ? e.message : "일정 설정 실패");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={onClose}>
      <div className="w-full max-w-md rounded-t-3xl bg-white p-6 pb-10" onClick={(e) => e.stopPropagation()}>
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">📅 미팅 일정 제안</h2>
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
            {loading ? "제안 중..." : "일정 제안 투표 시작"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── 말풍선 (투표 버튼 없음 — 정보성 표시만) ───────────────────────
function MessageBubble({
  message, isMe, showNickname,
}: {
  message: ChatMessage & { sender_nickname?: string | null; unread_count?: number };
  isMe: boolean;
  showNickname: boolean;
}) {
  const time = new Date(message.created_at).toLocaleTimeString("ko-KR", {
    hour: "2-digit", minute: "2-digit",
  });

  const content = message.content;

  // ── [CANCEL_VOTE] → 빨간 정보 버블 (버튼 없음) ───────────────
  if (content.startsWith("[CANCEL_VOTE]")) {
    const text = content.replace("[CANCEL_VOTE]", "").trim();
    return (
      <div className="flex justify-center my-1">
        <div className="rounded-2xl bg-red-50 border border-red-200 px-4 py-2.5 max-w-xs text-center shadow-sm">
          <p className="text-xs font-bold text-red-600 mb-0.5">❌ 취소 투표</p>
          <p className="text-xs text-red-500 whitespace-pre-wrap">{text}</p>
        </div>
      </div>
    );
  }

  // ── [SCHEDULE_VOTE] → 파란 정보 버블 (버튼 없음) ─────────────
  if (content.startsWith("[SCHEDULE_VOTE]")) {
    const text = content.replace("[SCHEDULE_VOTE]", "").trim();
    return (
      <div className="flex justify-center my-1">
        <div className="rounded-2xl bg-blue-50 border border-blue-200 px-4 py-2.5 max-w-xs text-center shadow-sm">
          <p className="text-xs font-bold text-blue-600 mb-0.5">📅 일정 투표</p>
          <p className="text-xs text-blue-500 whitespace-pre-wrap">{text}</p>
        </div>
      </div>
    );
  }

  // ── [SYSTEM] → 회색 가운데 텍스트 ────────────────────────────
  if (content.startsWith("[SYSTEM]")) {
    return (
      <div className="flex justify-center">
        <div className="rounded-full bg-gray-100 px-4 py-1.5 text-xs text-gray-500">
          {content.replace("[SYSTEM]", "").trim()}
        </div>
      </div>
    );
  }

  // ── 일반 메시지 ──────────────────────────────────────────────
  const unread = message.unread_count ?? 0;
  const nickname = message.sender_nickname ?? `#${message.sender_user_id}`;

  const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
  const photoSrc = message.sender_photo_url
    ? (message.sender_photo_url.startsWith("http") ? message.sender_photo_url : `${apiBase}${message.sender_photo_url}`)
    : null;

  return (
    <div className={`flex items-end gap-2 ${isMe ? "flex-row-reverse" : "flex-row"}`}>
      {!isMe && (
        <div className="flex-shrink-0">
          {photoSrc ? (
            <img src={photoSrc} alt={nickname} className="h-8 w-8 rounded-full object-cover" />
          ) : (
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-200 text-xs font-semibold text-gray-600">
              {nickname.charAt(0).toUpperCase()}
            </div>
          )}
        </div>
      )}
      <div className={`flex flex-col gap-0.5 max-w-[72%] ${isMe ? "items-end" : "items-start"}`}>
        {!isMe && showNickname && (
          <span className="text-xs text-gray-500 font-medium px-1">{nickname}</span>
        )}
        <div className={`flex items-end gap-1 ${isMe ? "flex-row-reverse" : "flex-row"}`}>
          {isMe && unread > 0 && (
            <span className="text-xs font-bold text-yellow-500 mb-0.5">{unread}</span>
          )}
          <div className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap break-words ${
            isMe
              ? "rounded-br-sm bg-blue-600 text-white"
              : "rounded-bl-sm bg-white text-gray-900 border border-gray-100 shadow-sm"
          }`}>
            {content}
          </div>
          {!isMe && unread > 0 && (
            <span className="text-xs font-bold text-yellow-500 mb-0.5">{unread}</span>
          )}
        </div>
        <span className="text-xs text-gray-400 px-1">{time}</span>
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
