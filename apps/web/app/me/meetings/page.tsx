"use client";

/**
 * /me/meetings — 내가 참여한 미팅 목록
 *
 * - RECRUITING / WAITING_CONFIRM / CONFIRMED 상태 배지 표시
 * - 내가 호스트인 경우 표시
 * - 클릭 → /meetings/[id]
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import ErrorBanner from "@/components/ui/ErrorBanner";
import { getMyMeetings, type MyMeetingItem } from "@/lib/api";
import { AppShell } from "@/components/ui/AppShell";
import { T, Icon, Pill, type PillTone, MoreNavBar } from "@/components/me/MoreAtoms";

const MEETING_TYPE_LABELS: Record<string, string> = {
  TWO_BY_TWO: "2:2",
  THREE_BY_THREE: "3:3",
};

const STATUS_CONFIG: Record<string, { label: string; tone: PillTone }> = {
  RECRUITING:      { label: "모집 중",   tone: "accent"  },
  FULL:            { label: "정원 완료", tone: "warning" },
  WAITING_CONFIRM: { label: "확정 대기", tone: "warning" },
  CONFIRMED:       { label: "확정됨",   tone: "success" },
  CANCELLED:       { label: "취소됨",   tone: "neutral" },
};

export default function MyMeetingsPage() {
  const router = useRouter();
  const [meetings, setMeetings] = useState<MyMeetingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getMyMeetings()
      .then((res) => setMeetings(res.meetings))
      .catch((e) => setError(e instanceof Error ? e.message : "로드 실패"))
      .finally(() => setLoading(false));
  }, []);

  const counts = {
    RECRUITING: meetings.filter((m) => m.status === "RECRUITING").length,
    WAITING:    meetings.filter((m) => m.status === "WAITING_CONFIRM" || m.status === "FULL").length,
    CONFIRMED:  meetings.filter((m) => m.status === "CONFIRMED").length,
  };

  return (
    <AppShell>
      <div style={{ background: T.bg, minHeight: "100%", fontFamily: T.fontSans, paddingBottom: 40 }}>
        <MoreNavBar title="내 미팅" fallbackHref="/me" />

        <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
          {error && <ErrorBanner message={error} />}

          {loading ? (
            <div style={{ display: "flex", justifyContent: "center", padding: "60px 0" }}>
              <div className="h-8 w-8 animate-spin rounded-full" style={{
                border: `4px solid ${T.surfaceMuted}`, borderTopColor: T.accent,
              }} />
            </div>
          ) : meetings.length === 0 ? (
            <div style={{
              background: T.surface, border: `1px solid ${T.border}`,
              borderRadius: T.radiusLg, padding: "40px 22px", textAlign: "center",
            }}>
              <div style={{
                width: 52, height: 52, margin: "0 auto", borderRadius: 999,
                background: T.surfaceMuted, color: T.inkSoft,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <Icon name="users" size={24} />
              </div>
              <div style={{ marginTop: 12, fontSize: 14, fontWeight: 700, color: T.ink }}>
                참여한 미팅이 없어요
              </div>
              <div style={{ marginTop: 4, fontSize: 12, color: T.inkSoft }}>
                둘러보기에서 미팅을 찾거나 직접 만들어보세요
              </div>
              <button
                onClick={() => router.push("/discover")}
                style={{
                  marginTop: 16, padding: "12px 18px", borderRadius: T.radiusMd,
                  background: T.accent, color: T.inkOnAccent, border: 0,
                  fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                }}
              >
                미팅 찾아보기 →
              </button>
            </div>
          ) : (
            <>
              {/* 상태 요약 */}
              <div style={{
                background: T.surface, border: `1px solid ${T.border}`,
                borderRadius: T.radiusLg, padding: 14,
                display: "grid", gridTemplateColumns: "1fr 1fr 1fr",
              }}>
                {[
                  { label: "모집 중",   n: counts.RECRUITING },
                  { label: "확정 대기", n: counts.WAITING },
                  { label: "확정됨",   n: counts.CONFIRMED },
                ].map((s, i) => (
                  <div key={s.label} style={{
                    textAlign: "center",
                    borderLeft: i === 0 ? "none" : `1px solid ${T.border}`,
                  }}>
                    <div style={{
                      fontSize: 22, fontWeight: 800, color: T.ink, letterSpacing: "-0.025em",
                    }}>{s.n}</div>
                    <div style={{ fontSize: 11, color: T.inkSoft, marginTop: 2 }}>{s.label}</div>
                  </div>
                ))}
              </div>

              {meetings.map((m) => {
                const st = STATUS_CONFIG[m.status] ?? { label: m.status, tone: "neutral" as PillTone };
                const typeLabel = MEETING_TYPE_LABELS[m.meeting_type] ?? m.meeting_type;
                return (
                  <button
                    key={m.meeting_id}
                    onClick={() => router.push(`/meetings/${m.meeting_id}`)}
                    style={{
                      background: T.surface, border: `1px solid ${T.border}`,
                      borderRadius: T.radiusLg, padding: 14, textAlign: "left",
                      cursor: "pointer", fontFamily: "inherit",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", gap: 5, alignItems: "center", flexWrap: "wrap" }}>
                          <Pill tone={st.tone}>{st.label}</Pill>
                          <Pill tone="neutral">{typeLabel}</Pill>
                          {m.is_host && <Pill tone="accent">호스트</Pill>}
                        </div>
                        <div style={{
                          marginTop: 8, fontSize: 14, fontWeight: 700,
                          color: T.ink, letterSpacing: "-0.01em",
                        }}>
                          {m.title ?? `미팅 #${m.meeting_id}`}
                        </div>
                        <div style={{
                          marginTop: 4, fontSize: 11, color: T.inkSoft, fontFamily: T.fontMono,
                        }}>
                          #{m.meeting_id}
                        </div>
                      </div>
                      <div style={{ paddingTop: 2 }}>
                        <Icon name="chevron" size={16} stroke={T.inkSoft} />
                      </div>
                    </div>

                    {m.chat_room_id && (
                      <div
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push(`/chats/${m.chat_room_id}`);
                        }}
                        style={{
                          marginTop: 12, padding: "10px 12px",
                          background: T.successSoft, borderRadius: T.radiusMd,
                          display: "flex", alignItems: "center", gap: 8,
                          fontSize: 12, fontWeight: 700, color: T.success,
                        }}
                      >
                        <Icon name="chat" size={14} />
                        채팅방 입장 가능
                        <Icon name="chevron" size={14} />
                      </div>
                    )}
                  </button>
                );
              })}
            </>
          )}
        </div>
      </div>
    </AppShell>
  );
}
