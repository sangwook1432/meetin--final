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
  AfterTarget,
  AfterRequestItem,
} from "@/types";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// ─────────────────────────────────────────
// 토큰 스토리지 헬퍼
// ─────────────────────────────────────────

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("access_token");
}

export function setTokens(access: string) {
  localStorage.setItem("access_token", access);
}

export function clearTokens() {
  localStorage.removeItem("access_token");
}

// ─────────────────────────────────────────
// 토큰 재발급 (내부용)
// ─────────────────────────────────────────

let _refreshing: Promise<boolean> | null = null;

async function _tryRefresh(): Promise<boolean> {
  // 동시에 여러 요청이 401을 받아도 refresh는 1번만
  if (_refreshing) return _refreshing;

  _refreshing = (async () => {
    try {
      const res = await fetch(`${BASE}/auth/refresh`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) return false;
      const data = await res.json();
      setTokens(data.access_token);
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

// FormData 업로드용 — 401 시 refresh 후 1회 재시도
async function apiFormFetch<T>(path: string, form: FormData, _retry = true): Promise<T> {
  const token = getToken();
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });

  if (res.status === 401 && _retry) {
    const ok = await _tryRefresh();
    if (ok) return apiFormFetch<T>(path, form, false);
    clearTokens();
    if (typeof window !== "undefined") window.location.href = "/login";
    throw new Error("Session expired");
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
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
}

/** POST /auth/login — JSON body (백엔드 LoginRequest 기준) */
export async function loginApi(username: string, password: string): Promise<TokenResponse> {
  const res = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const detail = body?.detail;
    if (typeof detail === "string") throw new Error(detail);
    throw new Error("로그인 실패");
  }
  return res.json();
}

/** POST /auth/logout — 서버 측 refresh_token 쿠키 삭제 */
export async function logoutApi(): Promise<void> {
  await fetch(`${BASE}/auth/logout`, { method: "POST", credentials: "include" });
}

/** POST /auth/find-username — phone_token으로 가입 아이디 찾기 */
export async function findUsernameByToken(phone_token: string): Promise<{ masked_username: string | null }> {
  const res = await fetch(`${BASE}/auth/find-username`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone_token }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const detail = body?.detail;
    if (typeof detail === "string") throw new Error(detail);
    throw new Error("아이디 찾기 실패");
  }
  return res.json();
}

/** POST /auth/email/verify-otp — OTP 검증 후 reset_token 발급 */
export async function verifyEmailOtp(email: string, otp: string): Promise<{ reset_token: string }> {
  const res = await fetch(`${BASE}/auth/email/verify-otp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, otp }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const detail = body?.detail;
    if (typeof detail === "string") throw new Error(detail);
    throw new Error("인증코드 확인 실패");
  }
  return res.json();
}

/** POST /auth/email/send-otp — 비밀번호 재설정 이메일 OTP 발송 */
export async function sendPasswordResetOtp(email: string): Promise<{ status: string }> {
  const res = await fetch(`${BASE}/auth/email/send-otp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const detail = body?.detail;
    if (typeof detail === "string") throw new Error(detail);
    throw new Error("인증코드 발송 실패");
  }
  return res.json();
}

/** POST /auth/reset-password — reset_token으로 비밀번호 재설정 */
export async function resetPasswordByEmail(
  email: string,
  reset_token: string,
  newPassword: string
): Promise<{ status: string }> {
  const res = await fetch(`${BASE}/auth/reset-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, reset_token, new_password: newPassword }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const detail = body?.detail;
    if (typeof detail === "string") throw new Error(detail);
    throw new Error("비밀번호 재설정 실패");
  }
  return res.json();
}

/** POST /auth/phone/certify — 포트원 imp_uid 검증 후 phone_token 발급 */
export async function certifyPhone(imp_uid: string): Promise<{ phone_token: string }> {
  const res = await fetch(`${BASE}/auth/phone/certify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ imp_uid }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const detail = body?.detail;
    if (typeof detail === "string") throw new Error(detail);
    throw new Error("본인인증에 실패했습니다.");
  }
  return res.json();
}

/** GET /auth/phone/token-info — phone_token으로 인증된 사용자 정보 조회 (폼 자동완성용) */
export async function getPhoneTokenInfo(token: string): Promise<{
  phone: string | null;
  name: string | null;
  birth_date: string | null;
  gender: string | null;
  age: number | null;
}> {
  const res = await fetch(`${BASE}/auth/phone/token-info?token=${encodeURIComponent(token)}`);
  if (!res.ok) return { phone: null, name: null, birth_date: null, gender: null, age: null };
  return res.json();
}

/** POST /auth/register */
export async function registerApi(payload: {
  username: string;
  email: string;
  password: string;
  phone_token: string;
}): Promise<TokenResponse> {
  const res = await fetch(`${BASE}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const detail = body?.detail;
    if (typeof detail === "string") throw new Error(detail);
    if (Array.isArray(detail) && detail.length > 0) {
      const first = detail[0];
      throw new Error(typeof first?.msg === "string" ? first.msg : "입력값을 확인해주세요.");
    }
    throw new Error("회원가입 실패");
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
  email: string;
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

export async function uploadPhoto(
  slot: 1 | 2,
  file: File
): Promise<{ photo_url: string }> {
  const form = new FormData();
  form.append("slot", String(slot));
  form.append("file", file);
  return apiFormFetch("/me/photos/upload", form);
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

export interface MyMeetingItem {
  meeting_id: number;
  meeting_type: string;
  title: string | null;
  status: string;
  host_user_id: number;
  is_host: boolean;
  chat_room_id: number | null;
}

export async function getMyMeetings(): Promise<{ meetings: MyMeetingItem[] }> {
  return apiFetch("/meetings/me");
}

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
  title?: string;
  preferred_universities_any?: boolean;
  preferred_universities_raw?: string;
  entry_year_min?: number;
  entry_year_max?: number;
  my_team_universities_any?: boolean;
  my_team_universities_raw?: string;
  my_team_entry_year_min?: number;
  my_team_entry_year_max?: number;
}): Promise<{ meeting_id: number; meeting_status: string }> {
  const qs = new URLSearchParams({
    meeting_type: params.meeting_type,
    ...(params.title ? { title: params.title } : {}),
    preferred_universities_any: String(params.preferred_universities_any ?? true),
    ...(params.preferred_universities_raw
      ? { preferred_universities_raw: params.preferred_universities_raw }
      : {}),
    ...(params.entry_year_min != null ? { entry_year_min: String(params.entry_year_min) } : {}),
    ...(params.entry_year_max != null ? { entry_year_max: String(params.entry_year_max) } : {}),
    my_team_universities_any: String(params.my_team_universities_any ?? true),
    ...(params.my_team_universities_raw
      ? { my_team_universities_raw: params.my_team_universities_raw }
      : {}),
    ...(params.my_team_entry_year_min != null ? { my_team_entry_year_min: String(params.my_team_entry_year_min) } : {}),
    ...(params.my_team_entry_year_max != null ? { my_team_entry_year_max: String(params.my_team_entry_year_max) } : {}),
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

export async function updateEntryYearRange(
  meetingId: number,
  entryYearMin: number | null,
  entryYearMax: number | null
): Promise<{ meeting_id: number; entry_year_min: number | null; entry_year_max: number | null }> {
  const qs = new URLSearchParams();
  if (entryYearMin != null) qs.set("entry_year_min", String(entryYearMin));
  if (entryYearMax != null) qs.set("entry_year_max", String(entryYearMax));
  return apiFetch(`/meetings/${meetingId}/entry-year-range?${qs}`, { method: "PATCH" });
}

export async function updatePreferredUniversities(
  meetingId: number,
  preferredUniversitiesAny: boolean,
  preferredUniversitiesRaw?: string
): Promise<{ meeting_id: number; preferred_universities_any: boolean; preferred_universities_raw: string | null }> {
  const qs = new URLSearchParams({
    preferred_universities_any: String(preferredUniversitiesAny),
    ...(preferredUniversitiesRaw ? { preferred_universities_raw: preferredUniversitiesRaw } : {}),
  });
  return apiFetch(`/meetings/${meetingId}/preferred-universities?${qs}`, { method: "PATCH" });
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

/** POST /chats/{roomId}/read — WS 수신 후 읽음 기록 갱신 */
export async function markRead(roomId: number, messageId: number): Promise<{ status: string }> {
  return apiFetch(`/chats/${roomId}/read`, {
    method: "POST",
    body: JSON.stringify({ message_id: messageId }),
  });
}

// ─────────────────────────────────────────
// Tickets (매칭권)
// ─────────────────────────────────────────

export interface TicketTx {
  id: number;
  tx_type: "PURCHASE" | "CONSUME" | "REFUND";
  amount: number;
  tickets_after: number;
  meeting_id: number | null;
  note: string | null;
  created_at: string;
}

/** GET /tickets/me — 매칭권 수 + 이력 */
export async function getMyTickets(): Promise<{ tickets: number; transactions: TicketTx[] }> {
  return apiFetch("/tickets/me");
}

/** POST /tickets/purchase?count=N — 매칭권 구매 */
export async function purchaseTickets(count: number): Promise<{
  tickets: number;
  balance: number;
  purchased: number;
}> {
  return apiFetch(`/tickets/purchase?count=${count}`, { method: "POST" });
}

// ─────────────────────────────────────────
// Chat Room
// ─────────────────────────────────────────

export interface ChatRoomMember {
  user_id: number;
  nickname: string;
}

export interface ChatRoomInfo {
  room_id: number;
  meeting_id: number;
  meeting_title: string | null;
  host_user_id: number;
  meeting_type: string;
  total_members: number;
  is_closed: boolean;
  members: ChatRoomMember[];
  schedule: { date: string; time: string; place: string; confirmed: boolean } | null;
  cancel_vote_count: number;
  my_cancel_voted: boolean;
  schedule_vote_count: number;
  my_schedule_voted: boolean;
}

/** GET /chats/{roomId}/info — 채팅방 메타 정보 (host_user_id, 투표 현황 등) */
export async function getChatRoomInfo(roomId: number): Promise<ChatRoomInfo> {
  return apiFetch(`/chats/${roomId}/info`);
}

/** POST /meetings/{meetingId}/transfer-host — 호스트 재배정 (호스트만) */
export async function transferHost(meetingId: number, newHostUserId: number): Promise<{ meeting_id: number; host_user_id: number; nickname: string }> {
  return apiFetch(`/meetings/${meetingId}/transfer-host?new_host_user_id=${newHostUserId}`, { method: "POST" });
}

/** POST /chats/{roomId}/leave — 채팅방 나가기 */
export async function leaveChatRoom(
  roomId: number,
  leaveType: "forfeit" | "replace",
  replaceUserId?: number
): Promise<{ status: string; message?: string; meeting_status?: string; remaining_attempts?: number }> {
  return apiFetch(`/chats/${roomId}/leave`, {
    method: "POST",
    body: JSON.stringify({ leave_type: leaveType, replace_user_id: replaceUserId ?? null }),
  });
}

/** POST /chats/{roomId}/report — 채팅 유저 신고 */
export async function reportChatUser(
  roomId: number,
  payload: {
    reported_user_id: number;
    evidence_message_id: number;
    reason: "SEXUAL_CONTENT" | "HARASSMENT" | "SPAM" | "OTHER";
    detail?: string;
  }
): Promise<{ ok: boolean; report_id: number }> {
  return apiFetch(`/chats/${roomId}/report`, {
    method: "POST",
    body: JSON.stringify(payload),
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

/** POST /chats/{roomId}/cancel/withdraw — 취소 투표 철회 */
export async function withdrawCancelVote(roomId: number): Promise<{
  status: string; vote_count: number; total_members: number;
}> {
  return apiFetch(`/chats/${roomId}/cancel/withdraw`, { method: "POST" });
}

/** POST /chats/{roomId}/cancel/disagree — 취소 투표 비동의 (투표 무효화) */
export async function disagreeToCancelMeeting(roomId: number): Promise<{ status: string }> {
  return apiFetch(`/chats/${roomId}/cancel/disagree`, { method: "POST" });
}

/** POST /chats/{roomId}/schedule/withdraw — 일정 투표 철회 */
export async function withdrawScheduleVote(roomId: number): Promise<{
  status: string; vote_count: number; total_members: number;
}> {
  return apiFetch(`/chats/${roomId}/schedule/withdraw`, { method: "POST" });
}

/** POST /chats/{roomId}/schedule/disagree — 일정 투표 비동의 (투표 무효화) */
export async function disagreeToSchedule(roomId: number): Promise<{ status: string }> {
  return apiFetch(`/chats/${roomId}/schedule/disagree`, { method: "POST" });
}

/** POST /chats/{roomId}/cancel/propose — 취소 투표 시작 */
export async function proposeCancelMeeting(roomId: number): Promise<{
  status: string;
  vote_count: number;
  total_members: number;
}> {
  return apiFetch(`/chats/${roomId}/cancel/propose`, { method: "POST" });
}

/** POST /chats/{roomId}/cancel/agree — 취소 투표 동의 */
export async function agreeToCancelMeeting(roomId: number): Promise<{
  status: string;
  vote_count: number;
  total_members: number;
}> {
  return apiFetch(`/chats/${roomId}/cancel/agree`, { method: "POST" });
}

/** POST /chats/{roomId}/schedule/agree — 일정 투표 동의 */
export async function agreeToSchedule(roomId: number): Promise<{
  status: string;
  vote_count: number;
  total_members: number;
}> {
  return apiFetch(`/chats/${roomId}/schedule/agree`, { method: "POST" });
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
    title: string | null;
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

/** DELETE /friends/{friendUserId} — 친구 삭제 (양방향) */
export async function deleteFriend(friendUserId: number): Promise<{ status: string }> {
  return apiFetch(`/friends/${friendUserId}`, { method: "DELETE" });
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

/** POST /invitations/meeting-by-id — 친구를 미팅에 초대 (user ID 기반) */
export async function inviteFriendToMeetingById(
  meetingId: number,
  inviteeId: number
): Promise<{ status: string; invitation_id?: number }> {
  return apiFetch("/invitations/meeting-by-id", {
    method: "POST",
    body: JSON.stringify({ meeting_id: meetingId, invitee_id: inviteeId }),
  });
}

/** GET /invitations/me — 내가 받은 초대 목록 */
export async function getMyInvitations(): Promise<{
  invitations: {
    id: number;
    meeting_id: number;
    invite_type: string;
    status: string;
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
): Promise<{ status: string; meeting_id?: number; invitation_id?: number; message?: string }> {
  return apiFetch(`/invitations/${invitationId}/respond`, {
    method: "POST",
    body: JSON.stringify({ accept }),
  });
}

/** POST /invitations/{id}/replace_confirm — 대체 참가 보증금 결제 + 슬롯 교체 */
export async function replaceConfirm(invitationId: number): Promise<{
  status: string;
  meeting_id: number;
  chat_room_id: number | null;
}> {
  return apiFetch(`/invitations/${invitationId}/replace_confirm`, { method: "POST" });
}

// ─────────────────────────────────────────
// Wallet (잔액/충전/내역)
// ─────────────────────────────────────────

/** GET /wallet/me — 잔액 조회 */
export async function getWallet(): Promise<{
  balance: number;
  matching_tickets: number;
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

/** POST /wallet/charge/confirm — 포트원 결제 확정 */
export async function confirmCharge(payload: {
  imp_uid: string;
  merchant_uid: string;
  amount: number;
}): Promise<{ status: string; balance: number }> {
  return apiFetch("/wallet/charge/confirm", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/** GET /me/bank-account — 계좌 조회 */
export async function getBankAccount(): Promise<{
  bank_name: string | null;
  account_number: string | null;
  account_holder: string | null;
}> {
  return apiFetch("/me/bank-account");
}

/** PATCH /me/bank-account — 계좌 등록/수정 */
export async function updateBankAccount(payload: {
  bank_name: string;
  account_number: string;
  account_holder: string;
}): Promise<{ status: string }> {
  return apiFetch("/me/bank-account", {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

/** POST /wallet/withdraw — 출금 신청 */
export async function getWithdrawPreview(amount: number): Promise<{
  refund_type: "청약철회" | "일반환불";
  fee: number;
  net_amount: number;
  eligible: boolean;
  reason: string;
}> {
  return apiFetch(`/wallet/withdraw/preview?amount=${amount}`);
}

export async function requestWithdraw(amount: number): Promise<{
  status: string;
  balance: number;
  fee: number;
  net_amount: number;
  refund_type: string;
}> {
  return apiFetch("/wallet/withdraw", {
    method: "POST",
    body: JSON.stringify({ amount }),
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
    note: string | null;
    meeting_id: number | null;
    created_at: string;
  }[];
}> {
  return apiFetch(`/wallet/transactions?limit=${limit}&offset=${offset}`);
}

// ─────────────────────────────────────────
// File Upload (재학증명서 JPG)
// ─────────────────────────────────────────

// ─────────────────────────────────────────
// Notifications (시스템 알림)
// ─────────────────────────────────────────

/** GET /notifications/me — 안 읽은 알림 목록 */
export async function getMyNotifications(): Promise<{
  notifications: {
    id: number;
    notif_type: string;
    message: string;
    meeting_id: number | null;
    created_at: string;
  }[];
}> {
  return apiFetch("/notifications/me");
}

/** POST /notifications/{id}/read — 알림 읽음 처리 */
export async function markNotificationRead(id: number): Promise<{ status: string }> {
  return apiFetch(`/notifications/${id}/read`, { method: "POST" });
}

// ─────────────────────────────────────────
// File Upload (재학증명서 JPG)
// ─────────────────────────────────────────

// ─────────────────────────────────────────
// Review & After Requests (미팅 후기 & 애프터)
// ─────────────────────────────────────────

/** POST /meetings/{id}/feedback — 후기 제출 */
export async function submitFeedback(
  meetingId: number,
  satisfied: boolean,
  complaint?: string
): Promise<{ status: string }> {
  const qs = new URLSearchParams({ satisfied: String(satisfied) });
  if (!satisfied && complaint) qs.set("complaint", complaint);
  return apiFetch(`/meetings/${meetingId}/feedback?${qs}`, { method: "POST" });
}

/** GET /meetings/{id}/after-targets — 상대 이성 프로필 목록 */
export async function getAfterTargets(meetingId: number): Promise<{ targets: AfterTarget[] }> {
  return apiFetch(`/meetings/${meetingId}/after-targets`);
}

/** POST /meetings/{id}/after-request — 애프터 신청 */
export async function submitAfterRequest(
  meetingId: number,
  receiverId: number,
  message: string,
): Promise<{ status: string }> {
  return apiFetch(`/meetings/${meetingId}/after-request`, {
    method: "POST",
    body: JSON.stringify({ receiver_id: receiverId, message }),
  });
}

/** GET /me/after-requests — 쪽지함 (수신된 애프터 신청 목록) */
export async function getMyAfterRequests(): Promise<{ items: AfterRequestItem[] }> {
  return apiFetch("/me/after-requests");
}

/** DELETE /me/after-requests/{id} — 애프터 신청 삭제 */
export async function deleteAfterRequest(id: number): Promise<{ status: string }> {
  return apiFetch(`/me/after-requests/${id}`, { method: "DELETE" });
}

/** DELETE /me — 회원 탈퇴 (잔액 0 필요) */
export async function deleteAccount(): Promise<{ status: string }> {
  return apiFetch("/me", { method: "DELETE" });
}

/** GET /users/{id}/profile — 공개 프로필 조회 */
export async function getUserProfile(userId: number): Promise<{
  user_id: number;
  nickname: string | null;
  university: string | null;
  major: string | null;
  entry_label: string | null;
  age: number | null;
  bio_short: string | null;
  photo_url_1: string | null;
  cover_url: string | null;
  qa_answers: string | null;
  posts: { id: number; photo_url: string; caption: string | null }[];
}> {
  return apiFetch(`/users/${userId}/profile`);
}

/** PATCH /me/qa — 10문 10답 저장 */
export async function updateQA(answers: Record<string, string>): Promise<{ status: string }> {
  return apiFetch("/me/qa", { method: "PATCH", body: JSON.stringify({ answers }) });
}

/** POST /me/cover/upload — 배경 커버 사진 업로드 */
export async function uploadCoverPhoto(file: File): Promise<{ cover_url: string }> {
  const form = new FormData();
  form.append("file", file);
  return apiFormFetch("/me/cover/upload", form);
}

/** GET /me/profile-posts — 내 프로필 게시물 목록 */
export async function getMyProfilePosts(): Promise<{ posts: import("@/types").ProfilePost[] }> {
  return apiFetch("/me/profile-posts");
}

/** POST /me/profile-posts/upload — 게시물 사진 업로드 */
export async function uploadProfilePost(
  file: File,
  caption?: string,
): Promise<import("@/types").ProfilePost> {
  const form = new FormData();
  form.append("file", file);
  if (caption) form.append("caption", caption);
  return apiFormFetch("/me/profile-posts/upload", form);
}

/** DELETE /me/profile-posts/{id} — 게시물 삭제 */
export async function deleteProfilePost(id: number): Promise<{ status: string }> {
  return apiFetch(`/me/profile-posts/${id}`, { method: "DELETE" });
}

/** POST /me/docs/upload — JPG 파일 업로드 */
export async function uploadDocFile(
  docType: "ENROLLMENT_CERT" | "STUDENT_ID",
  file: File
): Promise<{ id: number; doc_type: string; file_url: string; status: string }> {
  const form = new FormData();
  form.append("doc_type", docType);
  form.append("file", file);
  return apiFormFetch("/me/docs/upload", form);
}
