/**
 * SlotCard — 미팅 상세 페이지의 각 슬롯 UI
 *
 * 상태 표시 규칙:
 *   - user 없음            → 빈 슬롯 (점선 박스)
 *   - user 있음 + confirmed → ✅ 초록 뱃지 "확정"
 *   - user 있음 + !confirmed → 🕐 노란 뱃지 "대기중"
 *
 * WAITING_CONFIRM 상태에서 확정/대기 여부가 핵심 UI임
 */

import type { MeetingSlot } from "@/types";

interface SlotCardProps {
  slot: MeetingSlot;
  index: number;  // 화면 표시용 1-based 번호
  isHost?: boolean;
  onInviteClick?: () => void;
}

export function SlotCard({ slot, index, isHost = false, onInviteClick }: SlotCardProps) {
  const isEmpty = slot.user === null;

  if (isEmpty) {
    if (onInviteClick) {
      return (
        <button
          onClick={onInviteClick}
          className="flex w-full items-center gap-3 rounded-xl border-2 border-dashed border-blue-300 bg-blue-50 p-4 text-blue-500 hover:border-blue-400 hover:bg-blue-100 active:scale-95 transition-all"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 text-lg font-bold text-blue-500">+</div>
          <span className="text-sm font-semibold">친구 초대</span>
        </button>
      );
    }
    return (
      <div className="flex items-center gap-3 rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 p-4 text-gray-400">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-200 text-sm font-semibold text-gray-500">
          {index}
        </div>
        <span className="text-sm">빈 자리</span>
      </div>
    );
  }

  // isEmpty가 false면 user는 반드시 non-null
  const user = slot.user!;
  const { confirmed } = slot;

  return (
    <div
      className={`flex items-center gap-3 rounded-xl border-2 p-4 transition-all ${
        confirmed
          ? "border-emerald-200 bg-emerald-50"
          : "border-yellow-200 bg-yellow-50"
      }`}
    >
      {/* 아바타 */}
      <div className="relative flex-shrink-0">
        {user.photo_url_1 ? (
          <img
            src={user.photo_url_1.startsWith("http") ? user.photo_url_1 : `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}${user.photo_url_1}`}
            alt="profile"
            className="h-10 w-10 rounded-full object-cover"
          />
        ) : (
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-300 text-sm font-bold text-white">
            {index}
          </div>
        )}
      </div>

      {/* 유저 정보 */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-gray-900">
            {user.university ?? "대학 미입력"}
          </span>
          {user.entry_label && (
            <span className="text-xs text-gray-500">{user.entry_label}</span>
          )}
          {isHost && (
            <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-700">
              👑 HOST
            </span>
          )}
        </div>
        <div className="text-xs text-gray-500">
          {[user.major, user.age ? `${user.age}세` : null]
            .filter(Boolean)
            .join(" · ")}
        </div>
        {user.bio_short && (
          <div className="mt-0.5 truncate text-xs text-gray-400 italic">
            &ldquo;{user.bio_short}&rdquo;
          </div>
        )}
      </div>

      {/* 확정 뱃지 */}
      <div className="flex-shrink-0">
        {confirmed ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700">
            <span>✓</span>
            <span>확정</span>
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full bg-yellow-100 px-2.5 py-1 text-xs font-semibold text-yellow-700">
            <span>⏳</span>
            <span>대기중</span>
          </span>
        )}
      </div>
    </div>
  );
}
