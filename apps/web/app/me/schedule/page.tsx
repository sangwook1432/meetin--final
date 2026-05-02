"use client";

/**
 * /me/schedule — 내 미팅 일정
 *
 * - 내가 참가한 CONFIRMED 미팅들의 일정 목록
 * - 일정 있는 것 / 없는 것 구분 표시
 * - 채팅방 바로 가기 버튼
 */

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import ErrorBanner from "@/components/ui/ErrorBanner";
import { getMySchedules } from "@/lib/api";
import { AppShell } from "@/components/ui/AppShell";
import { T, Icon, Pill, MoreNavBar } from "@/components/me/MoreAtoms";

interface ScheduleItem {
  meeting_id: number;
  meeting_type: string;
  title: string | null;
  chat_room_id: number | null;
  schedule: {
    date: string | null;
    time: string | null;
    place: string | null;
    confirmed: boolean;
  };
}

const MEETING_TYPE_LABELS: Record<string, string> = {
  TWO_BY_TWO: "2:2",
  THREE_BY_THREE: "3:3",
};

function parseUpcoming(items: ScheduleItem[]) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let best: { item: ScheduleItem; date: Date; days: number } | null = null;
  for (const it of items) {
    if (!it.schedule.date) continue;
    const m = it.schedule.date.match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
    if (!m) continue;
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    if (Number.isNaN(d.getTime())) continue;
    const days = Math.round((d.getTime() - today.getTime()) / 86400000);
    if (days < 0) continue;
    if (!best || days < best.days) best = { item: it, date: d, days };
  }
  return best;
}

export default function SchedulePage() {
  const router = useRouter();
  const [schedules, setSchedules] = useState<ScheduleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getMySchedules()
      .then((res) => setSchedules(res.schedules))
      .catch((e) => setError(e instanceof Error ? e.message : "로드 실패"))
      .finally(() => setLoading(false));
  }, []);

  const upcoming = useMemo(() => parseUpcoming(schedules), [schedules]);

  return (
    <AppShell>
      <div style={{ background: T.bg, minHeight: "100%", fontFamily: T.fontSans, paddingBottom: 40 }}>
        <MoreNavBar title="미팅 일정" fallbackHref="/me" />

        {error && <div style={{ padding: "14px 16px 0" }}><ErrorBanner message={error} /></div>}

        {loading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: "60px 0" }}>
            <div className="h-8 w-8 animate-spin rounded-full" style={{
              border: `4px solid ${T.surfaceMuted}`, borderTopColor: T.accent,
            }} />
          </div>
        ) : schedules.length === 0 ? (
          <div style={{ padding: "16px" }}>
            <div style={{
              background: T.surface, border: `1px solid ${T.border}`,
              borderRadius: T.radiusLg, padding: "40px 22px", textAlign: "center",
            }}>
              <div style={{
                width: 52, height: 52, margin: "0 auto", borderRadius: 999,
                background: T.surfaceMuted, color: T.inkSoft,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <Icon name="calendar" size={24} />
              </div>
              <div style={{ marginTop: 12, fontSize: 14, fontWeight: 700, color: T.ink }}>
                확정된 미팅이 없어요
              </div>
              <div style={{ marginTop: 4, fontSize: 12, color: T.inkSoft }}>
                미팅이 확정되면 여기에 일정이 표시돼요
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
          </div>
        ) : (
          <>
            {/* 다음 미팅 강조 */}
            {upcoming && (
              <div style={{ padding: "16px 16px 0" }}>
                <div style={{
                  background: T.ink, color: "#FFF",
                  borderRadius: T.radiusLg, padding: "16px 18px",
                  position: "relative", overflow: "hidden",
                }}>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: "rgba(255,255,255,0.6)" }}>
                    다음 미팅까지
                  </div>
                  <div style={{ marginTop: 4, fontSize: 28, fontWeight: 800, letterSpacing: "-0.03em" }}>
                    {upcoming.days === 0 ? "D-DAY" : `D-${upcoming.days}`}
                  </div>
                  <div style={{ marginTop: 2, fontSize: 12, color: "rgba(255,255,255,0.7)" }}>
                    {upcoming.item.title ?? `미팅 #${upcoming.item.meeting_id}`} · {upcoming.item.schedule.date}
                  </div>
                  <div style={{
                    position: "absolute", right: -20, top: -20,
                    width: 110, height: 110, borderRadius: 999,
                    background: `radial-gradient(circle, ${T.accent} 0%, transparent 70%)`,
                    opacity: 0.5,
                  }} />
                </div>
              </div>
            )}

            <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
              {schedules.map((item) => {
                const typeLabel = MEETING_TYPE_LABELS[item.meeting_type] ?? item.meeting_type;
                return (
                  <div key={item.meeting_id} style={{
                    background: T.surface, border: `1px solid ${T.border}`,
                    borderRadius: T.radiusLg, padding: 16,
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: T.ink, letterSpacing: "-0.01em" }}>
                          {item.title ?? `미팅 #${item.meeting_id}`}
                        </div>
                        <div style={{ marginTop: 4, display: "flex", gap: 5, flexWrap: "wrap" }}>
                          <Pill tone="neutral">{typeLabel}</Pill>
                          {item.schedule.confirmed && <Pill tone="success">일정 확정</Pill>}
                        </div>
                      </div>
                    </div>

                    {item.schedule.date ? (
                      <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 8 }}>
                        {[
                          { icon: "calendar" as const, label: "날짜", val: item.schedule.date },
                          { icon: "clock" as const,    label: "시간", val: item.schedule.time },
                          { icon: "pin" as const,      label: "장소", val: item.schedule.place },
                        ].filter((r) => r.val).map((r) => (
                          <div key={r.label} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <div style={{
                              width: 30, height: 30, borderRadius: 8,
                              background: T.surfaceMuted, color: T.ink, flexShrink: 0,
                              display: "flex", alignItems: "center", justifyContent: "center",
                            }}>
                              <Icon name={r.icon} size={15} stroke={T.ink} />
                            </div>
                            <div style={{ flex: 1 }}>
                              <div style={{
                                fontSize: 10, color: T.inkSoft, fontWeight: 600, letterSpacing: "0.05em",
                              }}>{r.label.toUpperCase()}</div>
                              <div style={{ fontSize: 13, fontWeight: 700, color: T.ink, marginTop: 1 }}>
                                {r.val}
                              </div>
                            </div>
                          </div>
                        ))}

                        {item.chat_room_id && (
                          <button
                            onClick={() => router.push(`/chats/${item.chat_room_id}`)}
                            style={{
                              marginTop: 6, padding: 12, borderRadius: T.radiusMd,
                              background: T.accent, color: T.inkOnAccent, border: 0,
                              fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                            }}
                          >
                            채팅방 입장
                          </button>
                        )}
                      </div>
                    ) : (
                      <div style={{
                        marginTop: 12, padding: "12px 14px",
                        background: T.warningSoft, borderRadius: T.radiusMd,
                        display: "flex", alignItems: "flex-start", gap: 10,
                      }}>
                        <Icon name="clock" size={16} stroke="oklch(0.55 0.13 70)" />
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 700, color: "oklch(0.45 0.13 70)" }}>
                            일정 미정
                          </div>
                          <div style={{ fontSize: 11, color: "oklch(0.55 0.10 70)", marginTop: 2 }}>
                            호스트가 채팅방에서 일정을 정할 예정이에요
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
