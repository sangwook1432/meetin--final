/**
 * SlotCard — V1 행스택 슬롯 (참가자 1명 행)
 *
 * 상태 표시:
 *  - 빈 슬롯 (점선 박스, 친구초대 가능 시 클릭 액션)
 *  - 참가자 + confirmed: 성공 뱃지 "확정"
 *  - 참가자 + !confirmed: 경고 뱃지 "대기"
 */

import Link from "next/link";
import type { MeetingSlot } from "@/types";

interface SlotCardProps {
  slot: MeetingSlot;
  index: number;
  isHost?: boolean;
  onInviteClick?: () => void;
}

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

function avatarUrl(url: string | null | undefined) {
  if (!url) return null;
  return url.startsWith("http") ? url : `${BASE}${url}`;
}

export function SlotCard({ slot, index, isHost = false, onInviteClick }: SlotCardProps) {
  const isEmpty = slot.user === null;

  if (isEmpty) {
    if (onInviteClick) {
      return (
        <button
          onClick={onInviteClick}
          className="flex w-full items-center gap-3 px-3 py-2.5 transition-all active:scale-[0.99]"
          style={{
            background: "var(--accent-soft)",
            border: "1.5px dashed var(--accent)",
            borderRadius: "var(--radius-md)",
            color: "var(--accent-ink)",
          }}
        >
          <div
            className="flex items-center justify-center font-semibold"
            style={{
              width: 40,
              height: 40,
              borderRadius: "50%",
              background: "var(--surface)",
              color: "var(--accent)",
              fontSize: 18,
            }}
          >
            +
          </div>
          <span
            className="font-bold"
            style={{ fontSize: 13, letterSpacing: "-0.01em" }}
          >
            친구 초대하기
          </span>
        </button>
      );
    }
    return (
      <div
        className="flex items-center gap-3 px-3 py-2.5"
        style={{
          background: "transparent",
          border: "1.5px dashed var(--border-strong)",
          borderRadius: "var(--radius-md)",
          color: "var(--ink-soft)",
        }}
      >
        <div
          className="flex items-center justify-center font-semibold"
          style={{
            width: 40,
            height: 40,
            borderRadius: "50%",
            background: "var(--surface-muted)",
            color: "var(--ink-soft)",
            fontSize: 14,
          }}
        >
          {index}
        </div>
        <span style={{ fontSize: 13, letterSpacing: "-0.01em" }}>빈 자리</span>
      </div>
    );
  }

  const user = slot.user!;
  const { confirmed } = slot;

  // 상태별 색상
  const stateBg = confirmed ? "var(--success-soft)" : "var(--warning-soft)";
  const stateBorder = confirmed ? "var(--success)" : "var(--warning)";
  const badgeColor = confirmed ? "var(--success)" : "oklch(0.55 0.16 70)";

  const photoUrl = avatarUrl(user.photo_url_1);

  return (
    <div
      className="flex items-center gap-3 px-3 py-2.5"
      style={{
        background: stateBg,
        border: `1px solid ${stateBorder}`,
        borderRadius: "var(--radius-md)",
      }}
    >
      {/* 아바타 */}
      <Link
        href={`/profile/${user.user_id}`}
        onClick={(e) => e.stopPropagation()}
        className="relative shrink-0"
      >
        {photoUrl ? (
          <img
            src={photoUrl}
            alt="profile"
            className="object-cover"
            style={{
              width: 40,
              height: 40,
              borderRadius: "50%",
              border: "2px solid var(--surface)",
            }}
          />
        ) : (
          <div
            className="flex items-center justify-center font-bold"
            style={{
              width: 40,
              height: 40,
              borderRadius: "50%",
              background: "var(--surface)",
              color: "var(--ink-soft)",
              fontSize: 14,
              border: "2px solid var(--surface)",
            }}
          >
            {index}
          </div>
        )}
        {isHost && (
          <span
            className="absolute -bottom-1 -right-1 flex items-center justify-center font-bold text-white"
            style={{
              width: 18,
              height: 18,
              borderRadius: "50%",
              background: "var(--warning)",
              fontSize: 9,
              boxShadow: "var(--shadow-sm)",
              letterSpacing: "-0.02em",
            }}
          >
            H
          </span>
        )}
      </Link>

      {/* 유저 정보 */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span
            className="truncate font-bold"
            style={{ fontSize: 13, color: "var(--ink)", letterSpacing: "-0.01em" }}
          >
            {user.university ?? "대학 미입력"}
          </span>
          {user.entry_label && (
            <span style={{ fontSize: 11, color: "var(--ink-mid)" }}>
              {user.entry_label}
            </span>
          )}
        </div>
        <div
          className="truncate"
          style={{ fontSize: 11, color: "var(--ink-soft)", marginTop: 1 }}
        >
          {[user.major, user.age ? `${user.age}세` : null].filter(Boolean).join(" · ")}
        </div>
        {user.bio_short && (
          <div
            className="truncate italic"
            style={{ fontSize: 11, color: "var(--ink-soft)", marginTop: 1 }}
          >
            “{user.bio_short}”
          </div>
        )}
      </div>

      {/* 확정 뱃지 */}
      <span
        className="shrink-0 inline-flex items-center px-2 py-0.5 font-bold"
        style={{
          fontSize: 10,
          background: badgeColor,
          color: "#fff",
          borderRadius: 999,
          letterSpacing: "-0.01em",
        }}
      >
        {confirmed ? "확정" : "대기"}
      </span>
    </div>
  );
}
