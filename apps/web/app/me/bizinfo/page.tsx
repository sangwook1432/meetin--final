"use client";

import Link from "next/link";
import { AppShell } from "@/components/ui/AppShell";
import { T, Icon, MoreNavBar } from "@/components/me/MoreAtoms";

const ROWS: { k: string; v: string; tail?: string; mono?: boolean }[] = [
  { k: "상호명", v: "MEETIN." },
  { k: "대표자", v: "전상욱" },
  { k: "사업자등록번호", v: "420-05-03754", tail: "간이과세자" },
  { k: "통신판매업신고번호", v: "2026-고양일산서-0435" },
  { k: "사업장 주소", v: "경기도 고양시 일산서구 대산로 106\n109동 1401호 (주엽동, 강선마을)" },
  { k: "유선번호", v: "010-4544-7834", mono: true },
  { k: "이메일", v: "adamjeon2003@gmail.com", mono: true },
];

export default function BizInfoPage() {
  return (
    <AppShell>
      <div style={{ background: T.bg, minHeight: "100%", fontFamily: T.fontSans, paddingBottom: 40 }}>
        <MoreNavBar title="사업자 정보" fallbackHref="/me" />

        <div style={{ padding: "18px 16px" }}>
          <div style={{
            background: T.ink, color: "#FFF",
            borderRadius: T.radiusLg, padding: "18px 20px",
            fontFamily: T.fontMono, letterSpacing: "0.06em",
          }}>
            <div style={{ fontSize: 10, opacity: 0.55 }}>BUSINESS REGISTRATION</div>
            <div style={{
              marginTop: 6, fontSize: 22, fontWeight: 800,
              fontFamily: T.fontSans, letterSpacing: "-0.03em",
            }}>
              MEETIN<span style={{ color: T.accent }}>.</span>
            </div>
            <div style={{ marginTop: 4, fontSize: 11, opacity: 0.6 }}>
              대학생 미팅 주선 디지털 서비스
            </div>
          </div>

          <div style={{
            marginTop: 14, background: T.surface, border: `1px solid ${T.border}`,
            borderRadius: T.radiusLg, overflow: "hidden",
          }}>
            {ROWS.map((r, i) => (
              <div key={r.k} style={{
                padding: "12px 14px",
                borderTop: i === 0 ? "none" : `1px solid ${T.border}`,
              }}>
                <div style={{
                  fontSize: 10, fontWeight: 700, color: T.inkSoft,
                  letterSpacing: "0.06em", textTransform: "uppercase",
                }}>{r.k}</div>
                <div style={{
                  marginTop: 3, fontSize: 13,
                  fontWeight: r.mono ? 700 : 600, color: T.ink,
                  letterSpacing: r.mono ? "0.01em" : "-0.005em",
                  fontFamily: r.mono ? T.fontMono : T.fontSans,
                  whiteSpace: "pre-line", lineHeight: 1.5,
                }}>
                  {r.v}
                  {r.tail && (
                    <span style={{
                      marginLeft: 6, fontSize: 11, color: T.inkSoft, fontWeight: 600,
                    }}>({r.tail})</span>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div style={{
            marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8,
          }}>
            <Link href="/terms" style={{
              padding: 12, borderRadius: T.radiusMd,
              background: T.surface, border: `1px solid ${T.border}`,
              color: T.ink, fontSize: 12, fontWeight: 700,
              fontFamily: "inherit", textDecoration: "none",
              display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
            }}>
              <Icon name="doc" size={14} stroke={T.ink} />
              이용약관
            </Link>
            <Link href="/privacy" style={{
              padding: 12, borderRadius: T.radiusMd,
              background: T.surface, border: `1px solid ${T.border}`,
              color: T.ink, fontSize: 12, fontWeight: 700,
              fontFamily: "inherit", textDecoration: "none",
              display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
            }}>
              <Icon name="shield" size={14} stroke={T.ink} />
              개인정보처리방침
            </Link>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
