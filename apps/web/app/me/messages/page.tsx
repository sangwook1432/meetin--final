"use client";

/**
 * /me/messages — 쪽지함 (수신된 애프터 신청 목록)
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getMyAfterRequests, deleteAfterRequest } from "@/lib/api";
import { AppShell } from "@/components/ui/AppShell";
import type { AfterRequestItem } from "@/types";
import { T, Icon, MoreNavBar } from "@/components/me/MoreAtoms";

function formatDate(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("ko-KR", { month: "short", day: "numeric" });
}

export default function MessagesPage() {
  const router = useRouter();
  const [items, setItems] = useState<AfterRequestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getMyAfterRequests()
      .then((res) => setItems(res.items))
      .catch((e) => setError(e instanceof Error ? e.message : "오류가 발생했습니다"))
      .finally(() => setLoading(false));
  }, []);

  const handleCopy = (phone: string) => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(phone).catch(() => {});
    }
  };

  return (
    <AppShell>
      <div style={{ background: T.bg, minHeight: "100%", fontFamily: T.fontSans, paddingBottom: 40 }}>
        <MoreNavBar title="쪽지함" fallbackHref="/me" />

        {!loading && !error && items.length > 0 && (
          <div style={{
            padding: "14px 16px 0", display: "flex",
            alignItems: "center", justifyContent: "space-between",
          }}>
            <div style={{ fontSize: 12, color: T.inkSoft }}>
              <span style={{ fontWeight: 700, color: T.ink }}>{items.length}</span>개의 애프터 신청
            </div>
          </div>
        )}

        <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
          {loading ? (
            [...Array(3)].map((_, i) => (
              <div key={i} style={{
                height: 100, borderRadius: T.radiusLg, background: T.surfaceMuted,
                animation: "meetin-pulse 1.4s ease-in-out infinite",
              }} />
            ))
          ) : error ? (
            <div style={{
              background: T.warningSoft, border: `1px solid ${T.warning}`,
              borderRadius: T.radiusMd, padding: "12px 14px",
              fontSize: 12.5, color: "oklch(0.45 0.13 70)",
            }}>
              {error}
            </div>
          ) : items.length === 0 ? (
            <div style={{
              background: T.surface, border: `1px solid ${T.border}`,
              borderRadius: T.radiusLg, padding: "40px 22px", textAlign: "center",
            }}>
              <div style={{
                width: 52, height: 52, margin: "0 auto", borderRadius: 999,
                background: T.surfaceMuted, color: T.inkSoft,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <Icon name="mail" size={24} />
              </div>
              <div style={{ marginTop: 12, fontSize: 14, fontWeight: 700, color: T.ink }}>
                아직 쪽지가 없어요
              </div>
              <div style={{ marginTop: 4, fontSize: 12, color: T.inkSoft }}>
                애프터 신청을 받으면 여기서 확인할 수 있어요
              </div>
            </div>
          ) : (
            items.map((item) => (
              <div
                key={item.id}
                onClick={() => router.push(`/profile/${item.sender_id}`)}
                style={{
                  background: T.surface, border: `1px solid ${T.accent}`,
                  borderRadius: T.radiusLg, padding: 14,
                  position: "relative", overflow: "hidden", cursor: "pointer",
                }}
              >
                <button
                  onClick={async (e) => {
                    e.stopPropagation();
                    await deleteAfterRequest(item.id);
                    setItems((prev) => prev.filter((x) => x.id !== item.id));
                  }}
                  aria-label="삭제"
                  style={{
                    position: "absolute", top: 10, right: 10,
                    width: 28, height: 28, borderRadius: 999,
                    background: "transparent", border: 0, cursor: "pointer",
                    color: T.inkSoft, padding: 0,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}
                >
                  <Icon name="x" size={14} />
                </button>

                <div style={{ display: "flex", alignItems: "center", gap: 10, paddingRight: 32 }}>
                  <div style={{
                    width: 38, height: 38, borderRadius: 999,
                    background: T.accentSoft, color: T.accentInk,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 14, fontWeight: 800, flexShrink: 0,
                  }}>{(item.sender_nickname ?? "?").slice(0, 1)}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: T.ink, letterSpacing: "-0.01em" }}>
                      {item.sender_nickname ?? "익명"}님의 애프터
                    </div>
                    <div style={{
                      fontSize: 11, color: T.inkSoft, marginTop: 1, fontFamily: T.fontMono,
                    }}>
                      미팅 #{item.meeting_id} · {formatDate(item.created_at)}
                    </div>
                  </div>
                </div>

                <div style={{
                  marginTop: 11, padding: "10px 12px",
                  background: T.bg, borderRadius: T.radiusMd,
                  fontSize: 13, color: T.ink, lineHeight: 1.55, letterSpacing: "-0.005em",
                  whiteSpace: "pre-wrap",
                }}>{item.message}</div>

                <div style={{
                  marginTop: 10, padding: "9px 12px",
                  border: `1px dashed ${T.borderStrong}`, borderRadius: T.radiusMd,
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                }}>
                  <div>
                    <div style={{
                      fontSize: 10, color: T.inkSoft, fontWeight: 600, letterSpacing: "0.05em",
                    }}>연락처</div>
                    <div style={{
                      fontSize: 13, fontWeight: 700, color: T.ink, fontFamily: T.fontMono, marginTop: 1,
                    }}>
                      {item.sender_phone}
                    </div>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleCopy(item.sender_phone ?? ""); }}
                    style={{
                      padding: "7px 12px", borderRadius: T.radiusSm,
                      background: T.ink, color: "#FFF", border: 0,
                      fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                    }}
                  >
                    복사
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </AppShell>
  );
}
