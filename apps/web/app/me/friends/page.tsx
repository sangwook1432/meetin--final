"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import ErrorBanner from "@/components/ui/ErrorBanner";
import {
  listFriends,
  pendingFriendRequests,
  sendFriendRequest,
  acceptFriendRequest,
  rejectFriendRequest,
  deleteFriend,
  type FriendItem,
} from "@/lib/api";
import { AppShell } from "@/components/ui/AppShell";
import { T, Icon, Pill, SectionCard, MoreNavBar } from "@/components/me/MoreAtoms";

type TabId = "list" | "pending" | "add";

interface PendingRequest {
  friendship_id: number;
  requester_id: number;
  nickname: string | null;
  created_at: string;
}

function formatRelative(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  const diffMs = Date.now() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "방금 전";
  if (diffMin < 60) return `${diffMin}분 전`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}시간 전`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay === 1) return "어제";
  if (diffDay < 7) return `${diffDay}일 전`;
  return d.toLocaleDateString("ko-KR", { month: "short", day: "numeric" });
}

export default function FriendsPage() {
  const router = useRouter();
  const [tab, setTab] = useState<TabId>("list");

  const [friends, setFriends] = useState<FriendItem[]>([]);
  const [friendsLoading, setFriendsLoading] = useState(true);
  const [friendsError, setFriendsError] = useState<string | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<number | null>(null);

  const [pending, setPending] = useState<PendingRequest[]>([]);
  const [pendingLoading, setPendingLoading] = useState(true);
  const [pendingError, setPendingError] = useState<string | null>(null);
  const [respondingId, setRespondingId] = useState<number | null>(null);

  const [phone, setPhone] = useState("");
  const [addLoading, setAddLoading] = useState(false);
  const [addResult, setAddResult] = useState<{ success: boolean; message: string } | null>(null);

  useEffect(() => {
    listFriends()
      .then((res) => setFriends(res.friends))
      .catch((e) => setFriendsError(e instanceof Error ? e.message : "로드 실패"))
      .finally(() => setFriendsLoading(false));

    pendingFriendRequests()
      .then((res) => setPending(res.requests))
      .catch((e) => setPendingError(e instanceof Error ? e.message : "로드 실패"))
      .finally(() => setPendingLoading(false));
  }, []);

  async function handleAccept(id: number) {
    setRespondingId(id);
    try {
      await acceptFriendRequest(id);
      setPending((prev) => prev.filter((r) => r.friendship_id !== id));
      const res = await listFriends();
      setFriends(res.friends);
    } catch (e) {
      alert(e instanceof Error ? e.message : "오류 발생");
    } finally {
      setRespondingId(null);
    }
  }

  async function handleReject(id: number) {
    setRespondingId(id);
    try {
      await rejectFriendRequest(id);
      setPending((prev) => prev.filter((r) => r.friendship_id !== id));
    } catch (e) {
      alert(e instanceof Error ? e.message : "오류 발생");
    } finally {
      setRespondingId(null);
    }
  }

  async function handleSendRequest() {
    if (!phone.trim()) return;
    setAddLoading(true);
    setAddResult(null);
    try {
      const res = await sendFriendRequest(phone.trim());
      const nickname = res.target_nickname ? `${res.target_nickname}님께` : "";
      setAddResult({ success: true, message: `${nickname} 친구 요청을 보냈어요.` });
      setPhone("");
    } catch (e) {
      setAddResult({ success: false, message: e instanceof Error ? e.message : "요청 실패" });
    } finally {
      setAddLoading(false);
    }
  }

  const TABS: { id: TabId; label: string; count: number }[] = [
    { id: "list", label: "내 친구", count: friends.length },
    { id: "pending", label: "받은 요청", count: pending.length },
    { id: "add", label: "친구 추가", count: 0 },
  ];

  return (
    <AppShell>
      <div style={{ background: T.bg, minHeight: "100%", fontFamily: T.fontSans, paddingBottom: 40 }}>
        <MoreNavBar title="친구" fallbackHref="/me" />

        {/* 탭 */}
        <div style={{ padding: "14px 16px 0" }}>
          <div style={{
            display: "flex", background: T.surfaceMuted,
            borderRadius: T.radiusMd, padding: 4, gap: 4,
          }}>
            {TABS.map((tb) => {
              const active = tab === tb.id;
              return (
                <button
                  key={tb.id}
                  onClick={() => setTab(tb.id)}
                  style={{
                    flex: 1, padding: "8px 4px", border: 0,
                    background: active ? T.surface : "transparent",
                    color: active ? T.ink : T.inkSoft,
                    borderRadius: T.radiusSm,
                    fontSize: 12, fontWeight: 700, fontFamily: "inherit", letterSpacing: "-0.01em",
                    cursor: "pointer",
                    display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 5,
                    boxShadow: active ? T.shadowSm : "none",
                  }}
                >
                  {tb.label}
                  {tb.count > 0 && (
                    <span style={{
                      minWidth: 16, height: 16, padding: "0 4px", borderRadius: 999,
                      background: active ? T.accent : T.border,
                      color: active ? T.inkOnAccent : T.inkMid,
                      fontSize: 9, fontWeight: 800,
                      display: "inline-flex", alignItems: "center", justifyContent: "center",
                    }}>{tb.count}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
          {/* 내 친구 */}
          {tab === "list" && (
            <>
              {friendsError && <ErrorBanner message={friendsError} />}
              {friendsLoading ? (
                <div style={{ display: "flex", justifyContent: "center", padding: "40px 0" }}>
                  <div className="h-7 w-7 animate-spin rounded-full" style={{
                    border: `4px solid ${T.surfaceMuted}`, borderTopColor: T.accent,
                  }} />
                </div>
              ) : friends.length === 0 ? (
                <SectionCard padding="32px 20px" style={{ textAlign: "center" }}>
                  <div style={{
                    width: 48, height: 48, margin: "0 auto", borderRadius: 999,
                    background: T.surfaceMuted, color: T.inkSoft,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <Icon name="users" size={22} />
                  </div>
                  <div style={{ marginTop: 12, fontSize: 13, fontWeight: 700, color: T.ink }}>
                    아직 친구가 없어요
                  </div>
                  <div style={{ marginTop: 4, fontSize: 12, color: T.inkSoft }}>
                    친구 추가 탭에서 친구를 추가해보세요
                  </div>
                  <button
                    onClick={() => setTab("add")}
                    style={{
                      marginTop: 14, padding: "10px 16px", borderRadius: T.radiusMd,
                      background: T.accent, color: T.inkOnAccent, border: 0,
                      fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                    }}
                  >
                    친구 추가하기
                  </button>
                </SectionCard>
              ) : (
                friends.map((f) => {
                  const isFemale = f.gender === "FEMALE";
                  const isMale = f.gender === "MALE";
                  return (
                    <div key={f.id} style={{
                      position: "relative",
                      background: T.surface, border: `1px solid ${T.border}`,
                      borderRadius: T.radiusLg, padding: "12px 14px",
                      display: "flex", alignItems: "center", gap: 12,
                    }}>
                      <div
                        onClick={() => router.push(`/profile/${f.id}`)}
                        style={{
                          display: "flex", alignItems: "center", gap: 12,
                          flex: 1, minWidth: 0, cursor: "pointer",
                        }}
                      >
                        <div style={{
                          width: 42, height: 42, borderRadius: 999, flexShrink: 0,
                          background: isFemale ? T.femaleSoft : isMale ? T.maleSoft : T.surfaceMuted,
                          color: isFemale ? T.female : isMale ? T.male : T.inkSoft,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 14, fontWeight: 800, letterSpacing: "-0.02em",
                        }}>
                          {(f.nickname ?? "?").slice(0, 1)}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                            <div style={{
                              fontSize: 14, fontWeight: 700,
                              color: T.ink, letterSpacing: "-0.01em",
                            }}>
                              {f.nickname ?? "이름 없음"}
                            </div>
                            {f.verification_status === "VERIFIED" && <Pill tone="success">인증</Pill>}
                            {f.verification_status === "PENDING" && <Pill tone="warning">검토 중</Pill>}
                          </div>
                          <div style={{
                            fontSize: 12, color: T.inkSoft, marginTop: 2,
                            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                          }}>
                            {f.university ?? "학교 미입력"} · 끝 {f.phone_last4}
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setMenuOpenId(menuOpenId === f.id ? null : f.id);
                        }}
                        aria-label="더보기"
                        style={{
                          width: 30, height: 30, borderRadius: 999,
                          background: "transparent", border: 0, cursor: "pointer",
                          color: T.inkSoft, padding: 0,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          flexShrink: 0,
                        }}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24">
                          <circle cx="5" cy="12" r="1.5" fill="currentColor" />
                          <circle cx="12" cy="12" r="1.5" fill="currentColor" />
                          <circle cx="19" cy="12" r="1.5" fill="currentColor" />
                        </svg>
                      </button>
                      {menuOpenId === f.id && (
                        <>
                          <div
                            onClick={() => setMenuOpenId(null)}
                            style={{ position: "fixed", inset: 0, zIndex: 10 }}
                          />
                          <div style={{
                            position: "absolute", right: 12, top: 48, zIndex: 20,
                            background: T.surface, border: `1px solid ${T.border}`,
                            borderRadius: T.radiusMd, boxShadow: T.shadowMd,
                            padding: 4, minWidth: 120,
                          }}>
                            <button
                              onClick={async (e) => {
                                e.stopPropagation();
                                if (!confirm(`${f.nickname ?? "이 친구"}를 삭제할까요?`)) return;
                                await deleteFriend(f.id);
                                setFriends((prev) => prev.filter((x) => x.id !== f.id));
                                setMenuOpenId(null);
                              }}
                              style={{
                                width: "100%", padding: "9px 12px", textAlign: "left",
                                background: "transparent", border: 0, borderRadius: T.radiusSm,
                                fontSize: 12.5, fontWeight: 600, color: "oklch(0.55 0.20 22)",
                                cursor: "pointer", fontFamily: "inherit",
                              }}
                            >
                              친구 삭제
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })
              )}
            </>
          )}

          {/* 받은 요청 */}
          {tab === "pending" && (
            <>
              {pendingError && <ErrorBanner message={pendingError} />}
              {pendingLoading ? (
                <div style={{ display: "flex", justifyContent: "center", padding: "40px 0" }}>
                  <div className="h-7 w-7 animate-spin rounded-full" style={{
                    border: `4px solid ${T.surfaceMuted}`, borderTopColor: T.accent,
                  }} />
                </div>
              ) : pending.length === 0 ? (
                <SectionCard padding="32px 20px" style={{ textAlign: "center" }}>
                  <div style={{
                    width: 44, height: 44, margin: "0 auto", borderRadius: 999,
                    background: T.surfaceMuted, color: T.inkSoft,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <Icon name="mail" size={22} />
                  </div>
                  <div style={{ marginTop: 10, fontSize: 13, fontWeight: 700, color: T.ink }}>
                    받은 요청이 없어요
                  </div>
                </SectionCard>
              ) : (
                pending.map((p) => (
                  <div key={p.friendship_id} style={{
                    background: T.surface, border: `1px solid ${T.border}`,
                    borderRadius: T.radiusLg, padding: 14,
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <div style={{
                        width: 40, height: 40, borderRadius: 999, flexShrink: 0,
                        background: T.accentSoft, color: T.accentInk,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 14, fontWeight: 800,
                      }}>
                        {(p.nickname ?? "?").slice(0, 1)}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontSize: 14, fontWeight: 700,
                          color: T.ink, letterSpacing: "-0.01em",
                        }}>
                          {p.nickname ?? `유저 #${p.requester_id}`}
                        </div>
                        <div style={{ fontSize: 11, color: T.inkSoft, marginTop: 1 }}>
                          {formatRelative(p.created_at)} 친구 요청
                        </div>
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                      <button
                        onClick={() => handleAccept(p.friendship_id)}
                        disabled={respondingId === p.friendship_id}
                        style={{
                          flex: 1, padding: "10px 12px", borderRadius: T.radiusSm,
                          background: T.accent, color: T.inkOnAccent, border: 0,
                          fontSize: 13, fontWeight: 700,
                          cursor: respondingId === p.friendship_id ? "default" : "pointer",
                          fontFamily: "inherit",
                          opacity: respondingId === p.friendship_id ? 0.5 : 1,
                        }}
                      >
                        수락
                      </button>
                      <button
                        onClick={() => handleReject(p.friendship_id)}
                        disabled={respondingId === p.friendship_id}
                        style={{
                          flex: 1, padding: "10px 12px", borderRadius: T.radiusSm,
                          background: "transparent", color: T.inkMid,
                          border: `1px solid ${T.border}`,
                          fontSize: 13, fontWeight: 600,
                          cursor: respondingId === p.friendship_id ? "default" : "pointer",
                          fontFamily: "inherit",
                          opacity: respondingId === p.friendship_id ? 0.5 : 1,
                        }}
                      >
                        거절
                      </button>
                    </div>
                  </div>
                ))
              )}
            </>
          )}

          {/* 친구 추가 */}
          {tab === "add" && (
            <SectionCard>
              <div style={{
                fontSize: 14, fontWeight: 700,
                color: T.ink, letterSpacing: "-0.01em",
              }}>
                전화번호로 친구 추가
              </div>
              <div style={{ marginTop: 4, fontSize: 12, color: T.inkSoft, lineHeight: 1.5 }}>
                친구의 전화번호를 입력하면 요청을 보낼 수 있어요. 상대가 수락하면 친구로 등록됩니다.
              </div>
              <div style={{ marginTop: 14, display: "flex", gap: 8 }}>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSendRequest()}
                  placeholder="010-0000-0000"
                  style={{
                    flex: 1, minWidth: 0,
                    padding: "12px 14px", borderRadius: T.radiusMd,
                    border: `1px solid ${T.border}`, background: T.bg,
                    fontSize: 14, color: T.ink, outline: "none",
                    fontFamily: "inherit", letterSpacing: "0.02em",
                  }}
                />
                <button
                  onClick={handleSendRequest}
                  disabled={addLoading || !phone.trim()}
                  style={{
                    padding: "0 18px", borderRadius: T.radiusMd,
                    background: T.accent, color: T.inkOnAccent, border: 0,
                    fontSize: 13, fontWeight: 700,
                    cursor: addLoading || !phone.trim() ? "default" : "pointer",
                    fontFamily: "inherit", whiteSpace: "nowrap",
                    opacity: addLoading || !phone.trim() ? 0.5 : 1,
                  }}
                >
                  {addLoading ? "..." : "요청"}
                </button>
              </div>

              {addResult && (
                <div style={{
                  marginTop: 12, padding: "10px 12px", borderRadius: T.radiusMd,
                  background: addResult.success ? T.successSoft : T.warningSoft,
                  color: addResult.success ? T.success : "oklch(0.45 0.13 70)",
                  fontSize: 12.5, fontWeight: 600, lineHeight: 1.5,
                }}>
                  {addResult.success ? "✓ " : "✗ "}{addResult.message}
                </div>
              )}

              <div style={{
                marginTop: 12, padding: "10px 12px",
                background: T.surfaceMuted, borderRadius: T.radiusMd,
                fontSize: 11, color: T.inkSoft, lineHeight: 1.5,
              }}>
                연락처 권한을 허용하면 가입한 친구를 자동으로 추천해드려요.
              </div>
            </SectionCard>
          )}
        </div>
      </div>
    </AppShell>
  );
}
