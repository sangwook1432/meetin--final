// ─────────────────────────────────────────────
// 공통 Enum 타입 (백엔드 Python Enum과 1:1 대응)
// ─────────────────────────────────────────────

export type MeetingType = "TWO_BY_TWO" | "THREE_BY_THREE";
export type MeetingStatus = "RECRUITING" | "FULL" | "WAITING_CONFIRM" | "CONFIRMED" | "CANCELLED";
export type Team = "MALE" | "FEMALE";
export type Gender = "MALE" | "FEMALE";
export type VerificationStatus = "PENDING" | "VERIFIED" | "REJECTED";
export type LookalikeType = "CELEB" | "ANIMAL";
export type DocType = "ENROLLMENT_CERT" | "STUDENT_ID";

// ─────────────────────────────────────────────
// 로그인 유저 전체 프로필 (GET /me)
// ─────────────────────────────────────────────

export interface UserPublic {
  id: number;
  email: string;
  phone_last4: string;
  verification_status: VerificationStatus;
  is_admin: boolean;
  nickname: string | null;
  gender: Gender | null;
  university: string | null;
  major: string | null;
  entry_year: number | null;
  age: number | null;
  preferred_area: string | null;
  bio_short: string | null;
  lookalike_type: LookalikeType | null;
  lookalike_value: string | null;
  photo_url_1: string | null;
  photo_url_2: string | null;
  balance: number;
}

// ─────────────────────────────────────────────
// 슬롯 안에서 보이는 공개 프로필
// ─────────────────────────────────────────────

export interface PublicProfile {
  user_id: number;
  university: string | null;
  major: string | null;
  entry_year: number | null;
  entry_label: string | null;
  age: number | null;
  preferred_area: string | null;
  bio_short: string | null;
  lookalike_type: LookalikeType | null;
  lookalike_value: string | null;
  photo_url_1: string | null;
  photo_url_2: string | null;
}

// ─────────────────────────────────────────────
// 미팅 슬롯
// ─────────────────────────────────────────────

export interface MeetingSlot {
  team: Team;
  slot_index: number;
  user: PublicProfile | null;
  confirmed: boolean;
}

// ─────────────────────────────────────────────
// 미팅 상세 (GET /meetings/{id})
// ─────────────────────────────────────────────

export interface MeetingDetail {
  meeting_id: number;
  meeting_type: MeetingType;
  status: MeetingStatus;
  host_user_id: number;
  is_member: boolean;
  my_confirmed: boolean;
  chat_room_id: number | null;
  filled: {
    male: number;
    female: number;
    total: number;
    capacity: number;
  };
  slots: MeetingSlot[];
}

// ─────────────────────────────────────────────
// 미팅 리스트 아이템 (discover / vacancies)
// ─────────────────────────────────────────────

export interface MeetingListItem {
  meeting_id: number;
  meeting_type: MeetingType;
  status: MeetingStatus;
  remaining_my_team: number;
  preferred_universities_raw: string | null;
  preferred_universities_any: boolean;
  is_member: boolean;
  filled: {
    male: number;
    female: number;
    total: number;
    capacity: number;
  };
}

// ─────────────────────────────────────────────
// 채팅 메시지
// ─────────────────────────────────────────────

export interface ChatMessage {
  id: number;
  room_id: number;
  sender_user_id: number;
  content: string;
  created_at: string;
}

// ─────────────────────────────────────────────
// API 응답 타입들
// ─────────────────────────────────────────────

export interface ConfirmResponse {
  meeting_id: number;
  status: MeetingStatus;
  confirmed: boolean;
  already_confirmed?: boolean;
  chat_room_id: number | null;
}
