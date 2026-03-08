/**
 * API 클라이언트
 *
 * - Bearer 토큰 자동 주입
 * - 401 수신 시 refresh_token으로 재발급 1회 시도
 * - 재발급 실패 시 토큰 삭제 + /login redirect
 */

import type {
  MeetingDetail,
  MeetingListItem,
  ChatMessage,
  ConfirmResponse,
  MeetingType,
  UserPublic,
} from "@/types";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// ─────────────────────────────────────────
// 토큰 스토리지 헬퍼
// ─────────────────────────────────────────

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("access_token");
}

export function getRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("refresh_token");
}

export function setTokens(access: string, refresh: string) {
  localStorage.setItem("access_token", access);
  localStorage.setItem("refresh_token", refresh);
}

export function clearTokens() {
  localStorage.removeItem("access_token");
  localStorage.removeItem("refresh_token");
}

// ─────────────────────────────────────────
// 토큰 재발급 (내부용)
// ─────────────────────────────────────────

let _refreshing: Promise<boolean> | null = null;

async function _tryRefresh(): Promise<boolean> {
  // 동시에 여러 요청이 401을 받아도 refresh는 1번만
  if (_refreshing) return _refreshing;

  _refreshing = (async () => {
    const rt = getRefreshToken();
    if (!rt) return false;
    try {
      const res = await fetch(`${BASE}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: rt }),
      });
      if (!res.ok) return false;
      const data = await res.json();
      setTokens(data.access_token, data.refresh_token);
      return true;
    } catch {
      return false;
    } finally {
      _refreshing = null;
    }
  })();

  return _refreshing;
}

// ─────────────────────────────────────────
// fetch 래퍼 — 401 시 refresh 후 1회 재시도
// ─────────────────────────────────────────

async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
  _retry = true,
): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> ?? {}),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, { ...options, headers });

  if (res.status === 401 && _retry) {
    const ok = await _tryRefresh();
    if (ok) return apiFetch<T>(path, options, false); // 재시도
    // 재발급 실패 → 로그아웃
    clearTokens();
    if (typeof window !== "undefined") window.location.href = "/login";
    throw new Error("Session expired");
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    // 통일된 에러 포맷: { error: { detail: "..." } } 또는 레거시 { detail: "..." }
    const detail = body?.error?.detail ?? body?.detail ?? `HTTP ${res.status}`;
    throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
  }

  const text = await res.text();
  return text ? (JSON.parse(text) as T) : ({} as T);
}

// ─────────────────────────────────────────
// Auth
// ─────────────────────────────────────────

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
}

/** POST /auth/login — JSON body (백엔드 LoginRequest 기준) */
export async function loginApi(email: string, password: string): Promise<TokenResponse> {
  const res = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.detail ?? "로그인 실패");
  }
  return res.json();
}

/** POST /auth/register */
export async function registerApi(payload: {
  email: string;
  password: string;
  phone: string;
}): Promise<TokenResponse> {
  const res = await fetch(`${BASE}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.detail ?? "회원가입 실패");
  }
  return res.json();
}

// ─────────────────────────────────────────
// Me
// ─────────────────────────────────────────

export async function getMe(): Promise<UserPublic> {
  return apiFetch("/me");
}

export async function updateProfile(payload: Partial<{
  nickname: string;
  gender: "MALE" | "FEMALE";
  university: string;
  major: string;
  entry_year: number;
  age: number;
  preferred_area: string;
  bio_short: string;
  lookalike_type: "CELEB" | "ANIMAL";
  lookalike_value: string;
  photo_url_1: string;
  photo_url_2: string;
}>): Promise<UserPublic> {
  return apiFetch("/me/profile", {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function uploadDoc(payload: {
  doc_type: "ENROLLMENT_CERT" | "STUDENT_ID";
  file_url: string;
}): Promise<{ id: number; doc_type: string; file_url: string; status: string }> {
  return apiFetch("/me/docs", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

// ─────────────────────────────────────────
// Meetings
// ─────────────────────────────────────────

export async function discoverMeetings(): Promise<{ meetings: MeetingListItem[] }> {
  return apiFetch("/meetings/discover");
}

export async function vacanciesMeetings(): Promise<{ meetings: MeetingListItem[] }> {
  return apiFetch("/meetings/vacancies");
}

export async function getMeeting(id: number): Promise<MeetingDetail> {
  return apiFetch(`/meetings/${id}`);
}

export async function createMeeting(params: {
  meeting_type: MeetingType;
  preferred_universities_any?: boolean;
  preferred_universities_raw?: string;
}): Promise<{ meeting_id: number; meeting_status: string }> {
  const qs = new URLSearchParams({
    meeting_type: params.meeting_type,
    preferred_universities_any: String(params.preferred_universities_any ?? true),
    ...(params.preferred_universities_raw
      ? { preferred_universities_raw: params.preferred_universities_raw }
      : {}),
  });
  return apiFetch(`/meetings?${qs}`, { method: "POST" });
}

export async function joinMeeting(id: number) {
  return apiFetch<{ joined: boolean; meeting_status: string; already_joined?: boolean }>(
    `/meetings/${id}/join`, { method: "POST" }
  );
}

export async function leaveMeeting(id: number) {
  return apiFetch<{ left: boolean; meeting_status?: string; meeting_deleted?: boolean }>(
    `/meetings/${id}/leave`, { method: "POST" }
  );
}

export async function confirmMeeting(id: number): Promise<ConfirmResponse> {
  return apiFetch(`/meetings/${id}/confirm`, { method: "POST" });
}

// ─────────────────────────────────────────
// Chat
// ─────────────────────────────────────────

export async function listChats() {
  return apiFetch<{ rooms: { room_id: number; meeting_id: number }[] }>("/chats");
}

export async function getMessages(roomId: number, sinceId = 0) {
  return apiFetch<{ messages: ChatMessage[] }>(
    `/chats/${roomId}?since_id=${sinceId}&limit=100`
  );
}

export async function sendMessage(roomId: number, content: string) {
  return apiFetch<{ id: number }>(`/chats/${roomId}/messages`, {
    method: "POST",
    body: JSON.stringify({ content }),
  });
}

// ─────────────────────────────────────────
// Payments (Toss)
// ─────────────────────────────────────────

/** POST /payments/deposits/prepare — Toss 위젯 결제 전 주문 생성 */
export async function prepareDeposit(meetingId: number): Promise<{
  orderId: string;
  amount: number;
  orderName: string;
}> {
  return apiFetch(`/payments/deposits/prepare?meeting_id=${meetingId}`, {
    method: "POST",
  });
}

/** POST /payments/toss/confirm — Toss 결제 성공 콜백 후 서버 검증 */
export async function confirmTossPayment(params: {
  order_id: string;
  payment_key?: string;
}): Promise<{
  status: "confirmed" | "already_confirmed";
  meeting_id: number;
  meeting_status: string;
  chat_room_id: number | null;
}> {
  const qs = new URLSearchParams({ order_id: params.order_id });
  if (params.payment_key) qs.set("payment_key", params.payment_key);
  return apiFetch(`/payments/toss/confirm?${qs}`, { method: "POST" });
}

/** GET /payments/deposits/me — 내 보증금 목록 */
export async function getMyDeposits(meetingId?: number): Promise<{
  deposits: {
    id: number;
    meeting_id: number;
    amount: number;
    status: string;
    toss_order_id: string;
    created_at: string;
  }[];
}> {
  const qs = meetingId !== undefined ? `?meeting_id=${meetingId}` : "";
  return apiFetch(`/payments/deposits/me${qs}`);
}

// ─────────────────────────────────────────
// Chat Room
// ─────────────────────────────────────────

/** GET /chats/{roomId}/info — 채팅방 메타 정보 (host_user_id 등) */
export async function getChatRoomInfo(roomId: number): Promise<{
  room_id: number;
  meeting_id: number;
  host_user_id: number;
  meeting_type: string;
  schedule: { date: string; time: string; place: string; confirmed: boolean } | null;
}> {
  return apiFetch(`/chats/${roomId}/info`);
}

/** POST /chats/{roomId}/leave — 채팅방 나가기 */
export async function leaveChatRoom(
  roomId: number,
  leaveType: "forfeit" | "replace",
  replacePhone?: string
): Promise<{ status: string; message?: string; meeting_status?: string }> {
  return apiFetch(`/chats/${roomId}/leave`, {
    method: "POST",
    body: JSON.stringify({ leave_type: leaveType, replace_phone: replacePhone ?? null }),
  });
}

/** POST /chats/{roomId}/schedule — 미팅 일정 설정 (HOST만) */
export async function setMeetingSchedule(
  roomId: number,
  payload: { date: string; time: string; place: string }
): Promise<{ status: string; schedule: { date: string; time: string; place: string } }> {
  return apiFetch(`/chats/${roomId}/schedule`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/** GET /meetings/{meetingId}/schedule — 미팅 일정 조회 */
export async function getMeetingSchedule(meetingId: number): Promise<{
  date: string; time: string; place: string; confirmed: boolean;
} | null> {
  const res = await apiFetch<{ schedule: { date: string; time: string; place: string; confirmed: boolean } | null }>(
    `/meetings/${meetingId}/schedule`
  );
  return res.schedule;
}

/** GET /me/schedule — 내 미팅 일정 목록 */
export async function getMySchedules(): Promise<{
  schedules: {
    meeting_id: number;
    meeting_type: string;
    chat_room_id: number | null;
    schedule: { date: string | null; time: string | null; place: string | null; confirmed: boolean };
  }[];
}> {
  return apiFetch("/me/schedule");
}

// ─────────────────────────────────────────
// Friends
// ─────────────────────────────────────────

export interface FriendItem {
  id: number;
  nickname: string | null;
  gender: "MALE" | "FEMALE" | null;
  university: string | null;
  phone_last4: string;
  verification_status: string;
}

/** GET /friends — 내 친구 목록 */
export async function listFriends(): Promise<{ friends: FriendItem[] }> {
  return apiFetch("/friends");
}

/** GET /friends/pending — 받은 친구 요청 */
export async function pendingFriendRequests(): Promise<{
  requests: { friendship_id: number; requester_id: number; nickname: string | null; created_at: string }[];
}> {
  return apiFetch("/friends/pending");
}

/** POST /friends/request — 친구 요청 (전화번호) */
export async function sendFriendRequest(phone: string): Promise<{ status: string; target_nickname?: string }> {
  return apiFetch("/friends/request", {
    method: "POST",
    body: JSON.stringify({ phone }),
  });
}

/** POST /friends/{id}/accept — 친구 요청 수락 */
export async function acceptFriendRequest(friendshipId: number): Promise<{ status: string }> {
  return apiFetch(`/friends/${friendshipId}/accept`, { method: "POST" });
}

/** POST /friends/{id}/reject — 친구 요청 거절 */
export async function rejectFriendRequest(friendshipId: number): Promise<{ status: string }> {
  return apiFetch(`/friends/${friendshipId}/reject`, { method: "POST" });
}

// ─────────────────────────────────────────
// Invitations (미팅 초대)
// ─────────────────────────────────────────

/** POST /invitations/meeting — 친구를 미팅에 초대 */
export async function inviteFriendToMeeting(
  meetingId: number,
  inviteePhone: string
): Promise<{ status: string; invitation_id?: number }> {
  return apiFetch("/invitations/meeting", {
    method: "POST",
    body: JSON.stringify({ meeting_id: meetingId, invitee_phone: inviteePhone }),
  });
}

/** GET /invitations/me — 내가 받은 초대 목록 */
export async function getMyInvitations(): Promise<{
  invitations: {
    id: number;
    meeting_id: number;
    invite_type: string;
    inviter_nickname: string | null;
    expires_at: string;
    created_at: string;
  }[];
}> {
  return apiFetch("/invitations/me");
}

/** POST /invitations/{id}/respond — 초대 수락/거절 */
export async function respondToInvitation(
  invitationId: number,
  accept: boolean
): Promise<{ status: string; meeting_id?: number }> {
  return apiFetch(`/invitations/${invitationId}/respond`, {
    method: "POST",
    body: JSON.stringify({ accept }),
  });
}

// ─────────────────────────────────────────
// Wallet (잔액/충전/내역)
// ─────────────────────────────────────────

/** GET /wallet/me — 잔액 조회 */
export async function getWallet(): Promise<{
  balance: number;
  deposit_amount: number;
  can_afford: boolean;
}> {
  return apiFetch("/wallet/me");
}

/** POST /wallet/charge/prepare — 충전 주문 생성 */
export async function prepareCharge(amount: number): Promise<{
  orderId: string;
  amount: number;
  orderName: string;
}> {
  return apiFetch(`/wallet/charge/prepare?amount=${amount}`, { method: "POST" });
}

/** POST /wallet/charge/confirm — 충전 확정 */
export async function confirmCharge(payload: {
  order_id: string;
  payment_key: string;
  amount: number;
}): Promise<{ status: string; balance: number }> {
  return apiFetch("/wallet/charge/confirm", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/** GET /wallet/transactions — 거래 내역 */
export async function getWalletTransactions(limit = 50, offset = 0): Promise<{
  balance: number;
  transactions: {
    id: number;
    tx_type: string;
    amount: number;
    balance_after: number;
    description: string | null;
    ref_meeting_id: number | null;
    created_at: string;
  }[];
}> {
  return apiFetch(`/wallet/transactions?limit=${limit}&offset=${offset}`);
}

// ─────────────────────────────────────────
// File Upload (재학증명서 JPG)
// ─────────────────────────────────────────

/** POST /me/docs/upload — JPG 파일 업로드 */
export async function uploadDocFile(
  docType: "ENROLLMENT_CERT" | "STUDENT_ID",
  file: File
): Promise<{ id: number; doc_type: string; file_url: string; status: string }> {
  const token = getToken();
  const formData = new FormData();
  formData.append("doc_type", docType);
  formData.append("file", file);

  const res = await fetch(`${BASE}/me/docs/upload`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.detail ?? `HTTP ${res.status}`);
  }
  return res.json();
}
