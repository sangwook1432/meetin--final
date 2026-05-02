/**
 * TeamSection — 팀 단위 슬롯 묶음 (V1 행스택 레이아웃)
 *
 * MALE 팀: muted blue, FEMALE 팀: soft rose
 * 각 슬롯은 SlotCard로 렌더링
 */

import type { MeetingSlot, Team } from "@/types";
import { SlotCard } from "./SlotCard";

interface TeamSectionProps {
  team: Team;
  slots: MeetingSlot[];
  hostUserId?: number;
  canInvite?: boolean;
  onInviteSlot?: () => void;
}

const TEAM_LABEL: Record<Team, string> = {
  MALE: "남성팀",
  FEMALE: "여성팀",
};

const TEAM_TONE: Record<Team, { fg: string; bg: string }> = {
  MALE: { fg: "var(--male)", bg: "var(--male-soft)" },
  FEMALE: { fg: "var(--female)", bg: "var(--female-soft)" },
};

export function TeamSection({ team, slots, hostUserId, canInvite, onInviteSlot }: TeamSectionProps) {
  const teamSlots = slots
    .filter((s) => s.team === team)
    .sort((a, b) => a.slot_index - b.slot_index);

  const confirmedCount = teamSlots.filter((s) => s.confirmed).length;
  const filledCount = teamSlots.filter((s) => s.user !== null).length;
  const totalCount = teamSlots.length;
  const tone = TEAM_TONE[team];

  return (
    <div
      className="overflow-hidden"
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-lg)",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      {/* 팀 헤더 — 행스택 스타일 */}
      <div
        className="flex items-center justify-between px-4 py-2.5"
        style={{ background: tone.bg, color: tone.fg }}
      >
        <div className="flex items-center gap-2">
          <span
            className="font-bold"
            style={{ fontSize: 13, letterSpacing: "-0.01em" }}
          >
            {TEAM_LABEL[team]}
          </span>
        </div>
        <span
          className="font-semibold"
          style={{ fontSize: 11 }}
        >
          {confirmedCount > 0 && filledCount > 0 ? (
            <>
              <span style={{ color: tone.fg }}>{confirmedCount}</span>
              <span style={{ opacity: 0.6 }}> 확정 · </span>
            </>
          ) : null}
          {filledCount}/{totalCount}
        </span>
      </div>

      {/* 슬롯 행 스택 */}
      <div className="flex flex-col gap-2.5 p-3">
        {teamSlots.map((slot, i) => (
          <SlotCard
            key={`${slot.team}-${slot.slot_index}`}
            slot={slot}
            index={i + 1}
            isHost={!!hostUserId && slot.user?.user_id === hostUserId}
            onInviteClick={canInvite && slot.user === null ? onInviteSlot : undefined}
          />
        ))}
      </div>
    </div>
  );
}
