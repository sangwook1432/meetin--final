"use client";

/**
 * FriendInviteModal — 미팅 상세 빈자리 클릭 시 열리는 친구 초대 바텀시트
 *
 * - 같은 성별 친구 목록을 로드하여 표시
 * - 각 친구 카드에 "초대" 버튼 → POST /invitations/meeting-by-id 호출
 * - 결과를 행 인라인으로 표시 (초대 완료 / 이미 초대됨 / 이미 참가 중 / 에러)
 */

import { useEffect, useState } from "react";
import { listFriends, inviteFriendToMeetingById } from "@/lib/api";
import type { FriendItem } from "@/lib/api";
import type { Team } from "@/types";

interface FriendInviteModalProps {
  meetingId: number;
  userTeam: Team;
  onClose: () => void;
  onInvited: () => void;
}

export function FriendInviteModal({ meetingId, userTeam, onClose, onInvited }: FriendInviteModalProps) {
  const [friends, setFriends] = useState<FriendItem[]>([]);
  const [friendsLoading, setFriendsLoading] = useState(true);
  const [inviteResults, setInviteResults] = useState<Record<number, string>>({});
  const [inviting, setInviting] = useState<Record<number, boolean>>({});

  useEffect(() => {
    listFriends()
      .then((res) => {
        const genderFilter = userTeam === "MALE" ? "MALE" : "FEMALE";
        setFriends(res.friends.filter((f) => f.gender === genderFilter));
      })
      .catch(() => {})
      .finally(() => setFriendsLoading(false));
  }, [userTeam]);

  const handleInvite = async (friend: FriendItem) => {
    setInviting((prev) => ({ ...prev, [friend.id]: true }));
    try {
      const res = await inviteFriendToMeetingById(meetingId, friend.id);
      setInviteResults((prev) => ({ ...prev, [friend.id]: res.status }));
      if (res.status === "invited") {
        setTimeout(() => onInvited(), 800);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "초대 실패";
      setInviteResults((prev) => ({ ...prev, [friend.id]: `error:${msg}` }));
    } finally {
      setInviting((prev) => ({ ...prev, [friend.id]: false }));
    }
  };

  const getResultUI = (friendId: number) => {
    const result = inviteResults[friendId];
    if (!result) return null;
    if (result === "invited") {
      return <span className="text-xs font-semibold text-emerald-600">초대 완료!</span>;
    }
    if (result === "already_invited") {
      return <span className="text-xs font-semibold text-yellow-600">이미 초대됨</span>;
    }
    if (result === "already_member") {
      return <span className="text-xs font-semibold text-yellow-600">이미 참가 중</span>;
    }
    if (result.startsWith("error:")) {
      return <span className="text-xs font-semibold text-red-500">{result.slice(6)}</span>;
    }
    return null;
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-3xl bg-white p-6 pb-8 shadow-2xl max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="mb-5 flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="text-lg font-bold text-gray-900">친구 초대</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {userTeam === "MALE" ? "남성" : "여성"} 친구만 표시됩니다
            </p>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            ✕
          </button>
        </div>

        {/* 친구 목록 */}
        <div className="overflow-y-auto flex-1">
          {friendsLoading ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-16 animate-pulse rounded-xl bg-gray-100" />
              ))}
            </div>
          ) : friends.length === 0 ? (
            <div className="rounded-xl bg-gray-50 border border-gray-100 py-10 text-center">
              <p className="text-sm text-gray-400">초대할 수 있는 친구가 없습니다</p>
              <p className="mt-1 text-xs text-gray-300">
                같은 성별의 친구를 먼저 추가해주세요
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {friends.map((f) => {
                const result = inviteResults[f.id];
                const isDone = result === "invited";
                const isLoading = inviting[f.id];
                return (
                  <div
                    key={f.id}
                    className="flex items-center justify-between rounded-xl border border-gray-100 bg-white p-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-gray-900 text-sm truncate">
                        {f.nickname ?? `유저#${f.id}`}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {f.university ?? "학교 미입력"} · {f.gender === "MALE" ? "남" : "여"}
                      </p>
                    </div>
                    <div className="flex-shrink-0 ml-3 flex items-center gap-2">
                      {getResultUI(f.id)}
                      {!isDone && (
                        <button
                          onClick={() => handleInvite(f)}
                          disabled={isLoading || !!result}
                          className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50 active:scale-95 transition-all"
                        >
                          {isLoading ? "..." : "초대"}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
