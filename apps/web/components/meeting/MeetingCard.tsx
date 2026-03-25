/**
 * MeetingCard — discover / vacancies 목록에서 사용되는 미팅 카드
 *
 * Props:
 *  - meeting: MeetingListItem
 *  - onClick: 클릭 시 상세 페이지로 이동
 *  - variant: "discover" | "vacancy" (기본 discover)
 *    vacancy일 때는 "빈자리 N석" 강조 표시
 */

import type { MeetingListItem } from "@/types";

interface MeetingCardProps {
  meeting: MeetingListItem;
  onClick: () => void;
  variant?: "discover" | "vacancy";
  visited?: boolean;
}

const MEETING_TYPE_LABEL: Record<string, string> = {
  TWO_BY_TWO: "2 : 2 미팅",
  THREE_BY_THREE: "3 : 3 미팅",
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

  // 상태 뱃지
  const statusBadge = (() => {
    switch (status) {
      case "RECRUITING":
        return { label: "모집중", cls: "bg-blue-100 text-blue-700" };
      case "FULL":
        return { label: "정원마감", cls: "bg-gray-100 text-gray-600" };
      case "WAITING_CONFIRM":
        return { label: "확정 대기", cls: "bg-yellow-100 text-yellow-700" };
      case "CONFIRMED":
        return { label: "확정 완료", cls: "bg-emerald-100 text-emerald-700" };
      default:
        return { label: status, cls: "bg-gray-100 text-gray-500" };
    }
  })();

  // 학교 선호 표시
  const uniLabel = preferred_universities_any
    ? "모든 학교"
    : preferred_universities_raw
    ? preferred_universities_raw
        .split(",")
        .slice(0, 3)
        .map((u) => u.trim().replace("학교", "").replace("대학교", "대"))
        .join(" · ") + (preferred_universities_raw.split(",").length > 3 ? " 외" : "")
    : "모든 학교";

  return (
    <div
      onClick={onClick}
      className={`cursor-pointer rounded-2xl border p-4 shadow-sm transition-all active:scale-98 ${
        visited
          ? "bg-gray-50 border-gray-100 opacity-60 hover:opacity-80"
          : "bg-white border-gray-100 hover:border-blue-200 hover:shadow-md"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        {/* 왼쪽: 미팅 유형 + ID */}
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-lg font-black text-gray-900">
              {title ?? `미팅 #${meeting_id}`}
            </span>
            {is_member && (
              <span className="rounded-full bg-blue-600 px-2 py-0.5 text-xs font-bold text-white">
                참가중
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-gray-400">{MEETING_TYPE_LABEL[meeting_type] ?? meeting_type}</p>
        </div>

        {/* 오른쪽: 상태 뱃지 */}
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${statusBadge.cls}`}>
          {statusBadge.label}
        </span>
      </div>

      {/* 참가 현황 */}
      <div className="mt-3">
        {/* 진행 바 */}
        <div className="flex gap-2">
          {/* 남성 팀 */}
          <div className="flex-1">
            <div className="mb-1 flex items-center justify-between text-xs text-gray-500">
              <span>👨 남성</span>
              <span className="font-medium">
                {filled.male} / {halfCapacity}
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
              <div
                className="h-full rounded-full bg-blue-400 transition-all"
                style={{ width: `${(filled.male / halfCapacity) * 100}%` }}
              />
            </div>
          </div>
          {/* 여성 팀 */}
          <div className="flex-1">
            <div className="mb-1 flex items-center justify-between text-xs text-gray-500">
              <span>👩 여성</span>
              <span className="font-medium">
                {filled.female} / {halfCapacity}
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
              <div
                className="h-full rounded-full bg-pink-400 transition-all"
                style={{ width: `${(filled.female / halfCapacity) * 100}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* 하단 정보 */}
      <div className="mt-3 flex items-center gap-3 text-xs text-gray-400">
        <span>🏫 {uniLabel}</span>
        {variant === "vacancy" && remaining_my_team > 0 && (
          <span className="ml-auto rounded-full bg-orange-100 px-2.5 py-1 font-semibold text-orange-600">
            내 팀 빈자리 {remaining_my_team}석
          </span>
        )}
      </div>
    </div>
  );
}
