/**
 * TeamSection — 팀(MALE / FEMALE) 단위로 슬롯들을 묶어 표시
 *
 * MALE   팀: 남색 헤더
 * FEMALE 팀: 핑크 헤더
 *
 * 각 슬롯은 SlotCard로 렌더링
 */

import type { MeetingSlot, Team } from "@/types";
import { SlotCard } from "./SlotCard";

interface TeamSectionProps {
  team: Team;
  slots: MeetingSlot[];
}

const TEAM_LABEL: Record<Team, string> = {
  MALE: "👨 남성팀",
  FEMALE: "👩 여성팀",
};

const TEAM_COLOR: Record<Team, string> = {
  MALE: "bg-blue-600",
  FEMALE: "bg-pink-500",
};

export function TeamSection({ team, slots }: TeamSectionProps) {
  const teamSlots = slots
    .filter((s) => s.team === team)
    .sort((a, b) => a.slot_index - b.slot_index);

  const confirmedCount = teamSlots.filter((s) => s.confirmed).length;
  const filledCount = teamSlots.filter((s) => s.user !== null).length;

  return (
    <div className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">
      {/* 팀 헤더 */}
      <div className={`flex items-center justify-between px-5 py-3 ${TEAM_COLOR[team]}`}>
        <span className="font-bold text-white text-sm">{TEAM_LABEL[team]}</span>
        <span className="text-xs text-white/80">
          확정 {confirmedCount} / {filledCount}명
        </span>
      </div>

      {/* 슬롯 리스트 */}
      <div className="flex flex-col gap-3 p-4">
        {teamSlots.map((slot, i) => (
          <SlotCard key={`${slot.team}-${slot.slot_index}`} slot={slot} index={i + 1} />
        ))}
      </div>
    </div>
  );
}
