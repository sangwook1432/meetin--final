"use client";

/**
 * /me — 더보기 허브
 * 활동 / 결제·서류 / 설정·안내 메뉴 그룹을 보여주고 각 하위 페이지로 이동.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { AppShell } from "@/components/ui/AppShell";
import { T, Icon, Pill, type IconName } from "@/components/me/MoreAtoms";
import {
  getMyMeetings, getMySchedules, getMyAfterRequests,
  listFriends, pendingFriendRequests, getWallet,
  deleteAccount,
} from "@/lib/api";

interface HubStats {
  activeMeetings: number;
  confirmedSchedules: number;
  unreadMessages: number;
  friendsCount: number;
  pendingFriends: number;
  balance: number;
  tickets: number;
}

const initialStats: HubStats = {
  activeMeetings: 0,
  confirmedSchedules: 0,
  unreadMessages: 0,
  friendsCount: 0,
  pendingFriends: 0,
  balance: 0,
  tickets: 0,
};

const VERIFICATION_LABEL: Record<string, { tone: "success" | "warning" | "neutral"; label: string }> = {
  VERIFIED: { tone: "success", label: "인증됨" },
  PENDING: { tone: "warning", label: "검토 중" },
  REJECTED: { tone: "warning", label: "재인증 필요" },
  UNVERIFIED: { tone: "neutral", label: "미인증" },
};

export default function MoreHubPage() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const [stats, setStats] = useState<HubStats>(initialStats);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [withdrawAgreed, setWithdrawAgreed] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [withdrawError, setWithdrawError] = useState<string | null>(null);

  useEffect(() => {
    document.body.style.overflow = withdrawOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [withdrawOpen]);

  const walletBalance = user?.balance ?? 0;
  const ticketCount = user?.matching_tickets ?? 0;
  const withdrawCase: "A" | "B" | "C" =
    walletBalance > 1000 ? "A" : ticketCount > 0 ? "B" : "C";

  function openWithdrawModal() {
    setWithdrawAgreed(false);
    setWithdrawError(null);
    setWithdrawOpen(true);
  }

  async function handleDeleteAccount() {
    setWithdrawing(true);
    setWithdrawError(null);
    try {
      await deleteAccount();
      logout();
    } catch (e: unknown) {
      setWithdrawError(e instanceof Error ? e.message : "탈퇴 중 오류가 발생했습니다.");
    } finally {
      setWithdrawing(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [meetings, schedules, msgs, friends, pendF, wallet] = await Promise.allSettled([
          getMyMeetings(),
          getMySchedules(),
          getMyAfterRequests(),
          listFriends(),
          pendingFriendRequests(),
          getWallet(),
        ]);
        if (cancelled) return;
        const next: HubStats = { ...initialStats };
        if (meetings.status === "fulfilled") {
          next.activeMeetings = meetings.value.meetings.filter((m) =>
            ["RECRUITING", "FULL", "WAITING_CONFIRM", "CONFIRMED"].includes(m.status)
          ).length;
        }
        if (schedules.status === "fulfilled") {
          next.confirmedSchedules = schedules.value.schedules.filter((s) => s.schedule.confirmed).length;
        }
        if (msgs.status === "fulfilled") {
          next.unreadMessages = msgs.value.items.length;
        }
        if (friends.status === "fulfilled") {
          next.friendsCount = friends.value.friends.length;
        }
        if (pendF.status === "fulfilled") {
          next.pendingFriends = pendF.value.requests.length;
        }
        if (wallet.status === "fulfilled") {
          next.balance = wallet.value.balance ?? 0;
          next.tickets = wallet.value.matching_tickets ?? 0;
        }
        setStats(next);
      } catch {
        /* ignore — 허브는 부분 로드 허용 */
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const verCfg = VERIFICATION_LABEL[user?.verification_status ?? "UNVERIFIED"] ?? VERIFICATION_LABEL.UNVERIFIED;
  const initials = (user?.nickname ?? "ME").slice(0, 2);

  const groups: { title: string; items: {
    href: string; label: string; icon: IconName; sub?: string; badge?: number; tone?: "success" | "warning";
  }[] }[] = [
    {
      title: "활동",
      items: [
        { href: "/me/meetings", label: "내 미팅",   icon: "users",    sub: stats.activeMeetings ? `참여 중인 미팅 ${stats.activeMeetings}개` : "참여 중인 미팅 없음" },
        { href: "/me/schedule", label: "미팅 일정", icon: "calendar", sub: stats.confirmedSchedules ? `확정 일정 ${stats.confirmedSchedules}건` : "확정된 일정 없음" },
        { href: "/me/messages", label: "쪽지함",    icon: "mail",     sub: stats.unreadMessages ? `새 애프터 신청 ${stats.unreadMessages}건` : "새 애프터 신청 없음", badge: stats.unreadMessages || undefined },
        { href: "/me/friends",  label: "친구",       icon: "users",    sub: `친구 ${stats.friendsCount}명${stats.pendingFriends ? ` · 요청 ${stats.pendingFriends}` : ""}`, badge: stats.pendingFriends || undefined },
      ],
    },
    {
      title: "결제 · 서류",
      items: [
        { href: "/me/wallet", label: "지갑",      icon: "wallet", sub: `잔액 ${stats.balance.toLocaleString()}원` },
        { href: "/me/docs",   label: "재학 인증", icon: "doc",    sub: verCfg.label, tone: verCfg.tone === "success" ? "success" : verCfg.tone === "warning" ? "warning" : undefined },
      ],
    },
    {
      title: "설정 · 안내",
      items: [
        { href: "/me/support", label: "고객지원",    icon: "help" },
        { href: "/me/bizinfo", label: "사업자 정보", icon: "info" },
      ],
    },
  ];

  return (
    <AppShell>
      <div style={{ background: T.bg, minHeight: "100%", fontFamily: T.fontSans, paddingBottom: 60 }}>
        <div style={{ padding: "18px 16px 16px" }}>
          <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.025em", color: T.ink }}>더보기</div>

          {/* 내 카드 */}
          <div style={{
            marginTop: 14, background: T.surface, border: `1px solid ${T.border}`,
            borderRadius: T.radiusLg, padding: 14, display: "flex", alignItems: "center", gap: 12,
          }}>
            <div style={{
              width: 52, height: 52, borderRadius: 999,
              background: `linear-gradient(135deg, ${T.accentSoft}, ${T.surfaceMuted})`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 18, fontWeight: 800, color: T.accentInk, letterSpacing: "-0.02em",
            }}>{initials}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: T.ink, letterSpacing: "-0.02em" }}>
                  {user?.nickname ?? "닉네임"}
                </div>
                <Pill tone={verCfg.tone}>{verCfg.label}</Pill>
              </div>
              <div style={{
                fontSize: 12, color: T.inkSoft, marginTop: 2,
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              }}>
                {user?.university ?? "학교 미입력"} · 매칭권 {stats.tickets}장
              </div>
            </div>
            <button
              onClick={() => router.push("/me/myprofile")}
              style={{
                background: "transparent", border: `1px solid ${T.border}`,
                borderRadius: T.radiusSm, padding: "7px 11px", fontSize: 12, fontWeight: 700,
                color: T.ink, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
              }}
            >
              내 프로필
            </button>
          </div>
        </div>

        {/* 빠른 통계 */}
        <div style={{ padding: "0 16px", display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
          {[
            { label: "매칭권", value: String(stats.tickets), icon: "spark" as const, sub: "장" },
            { label: "잔액",   value: stats.balance.toLocaleString(), icon: "coin" as const, sub: "원" },
            { label: "친구",   value: String(stats.friendsCount), icon: "users" as const, sub: "명" },
          ].map((s) => (
            <div key={s.label} style={{
              background: T.surface, border: `1px solid ${T.border}`,
              borderRadius: T.radiusMd, padding: "12px 12px",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 5, color: T.inkSoft }}>
                <Icon name={s.icon} size={14} />
                <span style={{ fontSize: 11, fontWeight: 600 }}>{s.label}</span>
              </div>
              <div style={{ marginTop: 4, fontSize: 18, fontWeight: 800, color: T.ink, letterSpacing: "-0.02em" }}>
                {s.value}
                {s.sub && <span style={{ fontSize: 11, color: T.inkSoft, marginLeft: 2 }}>{s.sub}</span>}
              </div>
            </div>
          ))}
        </div>

        {/* 메뉴 그룹 */}
        <div style={{ padding: "20px 16px 0" }}>
          {groups.map((g, gi) => (
            <div key={g.title} style={{ marginTop: gi === 0 ? 0 : 18 }}>
              <div style={{
                fontSize: 11, fontWeight: 700, color: T.inkSoft, letterSpacing: "0.08em",
                textTransform: "uppercase", padding: "0 4px 8px",
              }}>{g.title}</div>
              <div style={{
                background: T.surface, border: `1px solid ${T.border}`,
                borderRadius: T.radiusLg, overflow: "hidden",
              }}>
                {g.items.map((item, idx) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    style={{
                      width: "100%", display: "flex", alignItems: "center", gap: 12,
                      padding: "14px 14px", textDecoration: "none",
                      background: "transparent",
                      borderTop: idx === 0 ? "none" : `1px solid ${T.border}`,
                      cursor: "pointer", textAlign: "left",
                      color: T.ink,
                    }}
                  >
                    <div style={{
                      width: 34, height: 34, borderRadius: 10,
                      background: T.surfaceMuted, color: T.ink,
                      display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                    }}>
                      <Icon name={item.icon} size={17} stroke={T.ink} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: T.ink, letterSpacing: "-0.01em" }}>
                          {item.label}
                        </div>
                        {item.badge != null && item.badge > 0 && (
                          <span style={{
                            minWidth: 18, height: 18, padding: "0 5px", borderRadius: 999,
                            background: T.accent, color: T.inkOnAccent,
                            fontSize: 10, fontWeight: 800,
                            display: "inline-flex", alignItems: "center", justifyContent: "center",
                          }}>{item.badge}</span>
                        )}
                        {item.tone === "success" && <Pill tone="success">완료</Pill>}
                        {item.tone === "warning" && <Pill tone="warning">필요</Pill>}
                      </div>
                      {item.sub && (
                        <div style={{
                          fontSize: 12, color: T.inkSoft, marginTop: 2,
                          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                        }}>
                          {item.sub}
                        </div>
                      )}
                    </div>
                    <Icon name="chevron" size={16} stroke={T.inkSoft} />
                  </Link>
                ))}
              </div>
            </div>
          ))}

          {/* 계정 */}
          <div style={{ marginTop: 18 }}>
            <div style={{
              fontSize: 11, fontWeight: 700, color: T.inkSoft,
              letterSpacing: "0.08em", textTransform: "uppercase",
              padding: "0 4px 8px",
            }}>계정</div>
            <div style={{
              background: T.surface, border: `1px solid ${T.border}`,
              borderRadius: T.radiusLg, overflow: "hidden",
            }}>
              <button
                onClick={() => logout()}
                style={{
                  width: "100%", display: "flex", alignItems: "center", gap: 12,
                  padding: "14px 14px",
                  background: "transparent", border: 0, cursor: "pointer",
                  textAlign: "left", fontFamily: "inherit",
                }}
              >
                <div style={{
                  width: 34, height: 34, borderRadius: 10,
                  background: T.surfaceMuted, color: T.ink, flexShrink: 0,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none"
                    stroke={T.ink} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M15 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4"/>
                    <path d="M10 17l-5-5 5-5M5 12h12"/>
                  </svg>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 14, fontWeight: 700, color: T.ink, letterSpacing: "-0.01em",
                  }}>로그아웃</div>
                  <div style={{ fontSize: 12, color: T.inkSoft, marginTop: 2 }}>
                    이 기기에서 계정에서 빠져나와요
                  </div>
                </div>
                <Icon name="chevron" size={16} stroke={T.inkSoft} />
              </button>
              <button
                onClick={openWithdrawModal}
                style={{
                  width: "100%", display: "flex", alignItems: "center", gap: 12,
                  padding: "14px 14px",
                  background: "transparent", border: 0,
                  borderTop: `1px solid ${T.border}`,
                  cursor: "pointer", textAlign: "left", fontFamily: "inherit",
                }}
              >
                <div style={{
                  width: 34, height: 34, borderRadius: 10,
                  background: "var(--danger-soft)", color: "var(--danger)", flexShrink: 0,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <Icon name="trash" size={17} stroke="var(--danger)" />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 14, fontWeight: 700,
                    color: "var(--danger)", letterSpacing: "-0.01em",
                  }}>회원 탈퇴</div>
                  <div style={{ fontSize: 12, color: T.inkSoft, marginTop: 2 }}>
                    계정과 데이터를 영구 삭제합니다
                  </div>
                </div>
                <Icon name="chevron" size={16} stroke={T.inkSoft} />
              </button>
            </div>
          </div>

          <div style={{
            marginTop: 22, textAlign: "center", fontSize: 11,
            color: T.inkSoft, fontFamily: T.fontMono, letterSpacing: "0.08em",
          }}>
            MEETIN. v1.0.0
          </div>
        </div>
      </div>

      {/* 탈퇴 모달 */}
      {withdrawOpen && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 50,
          display: "flex", alignItems: "flex-end", justifyContent: "center",
          background: "rgba(0,0,0,0.5)",
        }}>
          <div className="animate-slide-up" style={{
            width: "100%", maxWidth: 512,
            background: T.surface,
            borderTopLeftRadius: T.radiusXl, borderTopRightRadius: T.radiusXl,
            boxShadow: "0 8px 30px rgba(60,40,20,0.10)",
            padding: "22px 20px",
            paddingBottom: "calc(22px + env(safe-area-inset-bottom, 0px))",
          }}>
            {withdrawCase === "A" && (
              <>
                <div style={{
                  width: 48, height: 48, borderRadius: 999, marginBottom: 14,
                  background: "var(--danger-soft)", color: "var(--danger)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 9v4M12 17h.01"/>
                    <path d="M10.3 3.86l-8.1 14a2 2 0 0 0 1.7 3h16.2a2 2 0 0 0 1.7-3l-8.1-14a2 2 0 0 0-3.4 0z"/>
                  </svg>
                </div>
                <div style={{
                  fontSize: 18, fontWeight: 800, color: T.ink, letterSpacing: "-0.02em",
                }}>탈퇴가 불가능합니다</div>
                <div style={{
                  marginTop: 8, fontSize: 13, color: T.inkMid, lineHeight: 1.6,
                }}>
                  환불 가능한 지갑 잔액이 남아있어 탈퇴할 수 없어요. 잔액을 모두 소진하시거나 환불 신청 후 다시 시도해 주세요.
                </div>
                <div style={{
                  marginTop: 12, padding: "10px 14px",
                  background: "var(--danger-soft)", borderRadius: T.radiusMd,
                  fontSize: 13, fontWeight: 700, color: "var(--danger)",
                }}>
                  현재 잔액: {walletBalance.toLocaleString()}원
                </div>
                <button
                  onClick={() => setWithdrawOpen(false)}
                  style={{
                    marginTop: 18, width: "100%", padding: "12px 16px",
                    borderRadius: T.radiusMd,
                    background: "transparent", color: T.inkMid,
                    border: `1px solid ${T.border}`,
                    fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                  }}
                >
                  돌아가기
                </button>
              </>
            )}

            {withdrawCase === "B" && (
              <>
                <div style={{
                  width: 48, height: 48, borderRadius: 999, marginBottom: 14,
                  background: T.accentSoft, color: T.accentInk,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <Icon name="spark" size={22} stroke="currentColor" />
                </div>
                <div style={{
                  fontSize: 18, fontWeight: 800, color: T.ink, letterSpacing: "-0.02em",
                }}>매칭권이 소멸됩니다</div>
                <div style={{
                  marginTop: 8, fontSize: 13, color: T.inkMid, lineHeight: 1.6,
                }}>
                  현재 보유 중인 매칭권{" "}
                  <span style={{ fontWeight: 800, color: T.accentInk }}>{ticketCount}장</span>이 모두 소멸되며,
                  탈퇴 후 어떠한 경우에도 복구 및 환불이 불가합니다.
                </div>
                <label style={{
                  marginTop: 14, display: "flex", alignItems: "flex-start", gap: 10,
                  padding: "12px 14px", borderRadius: T.radiusMd,
                  background: T.accentSoft, cursor: "pointer",
                }}>
                  <input
                    type="checkbox"
                    checked={withdrawAgreed}
                    onChange={(e) => setWithdrawAgreed(e.target.checked)}
                    style={{
                      width: 16, height: 16, marginTop: 2, flexShrink: 0,
                      accentColor: "var(--danger)",
                    }}
                  />
                  <span style={{ fontSize: 12, color: T.inkMid, lineHeight: 1.55 }}>
                    위 내용을 확인하였으며, 매칭권 소멸 및 회원 탈퇴에 동의합니다.
                  </span>
                </label>
                {withdrawError && (
                  <div style={{
                    marginTop: 12, padding: "10px 12px", borderRadius: T.radiusMd,
                    background: "var(--danger-soft)",
                    color: "var(--danger)",
                    fontSize: 12.5, fontWeight: 600,
                  }}>
                    {withdrawError}
                  </div>
                )}
                <div style={{ marginTop: 18, display: "flex", gap: 8 }}>
                  <button
                    onClick={() => setWithdrawOpen(false)}
                    disabled={withdrawing}
                    style={{
                      flex: 1, padding: "12px 16px", borderRadius: T.radiusMd,
                      background: "transparent", color: T.inkMid,
                      border: `1px solid ${T.border}`,
                      fontSize: 13, fontWeight: 600,
                      cursor: withdrawing ? "default" : "pointer",
                      fontFamily: "inherit", opacity: withdrawing ? 0.5 : 1,
                    }}
                  >
                    취소
                  </button>
                  <button
                    onClick={handleDeleteAccount}
                    disabled={!withdrawAgreed || withdrawing}
                    style={{
                      flex: 1, padding: "12px 16px", borderRadius: T.radiusMd,
                      background: !withdrawAgreed || withdrawing ? T.surfaceMuted : "var(--danger)",
                      color: !withdrawAgreed || withdrawing ? T.inkSoft : "#FFF",
                      border: 0, fontSize: 13, fontWeight: 800,
                      cursor: !withdrawAgreed || withdrawing ? "default" : "pointer",
                      fontFamily: "inherit",
                    }}
                  >
                    {withdrawing ? "처리 중..." : "탈퇴하기"}
                  </button>
                </div>
              </>
            )}

            {withdrawCase === "C" && (
              <>
                <div style={{
                  fontSize: 18, fontWeight: 800, color: T.ink, letterSpacing: "-0.02em",
                }}>정말 탈퇴하시겠어요?</div>
                <div style={{
                  marginTop: 8, fontSize: 13, color: T.inkMid, lineHeight: 1.6,
                }}>
                  탈퇴 시 유저 정보 및 미팅 내역이 모두 삭제되며 복구할 수 없어요.
                </div>
                {withdrawError && (
                  <div style={{
                    marginTop: 12, padding: "10px 12px", borderRadius: T.radiusMd,
                    background: "var(--danger-soft)",
                    color: "var(--danger)",
                    fontSize: 12.5, fontWeight: 600,
                  }}>
                    {withdrawError}
                  </div>
                )}
                <div style={{ marginTop: 18, display: "flex", gap: 8 }}>
                  <button
                    onClick={() => setWithdrawOpen(false)}
                    disabled={withdrawing}
                    style={{
                      flex: 1, padding: "12px 16px", borderRadius: T.radiusMd,
                      background: "transparent", color: T.inkMid,
                      border: `1px solid ${T.border}`,
                      fontSize: 13, fontWeight: 600,
                      cursor: withdrawing ? "default" : "pointer",
                      fontFamily: "inherit", opacity: withdrawing ? 0.5 : 1,
                    }}
                  >
                    취소
                  </button>
                  <button
                    onClick={handleDeleteAccount}
                    disabled={withdrawing}
                    style={{
                      flex: 1, padding: "12px 16px", borderRadius: T.radiusMd,
                      background: withdrawing ? T.surfaceMuted : "var(--danger)",
                      color: withdrawing ? T.inkSoft : "#FFF",
                      border: 0, fontSize: 13, fontWeight: 800,
                      cursor: withdrawing ? "default" : "pointer",
                      fontFamily: "inherit",
                    }}
                  >
                    {withdrawing ? "처리 중..." : "탈퇴하기"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </AppShell>
  );
}
