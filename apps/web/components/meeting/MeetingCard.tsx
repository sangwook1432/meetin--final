/**
 * MeetingCard — V1 Soft Trust 디자인
 *
 * Props:
 *  - meeting: MeetingListItem
 *  - onClick: 클릭 시 상세 페이지로 이동
 *  - variant: "discover" | "vacancy" — vacancy일 때 빈자리 강조
 *  - visited: 이미 본 미팅이면 흐리게
 */

import type { MeetingListItem } from "@/types";

interface MeetingCardProps {
  meeting: MeetingListItem;
  onClick: () => void;
  variant?: "discover" | "vacancy";
  visited?: boolean;
}

const MEETING_TYPE_LABEL: Record<string, string> = {
  TWO_BY_TWO: "2 : 2",
  THREE_BY_THREE: "3 : 3",
};

export function MeetingCard({ meeting, onClick, variant = "discover", visited = false }: MeetingCardProps) {
  const {
    meeting_id,
    meeting_type,
    title,
    status,
    filled,
    remaining_my_team,
    preferred_universities_raw,
    preferred_universities_any,
    is_member,
  } = meeting;

  const capacity = filled.capacity;
  const halfCapacity = capacity / 2;

  const statusBadge = (() => {
    switch (status) {
      case "RECRUITING":
        return { label: "모집중", bg: "var(--accent-soft)", fg: "var(--accent-ink)" };
      case "FULL":
        return { label: "정원마감", bg: "var(--surface-muted)", fg: "var(--ink-soft)" };
      case "WAITING_CONFIRM":
        return { label: "확정 대기", bg: "var(--warning-soft)", fg: "oklch(0.45 0.14 70)" };
      case "CONFIRMED":
        return { label: "확정 완료", bg: "var(--success-soft)", fg: "var(--success)" };
      default:
        return { label: status, bg: "var(--surface-muted)", fg: "var(--ink-soft)" };
    }
  })();

  const uniLabel = preferred_universities_any
    ? "모든 학교"
    : preferred_universities_raw
    ? preferred_universities_raw
        .split(",")
        .slice(0, 3)
        .map((u) => u.trim().replace("학교", "").replace("대학교", "대"))
        .join(" · ") + (preferred_universities_raw.split(",").length > 3 ? " 외" : "")
    : "모든 학교";

  const malePct = halfCapacity > 0 ? (filled.male / halfCapacity) * 100 : 0;
  const femalePct = halfCapacity > 0 ? (filled.female / halfCapacity) * 100 : 0;

  return (
    <button
      onClick={onClick}
      className="w-full text-left transition-all active:scale-[0.99]"
      style={{
        background: visited ? "var(--surface-muted)" : "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-lg)",
        padding: 16,
        boxShadow: "var(--shadow-sm)",
        opacity: visited ? 0.7 : 1,
      }}
    >
      {/* 상단: 타입 메타 + 제목 + 상태 뱃지 */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="min-w-0 flex-1">
          <div
            className="mb-1"
            style={{
              fontSize: 11,
              color: "var(--ink-soft)",
              letterSpacing: "-0.01em",
            }}
          >
            {MEETING_TYPE_LABEL[meeting_type] ?? meeting_type} · #{meeting_id}
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <span
              className="font-bold"
              style={{
                fontSize: 16,
                color: "var(--ink)",
                letterSpacing: "-0.02em",
                lineHeight: 1.3,
              }}
            >
              {title ?? `미팅 #${meeting_id}`}
            </span>
            {is_member && (
              <span
                className="inline-flex items-center rounded-full px-2 py-0.5 font-bold"
                style={{
                  fontSize: 10,
                  background: "var(--accent)",
                  color: "var(--ink-on-accent)",
                  letterSpacing: "-0.01em",
                }}
              >
                참가중
              </span>
            )}
          </div>
        </div>
        <span
          className="shrink-0 px-2.5 py-1 font-bold"
          style={{
            fontSize: 11,
            background: statusBadge.bg,
            color: statusBadge.fg,
            borderRadius: 999,
            letterSpacing: "-0.01em",
          }}
        >
          {statusBadge.label}
        </span>
      </div>

      {/* 팀 진행 바 */}
      <div className="flex gap-3 mb-3">
        <TeamFillBar
          label="남"
          filled={filled.male}
          cap={halfCapacity}
          pct={malePct}
          color="var(--male)"
          softColor="var(--male-soft)"
        />
        <TeamFillBar
          label="여"
          filled={filled.female}
          cap={halfCapacity}
          pct={femalePct}
          color="var(--female)"
          softColor="var(--female-soft)"
        />
      </div>

      {/* 하단: 학교 + ID/빈자리 */}
      <div
        className="flex items-center gap-1.5"
        style={{ fontSize: 12, color: "var(--ink-soft)" }}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
          <path d="M3 21h18M5 21V8l7-5 7 5v13M9 21v-6h6v6" stroke="currentColor" strokeWidth="1.6"/>
        </svg>
        <span style={{ letterSpacing: "-0.01em" }}>{uniLabel}</span>
        {variant === "vacancy" && remaining_my_team > 0 && (
          <span
            className="ml-auto px-2 py-0.5 font-bold"
            style={{
              fontSize: 10,
              background: "var(--accent-soft)",
              color: "var(--accent-ink)",
              borderRadius: 999,
              letterSpacing: "-0.01em",
            }}
          >
            내 팀 빈자리 {remaining_my_team}
          </span>
        )}
      </div>
    </button>
  );
}

function TeamFillBar({
  label, filled, cap, pct, color, softColor,
}: { label: string; filled: number; cap: number; pct: number; color: string; softColor: string }) {
  return (
    <div className="flex-1">
      <div className="flex items-baseline justify-between mb-1">
        <span
          className="font-semibold"
          style={{ fontSize: 11, color: "var(--ink-mid)", letterSpacing: "-0.01em" }}
        >
          {label}
        </span>
        <span
          className="font-semibold"
          style={{ fontSize: 11, color: "var(--ink-mid)" }}
        >
          {filled}/{cap}
        </span>
      </div>
      <div
        className="overflow-hidden"
        style={{ height: 6, borderRadius: 999, background: softColor }}
      >
        <div
          className="h-full transition-all"
          style={{
            width: `${pct}%`,
            background: color,
            borderRadius: 999,
          }}
        />
      </div>
    </div>
  );
}
