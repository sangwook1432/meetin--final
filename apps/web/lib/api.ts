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
  MyMeetingItem,
  ChatMessage,
  ConfirmResponse,
  MeetingType,
  UserPublic,
  WalletTransaction,
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
// My Meetings (내가 참여한 미팅)
// ─────────────────────────────────────────

/** GET /meetings/my — 내가 참여 중인 미팅 목록 */
export async function getMyMeetings(): Promise<{ meetings: MyMeetingItem[] }> {
  return apiFetch("/meetings/my");
}

// ─────────────────────────────────────────
// Wallet (잔액 충전 / 반환)
// ─────────────────────────────────────────

/** GET /wallet/balance — 현재 잔액 조회 */
export async function getWalletBalance(): Promise<{ balance: number }> {
  return apiFetch("/wallet/balance");
}

/** POST /wallet/charge/prepare — 충전 주문 생성 */
export async function prepareCharge(amount: number): Promise<{
  orderId: string;
  amount: number;
  orderName: string;
}> {
  return apiFetch(`/wallet/charge/prepare?amount=${amount}`, { method: "POST" });
}

/** POST /wallet/charge/confirm — Toss 결제 성공 후 잔액 충전 확정 */
export async function confirmCharge(params: {
  order_id: string;
  payment_key?: string;
}): Promise<{
  status: "charged" | "already_charged";
  amount?: number;
  balance: number;
}> {
  const qs = new URLSearchParams({ order_id: params.order_id });
  if (params.payment_key) qs.set("payment_key", params.payment_key);
  return apiFetch(`/wallet/charge/confirm?${qs}`, { method: "POST" });
}

/** POST /wallet/withdraw — 잔액 반환 신청 */
export async function requestWithdraw(payload: {
  amount: number;
  bank_name: string;
  account_number: string;
  account_holder: string;
}): Promise<{
  status: string;
  amount: number;
  balance: number;
  message: string;
}> {
  return apiFetch("/wallet/withdraw", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/** GET /wallet/transactions — 잔액 변동 내역 */
export async function getWalletTransactions(limit = 50): Promise<{
  balance: number;
  transactions: WalletTransaction[];
}> {
  return apiFetch(`/wallet/transactions?limit=${limit}`);
}
