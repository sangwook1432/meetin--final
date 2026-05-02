"use client";

import { useState, useEffect, useRef } from "react";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

type Step = "phone" | "otp" | "gender";
const STEPS: Step[] = ["phone", "otp", "gender"];

const COOLDOWN_SEC = 60;
const REVEAL_THRESHOLD = 50;

const T = {
  fontSans: '"Pretendard Variable", Pretendard, -apple-system, system-ui, "Helvetica Neue", Helvetica, sans-serif',
  fontDisplay: '"Pretendard Variable", Pretendard, -apple-system, system-ui, sans-serif',
  fontMono: 'ui-monospace, "SF Mono", Menlo, monospace',
  bg: "#FBF8F3",
  surface: "#FFFFFF",
  surfaceMuted: "#F4EFE7",
  border: "#EAE2D5",
  borderStrong: "#DCCFB8",
  ink: "#1B1813",
  inkMid: "#605649",
  inkSoft: "#9A8E7A",
  accent: "oklch(0.68 0.16 32)",
  accentSoft: "oklch(0.94 0.04 32)",
  accentInk: "oklch(0.42 0.14 32)",
  male: "oklch(0.62 0.14 250)",
  maleSoft: "oklch(0.94 0.03 250)",
  female: "oklch(0.7 0.15 10)",
  femaleSoft: "oklch(0.95 0.04 10)",
  success: "oklch(0.62 0.14 155)",
  successSoft: "oklch(0.94 0.05 155)",
  warning: "oklch(0.78 0.14 85)",
  warningSoft: "oklch(0.96 0.05 85)",
  radiusSm: 10,
  radiusMd: 16,
  radiusLg: 22,
  radiusXl: 28,
  shadowSm: "0 1px 2px rgba(60,40,20,0.04), 0 0 0 1px rgba(60,40,20,0.04)",
  shadowMd: "0 2px 6px rgba(60,40,20,0.05), 0 8px 22px rgba(60,40,20,0.06)",
  shadowLg: "0 8px 30px rgba(60,40,20,0.10)",
};

function formatPhone(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 7) return `${d.slice(0, 3)}-${d.slice(3)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
}

type Stats = { male: number; female: number; male_max: number; female_max: number };

export default function PreregisterPage() {
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [gender, setGender] = useState<"MALE" | "FEMALE" | "">("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ tickets: number; gender: "MALE" | "FEMALE"; queueNum: number } | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [existingPreregister, setExistingPreregister] = useState(false);

  const [cooldown, setCooldown] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    fetch(`${BASE}/preregister/stats`)
      .then((r) => r.json())
      .then((d) => setStats(d))
      .catch(() => {});
  }, []);

  useEffect(() => {
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  const startCooldown = () => {
    setCooldown(COOLDOWN_SEC);
    timerRef.current = setInterval(() => {
      setCooldown((c) => {
        if (c <= 1) {
          clearInterval(timerRef.current!);
          return 0;
        }
        return c - 1;
      });
    }, 1000);
  };

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`${BASE}/preregister/send-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail ?? "SMS 발송에 실패했습니다.");
      setExistingPreregister(!!data.existing);
      startCooldown();
      setOtp("");
      setStep("otp");
    } catch (e) {
      setError(e instanceof Error ? e.message : "오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (cooldown > 0) return;
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`${BASE}/preregister/send-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail ?? "SMS 발송에 실패했습니다.");
      setExistingPreregister(!!data.existing);
      startCooldown();
      setOtp("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (otp.replace(/\D/g, "").length !== 6) {
      setError("6자리 인증번호를 입력해주세요.");
      return;
    }
    if (existingPreregister) {
      setLoading(true);
      try {
        const res = await fetch(`${BASE}/preregister/lookup`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone, otp }),
        });
        const data = await res.json();
        if (!res.ok) {
          if (res.status === 429) {
            setStep("phone");
            setOtp("");
            throw new Error(data.detail ?? "인증 시도 횟수를 초과했습니다. 처음부터 다시 시도해주세요.");
          }
          throw new Error(typeof data.detail === "string" ? data.detail : "조회에 실패했습니다.");
        }
        setDone({
          tickets: data.welcome_tickets,
          gender: data.gender as "MALE" | "FEMALE",
          queueNum: data.queue_num,
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "오류가 발생했습니다.");
      } finally {
        setLoading(false);
      }
      return;
    }
    setStep("gender");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!gender) { setError("성별을 선택해주세요."); return; }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${BASE}/preregister`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, otp, gender }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 400) {
          setStep("otp");
          setOtp("");
          throw new Error(data.detail ?? "인증번호가 만료되었습니다. 다시 인증해주세요.");
        }
        if (res.status === 429) {
          setStep("phone");
          setOtp("");
          throw new Error(data.detail ?? "인증 시도 횟수를 초과했습니다. 처음부터 다시 시도해주세요.");
        }
        throw new Error(typeof data.detail === "string" ? data.detail : "오류가 발생했습니다.");
      }
      const queueNum: number = typeof data.queue_num === "number"
        ? data.queue_num
        : (stats?.male ?? 0) + (stats?.female ?? 0) + 1;
      setDone({ tickets: data.welcome_tickets, gender: gender as "MALE" | "FEMALE", queueNum });
    } catch (e) {
      setError(e instanceof Error ? e.message : "오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  // ── 완료 화면 ─────────────────────────────────────────────────────
  if (done) {
    const isF = done.gender === "FEMALE";
    const accent = isF ? T.female : T.male;
    const queueNum = done.queueNum;
    const shareUrl = typeof window !== "undefined" ? window.location.href : "https://meetin.app";
    const handleCopy = () => {
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        navigator.clipboard.writeText(shareUrl).catch(() => {});
      }
    };
    const handleKakao = () => {
      if (typeof navigator !== "undefined" && (navigator as Navigator & { share?: (data: ShareData) => Promise<void> }).share) {
        (navigator as Navigator & { share: (data: ShareData) => Promise<void> })
          .share({ title: "MEETIN.", text: "대학생 미팅 어플 MEETIN. 사전예약 같이 줄 서자!", url: shareUrl })
          .catch(() => {});
      } else {
        handleCopy();
      }
    };
    return (
      <div style={{ minHeight: "100vh", background: T.bg, fontFamily: T.fontSans, color: T.ink }}>
        <div style={{ maxWidth: 480, margin: "0 auto" }}>
          <div style={{ padding: "20px 22px 14px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ fontFamily: T.fontDisplay, fontWeight: 800, fontSize: 19, letterSpacing: "-0.02em" }}>
              MEETIN<span style={{ color: T.accent }}>.</span>
            </div>
            <div style={{ fontSize: 11, color: T.inkSoft, fontWeight: 600, fontFamily: T.fontMono }}>RECEIPT</div>
          </div>

          <div style={{ padding: "32px 22px 8px" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: T.success, letterSpacing: "0.18em", marginBottom: 10, display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 6, height: 6, borderRadius: 999, background: T.success }} />
              CONFIRMED
            </div>
            <h1 style={{ fontFamily: T.fontDisplay, fontSize: 30, lineHeight: 1.15, fontWeight: 800, letterSpacing: "-0.025em", margin: 0 }}>
              사전예약이 완료되었어요.<br />
              <span style={{ background: `linear-gradient(180deg, transparent 60%, ${T.accentSoft} 60%)`, padding: "0 4px" }}>
                {queueNum}번
              </span>이에요.
            </h1>
            <p style={{ fontSize: 13.5, lineHeight: 1.55, color: T.inkMid, marginTop: 12, marginBottom: 0 }}>
              앱 출시 후 사전예약하신 번호로 회원가입 하시면 환영 매칭권을 자동으로 넣어드릴게요. 앱 출시 시 이 번호로 SMS 알림 갈 거예요.
            </p>
          </div>

          <div style={{ padding: "20px 22px 16px" }}>
            <div style={{
              background: T.surface, border: `1px solid ${T.border}`,
              borderRadius: T.radiusLg, position: "relative",
              boxShadow: T.shadowMd, overflow: "hidden",
            }}>
              <div style={{ position: "absolute", left: -8, top: "50%", width: 16, height: 16, borderRadius: 999, background: T.bg }} />
              <div style={{ position: "absolute", right: -8, top: "50%", width: 16, height: 16, borderRadius: 999, background: T.bg }} />

              <div style={{ padding: "18px 20px 14px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: T.inkSoft, letterSpacing: "0.14em" }}>지급 예정</div>
                  <div style={{ fontFamily: T.fontMono, fontSize: 10, color: T.inkSoft }}>앱 출시 시</div>
                </div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                  <span style={{ fontFamily: T.fontDisplay, fontSize: 56, fontWeight: 800, color: accent, letterSpacing: "-0.04em", lineHeight: 1 }}>{done.tickets}</span>
                  <span style={{ fontSize: 16, fontWeight: 700, color: T.ink }}>매칭권</span>
                </div>
                <div style={{ fontSize: 12, color: T.inkMid, marginTop: 6 }}>
                  {isF ? "여학생 · 환영권" : "남학생 · 환영권"}
                </div>
              </div>

              <div style={{ display: "flex", padding: "0 8px" }}>
                {Array.from({ length: 28 }).map((_, i) => (
                  <div key={i} style={{ flex: 1, height: 1, background: i % 2 === 0 ? T.borderStrong : "transparent", margin: "0 1px" }} />
                ))}
              </div>

              <div style={{ padding: "14px 20px 18px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <div>
                  <div style={{ fontSize: 10, color: T.inkSoft, letterSpacing: "0.14em", fontWeight: 700, marginBottom: 4 }}>NUMBER</div>
                  <div style={{ fontFamily: T.fontMono, fontSize: 14, fontWeight: 700, color: T.ink, letterSpacing: "0.05em" }}>#{String(queueNum).padStart(4, "0")}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: T.inkSoft, letterSpacing: "0.14em", fontWeight: 700, marginBottom: 4 }}>STATUS</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: T.success }}>확정 · 알림 ON</div>
                </div>
              </div>
            </div>
          </div>

          <div style={{ padding: "6px 22px 18px" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: T.inkSoft, letterSpacing: "0.14em", marginBottom: 12 }}>출시 전까지</div>
            <div style={{ display: "grid", gap: 10 }}>
              <NextStep n="01" title="친구 미리 모아두기" sub="같이 미팅 나가고 싶은 친구들에게도 공유해보세요." />
              <NextStep n="02" title="대학 메일 확인" sub="가입 시 학생증 혹은 재학증명서를 제출해야돼요. / 미리 준비해두세요." />
              <NextStep n="03" title="알림 받기" sub="출시 D-DAY 한 번만 SMS. 그 외 메시지는 절대 없어요." />
            </div>
          </div>

          <div style={{ padding: "6px 22px 18px" }}>
            <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.radiusLg, padding: "16px 18px" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.ink }}>친구도 같이 줄 세우면 좋아요</div>
              <div style={{ fontSize: 12, color: T.inkMid, marginTop: 4, marginBottom: 12 }}>앱 내에서 휴대폰 번호로 친구 추가 후 미팅 초대 가능해요.</div>
              <div style={{ display: "flex", gap: 8 }}>
                <ShareBtn bg="#FEE500" fg="#000" onClick={handleKakao}>카톡 공유</ShareBtn>
                <ShareBtn bg={T.surface} fg={T.ink} border onClick={handleCopy}>링크 복사</ShareBtn>
              </div>
            </div>
          </div>

          <div style={{ padding: "6px 22px 30px", textAlign: "center", fontSize: 11, color: T.inkSoft, lineHeight: 1.6 }}>
            취소는 <span style={{ fontFamily: T.fontMono }}>support@meetin.app</span>으로 번호 보내주세요
          </div>
        </div>
      </div>
    );
  }

  // ── 마감 상태 화면 (한 쪽 성별 정원 마감 시) ──────────────────────
  if (stats && (stats.male >= stats.male_max || stats.female >= stats.female_max)) {
    const closedIsM = stats.male >= stats.male_max;
    const openSide: "FEMALE" | "MALE" = closedIsM ? "FEMALE" : "MALE";
    const openAccent = closedIsM ? T.female : T.male;
    const openSoft = closedIsM ? T.femaleSoft : T.maleSoft;
    const closedCur = closedIsM ? stats.male : stats.female;
    const closedMax = closedIsM ? stats.male_max : stats.female_max;
    const openCur = closedIsM ? stats.female : stats.male;
    const openMax = closedIsM ? stats.female_max : stats.male_max;
    const shareUrl = typeof window !== "undefined" ? window.location.href : "https://meetin.app";
    const handleShare = () => {
      if (typeof navigator !== "undefined" && (navigator as Navigator & { share?: (data: ShareData) => Promise<void> }).share) {
        (navigator as Navigator & { share: (data: ShareData) => Promise<void> })
          .share({ title: "MEETIN.", text: `${openSide === "FEMALE" ? "여학생" : "남학생"} 자리는 아직 열려있어요. 같이 줄 서자!`, url: shareUrl })
          .catch(() => {});
      } else if (typeof navigator !== "undefined" && navigator.clipboard) {
        navigator.clipboard.writeText(shareUrl).catch(() => {});
      }
    };
    return (
      <div style={{ minHeight: "100vh", background: T.bg, fontFamily: T.fontSans, color: T.ink }}>
        <div style={{ maxWidth: 480, margin: "0 auto" }}>
          <div style={{ padding: "20px 22px 14px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ fontFamily: T.fontDisplay, fontWeight: 800, fontSize: 19, letterSpacing: "-0.02em" }}>
              MEETIN<span style={{ color: T.accent }}>.</span>
            </div>
            <div style={{ fontSize: 11, color: T.inkSoft, fontWeight: 600, fontFamily: T.fontMono }}>STATUS</div>
          </div>

          <div style={{ padding: "24px 22px 8px" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: T.warning, letterSpacing: "0.18em", marginBottom: 10 }}>
              ⚠ {closedIsM ? "남학생" : "여학생"} 자리 마감
            </div>
            <h1 style={{ fontFamily: T.fontDisplay, fontSize: 28, lineHeight: 1.18, fontWeight: 800, letterSpacing: "-0.025em", margin: 0 }}>
              예상보다<br />
              <span style={{ background: `linear-gradient(180deg, transparent 60%, ${T.warningSoft} 60%)`, padding: "0 4px" }}>
                빨리 차버렸어요
              </span>
            </h1>
            <p style={{ fontSize: 13.5, lineHeight: 1.55, color: T.inkMid, marginTop: 12, marginBottom: 0 }}>
              {closedIsM ? "남학생" : "여학생"} {closedMax}명 정원이 모두 마감됐어요. 대기 명단으로 등록해두면 자리가 비는대로 알려드릴게요.
            </p>
          </div>

          <div style={{ padding: "20px 22px 16px" }}>
            <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.radiusLg, overflow: "hidden" }}>
              <div style={{ padding: "16px 18px", borderBottom: `1px solid ${T.border}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: T.ink }}>{closedIsM ? "남학생" : "여학생"}</div>
                  <div style={{ fontSize: 11, fontWeight: 800, color: T.warning, fontFamily: T.fontMono }}>FULL</div>
                </div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                  <span style={{ fontFamily: T.fontDisplay, fontSize: 22, fontWeight: 800, color: T.inkSoft, letterSpacing: "-0.02em" }}>{closedCur}</span>
                  <span style={{ fontSize: 11, color: T.inkSoft }}>/ {closedMax} — 마감</span>
                </div>
                <div style={{ height: 5, background: T.surfaceMuted, borderRadius: 999, overflow: "hidden", marginTop: 8 }}>
                  <div style={{ height: "100%", width: "100%", background: T.inkSoft, borderRadius: 999 }} />
                </div>
              </div>
              <div style={{ padding: "16px 18px", background: openSoft }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: T.ink }}>{closedIsM ? "여학생" : "남학생"}</div>
                  <div style={{ fontSize: 11, fontWeight: 800, color: openAccent, fontFamily: T.fontMono }}>OPEN</div>
                </div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                  <span style={{ fontFamily: T.fontDisplay, fontSize: 22, fontWeight: 800, color: openAccent, letterSpacing: "-0.02em" }}>{openCur}</span>
                  <span style={{ fontSize: 11, color: T.inkSoft }}>/ {openMax} — {Math.max(openMax - openCur, 0)}자리 남음</span>
                </div>
                <div style={{ height: 5, background: "#fff", borderRadius: 999, overflow: "hidden", marginTop: 8 }}>
                  <div style={{ height: "100%", width: `${Math.min((openCur / openMax) * 100, 100)}%`, background: openAccent, borderRadius: 999 }} />
                </div>
              </div>
            </div>
          </div>

          <div style={{ padding: "6px 22px 18px", display: "grid", gap: 10 }}>
            <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.radiusLg, padding: "18px 18px" }}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 6 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: T.ink }}>대기 명단 등록</div>
                <div style={{ fontSize: 11, color: T.inkSoft }}>혜택은 동일</div>
              </div>
              <div style={{ fontSize: 12, color: T.inkMid, marginBottom: 14, lineHeight: 1.5 }}>
                자리가 비면 SMS로 알려드려요. 대기자도 출시일 매칭권 받아요.
              </div>
              <CTAButton type="button" onClick={() => { window.location.href = "mailto:support@meetin.app?subject=대기 명단 등록 요청"; }}>
                대기 명단 등록
              </CTAButton>
            </div>

            <div style={{ background: openSoft, border: `1px solid ${openAccent}`, borderRadius: T.radiusLg, padding: "18px 18px" }}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 6 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: T.ink }}>{openSide === "FEMALE" ? "여학생" : "남학생"} 친구가 있다면?</div>
                <div style={{ fontSize: 11, fontWeight: 700, color: openAccent }}>아직 가능</div>
              </div>
              <div style={{ fontSize: 12, color: T.inkMid, marginBottom: 14, lineHeight: 1.5 }}>
                {openSide === "FEMALE" ? "여학생" : "남학생"} 자리는 아직 열려있어요. 친구한테 링크 공유해주세요 — 그래야 매칭이 성사돼요!
              </div>
              <button
                type="button"
                onClick={handleShare}
                style={{
                  width: "100%", background: T.surface, color: T.ink,
                  border: `1.5px solid ${T.borderStrong}`, borderRadius: T.radiusLg,
                  padding: "14px 20px", fontSize: 14, fontWeight: 700,
                  cursor: "pointer", fontFamily: T.fontSans,
                }}
              >
                친구한테 링크 공유 →
              </button>
            </div>
          </div>

          <div style={{ padding: "6px 22px 30px", textAlign: "center", fontSize: 11, color: T.inkSoft, lineHeight: 1.6 }}>
            시즌 2 사전예약은 출시 후 다시 열어요<br />
            <span style={{ fontFamily: T.fontMono }}>support@meetin.app</span>
          </div>
        </div>
      </div>
    );
  }

  const idx = STEPS.indexOf(step);
  const showLive = !!stats && stats.male >= REVEAL_THRESHOLD && stats.female >= REVEAL_THRESHOLD;
  const fPct = stats ? (stats.female / stats.female_max) * 100 : 0;
  const mPct = stats ? (stats.male / stats.male_max) * 100 : 0;

  return (
    <div style={{ minHeight: "100vh", background: T.bg, fontFamily: T.fontSans, color: T.ink }}>
      <div style={{ maxWidth: 480, margin: "0 auto" }}>
        {/* HERO */}
        <div style={{ padding: "20px 22px 14px", position: "relative" }}>
          <div style={{ display: "flex", alignItems: "center", marginBottom: 22 }}>
            <div style={{ fontFamily: T.fontDisplay, fontWeight: 800, fontSize: 19, letterSpacing: "-0.02em" }}>
              MEETIN<span style={{ color: T.accent }}>.</span>
            </div>
          </div>

          <div style={{ fontSize: 11, fontWeight: 700, color: T.accentInk, letterSpacing: "0.18em", marginBottom: 10 }}>
            대학생 미팅 어플 · TEAM × TEAM
          </div>
          <h1 style={{ fontFamily: T.fontDisplay, fontSize: 30, lineHeight: 1.15, fontWeight: 800, letterSpacing: "-0.025em", margin: 0 }}>
            우리 과 친구들이랑<br />
            <span style={{ background: `linear-gradient(180deg, transparent 60%, ${T.accentSoft} 60%)`, padding: "0 4px" }}>
              저쪽 학교 만나러
            </span> 갈래?
          </h1>
          <p style={{ fontSize: 13.5, lineHeight: 1.55, color: T.inkMid, marginTop: 12, marginBottom: 0 }}>
            카톡방 돌리고 일정 맞추고… 다 우리가 할게요. 너희는 그냥 <b style={{ color: T.ink }}>"콜"</b>만 외쳐.
          </p>
        </div>

        {/* POLAROID strip */}
        <div style={{ padding: "4px 22px 18px", display: "flex", gap: 10, overflow: "hidden" }}>
          {[
            { rot: -3.5, school: "연세대", major: "경영 4명", scene: "cafe" as const, tag: "wed 7pm" },
            { rot: 2.5, school: "고려대", major: "통계 4명", scene: "park" as const, tag: "fri 6pm" },
            { rot: -1.5, school: "한양대", major: "컴공 3명", scene: "pub" as const, tag: "sat 8pm" },
          ].map((p, i) => (
            <div key={i} style={{
              flex: 1, background: "#fff", padding: 6, paddingBottom: 32,
              boxShadow: T.shadowMd, transform: `rotate(${p.rot}deg)`,
              borderRadius: 3, position: "relative", minWidth: 0,
            }}>
              <PolaroidScene scene={p.scene} />
              <div style={{ position: "absolute", bottom: 8, left: 8, right: 8, display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <div style={{ fontSize: 9.5, color: T.ink, fontFamily: T.fontMono, fontWeight: 700, letterSpacing: "-0.02em" }}>{p.school}</div>
                <div style={{ fontSize: 8.5, color: T.inkSoft, fontFamily: T.fontMono }}>{p.tag}</div>
              </div>
              <div style={{ position: "absolute", bottom: 18, left: 8, fontSize: 8.5, color: T.inkSoft }}>{p.major}</div>
            </div>
          ))}
        </div>

        {/* LIVE 신청자 현황 — 남녀 모두 50명 이상일 때만 노출 */}
        {showLive && (
          <div style={{ padding: "0 22px 14px" }}>
            <div style={{
              display: "flex", alignItems: "center", gap: 10,
              background: T.surface, border: `1px solid ${T.borderStrong}`,
              borderRadius: 999, padding: "10px 14px", boxShadow: T.shadowSm,
            }}>
              <div style={{ width: 8, height: 8, borderRadius: 999, background: T.accent, boxShadow: `0 0 0 3px ${T.accentSoft}` }} />
              <div style={{ fontSize: 12.5, fontWeight: 600, color: T.ink, flex: 1 }}>
                지금 <b style={{ color: T.accentInk }}>{stats!.female + stats!.male}명</b>이 줄 서고 있어요
              </div>
              <div style={{ fontSize: 11, color: T.inkSoft, fontFamily: T.fontMono }}>LIVE</div>
            </div>
          </div>
        )}

        {/* 남녀 신청 현황 — 남녀 모두 50명 이상일 때만 노출 */}
        {showLive && (
          <div style={{ padding: "0 22px 16px" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: T.inkSoft, letterSpacing: "0.14em", marginBottom: 10 }}>선착순 정원</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <CapCard label="여학생" cur={stats!.female} max={stats!.female_max} pct={fPct} accent={T.female} soft={T.femaleSoft} />
              <CapCard label="남학생" cur={stats!.male} max={stats!.male_max} pct={mPct} accent={T.male} soft={T.maleSoft} />
            </div>
          </div>
        )}

        {/* PERKS */}
        <div style={{ padding: "6px 22px 18px" }}>
          <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.radiusLg, padding: "16px 18px" }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: T.inkSoft, letterSpacing: "0.14em" }}>사전예약 혜택</div>
              <div style={{ fontFamily: T.fontMono, fontSize: 10, color: T.inkSoft }}>회원가입 시 자동 지급</div>
            </div>
            <div style={{ display: "grid", gap: 10 }}>
              <PerkRow dot={T.female} label="여학생" sub="환영 매칭권" right="매칭권 ×2" />
              <div style={{ height: 1, background: T.border }} />
              <PerkRow dot={T.male} label="남학생" sub="환영 매칭권" right="매칭권 ×1" />
            </div>
          </div>
        </div>

        {/* FORM */}
        <div style={{ padding: "0 22px 24px" }}>
          {/* step indicator */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 14 }}>
            {STEPS.map((s, i) => (
              <div key={s} style={{
                height: 4, flex: 1,
                background: i <= idx ? T.accent : T.border,
                borderRadius: 999, transition: "all 220ms",
              }} />
            ))}
            <div style={{ fontSize: 11, color: T.inkSoft, fontFamily: T.fontMono, marginLeft: 6 }}>
              {idx + 1}/{STEPS.length}
            </div>
          </div>

          <div style={{
            background: T.surface, border: `1px solid ${T.border}`,
            borderRadius: T.radiusXl, padding: 20, boxShadow: T.shadowMd,
          }}>
            {/* ── 1단계: 전화번호 ─────────────────────────── */}
            {step === "phone" && (
              <form onSubmit={handleSendOtp}>
                <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: "-0.02em", marginBottom: 4 }}>휴대폰 번호</div>
                <div style={{ fontSize: 12.5, color: T.inkMid, marginBottom: 16 }}>
                  학교 인증은 가입할 때 받을게요. 지금은 출시 알림용.
                </div>
                <Field label="번호" mono>
                  <input
                    type="tel"
                    inputMode="numeric"
                    placeholder="010-0000-0000"
                    value={formatPhone(phone)}
                    onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 11))}
                    style={{
                      flex: 1, border: "none", outline: "none", background: "transparent",
                      fontSize: 16, fontWeight: 600, color: T.ink,
                      fontFamily: T.fontMono, letterSpacing: "0.04em", minWidth: 0,
                    }}
                    required
                  />
                </Field>
                {error && <ErrorText>{error}</ErrorText>}
                <CTAButton type="submit" disabled={loading || phone.length < 10}>
                  {loading ? "발송 중..." : "인증번호 받기"}
                </CTAButton>
                <div style={{ display: "flex", gap: 14, marginTop: 14, fontSize: 11.5, color: T.inkSoft, flexWrap: "wrap" }}>
                  <span>✓ 스팸 없음</span>
                  <span>✓ 사전예약 외 미사용</span>
                  <span>✓ 언제든 거절</span>
                </div>
              </form>
            )}

            {/* ── 2단계: OTP ─────────────────────────────── */}
            {step === "otp" && (
              <form onSubmit={handleVerifyOtp}>
                <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: "-0.02em", marginBottom: 4 }}>인증번호</div>
                <div style={{ fontSize: 12.5, color: T.inkMid, marginBottom: 16 }}>
                  <span style={{ fontWeight: 700, color: T.ink }}>{formatPhone(phone)}</span>로 보낸 6자리
                </div>
                <div style={{ marginBottom: 14 }}>
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="000000"
                    maxLength={6}
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    style={{
                      width: "100%", textAlign: "center",
                      background: T.surfaceMuted, border: `1.5px solid ${T.borderStrong}`,
                      borderRadius: T.radiusMd, padding: "14px 16px",
                      fontFamily: T.fontMono, fontSize: 22, fontWeight: 800,
                      color: T.ink, letterSpacing: "0.4em", outline: "none",
                    }}
                    autoFocus
                    required
                  />
                </div>
                {error && <ErrorText>{error}</ErrorText>}
                <CTAButton type="submit" disabled={loading || otp.length < 6}>확인</CTAButton>
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 14, fontSize: 12 }}>
                  <button
                    type="button"
                    onClick={() => { setStep("phone"); setError(null); }}
                    style={{ background: "transparent", border: "none", color: T.inkSoft, cursor: "pointer", padding: 0, fontSize: 12 }}
                  >
                    번호 다시 입력
                  </button>
                  <button
                    type="button"
                    onClick={handleResend}
                    disabled={cooldown > 0 || loading}
                    style={{
                      background: "transparent", border: "none",
                      color: cooldown > 0 ? T.inkSoft : T.accentInk,
                      fontWeight: 700, cursor: cooldown > 0 ? "default" : "pointer",
                      padding: 0, fontSize: 12,
                    }}
                  >
                    {cooldown > 0 ? `재발송 (${cooldown}초)` : "재발송"}
                  </button>
                </div>
              </form>
            )}

            {/* ── 3단계: 성별 ────────────────────────────── */}
            {step === "gender" && (
              <form onSubmit={handleSubmit}>
                <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: "-0.02em", marginBottom: 4 }}>성별</div>
                <div style={{ fontSize: 12.5, color: T.inkMid, marginBottom: 16 }}>
                  성별 오기입 시 회원가입 때 혜택 지급이 불가할 수 있어요
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
                  {(["FEMALE", "MALE"] as const).map((g) => {
                    const isF = g === "FEMALE";
                    const cur = stats ? (isF ? stats.female : stats.male) : 0;
                    const max = stats ? (isF ? stats.female_max : stats.male_max) : 0;
                    const accent = isF ? T.female : T.male;
                    const soft = isF ? T.femaleSoft : T.maleSoft;
                    const isFull = stats ? cur >= max : false;
                    const selected = gender === g;
                    return (
                      <button
                        key={g}
                        type="button"
                        onClick={() => !isFull && setGender(g)}
                        disabled={isFull}
                        style={{
                          background: selected ? soft : T.surface,
                          border: `2px solid ${selected ? accent : T.border}`,
                          borderRadius: T.radiusLg, padding: 16, textAlign: "center",
                          position: "relative", cursor: isFull ? "not-allowed" : "pointer",
                          opacity: isFull ? 0.4 : 1, fontFamily: T.fontSans,
                        }}
                      >
                        <div style={{ fontSize: 13, fontWeight: 700, color: selected ? accent : T.ink, marginBottom: 4 }}>
                          {isF ? "여자" : "남자"}
                        </div>
                        {showLive && (
                          <div style={{ fontFamily: T.fontMono, fontSize: 10, color: T.inkSoft }}>
                            {cur}/{max}
                          </div>
                        )}
                        {isFull && <div style={{ fontSize: 10, color: T.accent, marginTop: 2, fontWeight: 700 }}>마감</div>}
                        {selected && (
                          <div style={{
                            position: "absolute", top: 10, right: 10, width: 18, height: 18, borderRadius: 999,
                            background: accent, color: "#fff", fontSize: 11, fontWeight: 800,
                            display: "flex", alignItems: "center", justifyContent: "center",
                          }}>✓</div>
                        )}
                      </button>
                    );
                  })}
                </div>
                {error && <ErrorText>{error}</ErrorText>}
                <CTAButton type="submit" disabled={loading || !gender}>
                  {loading ? "등록 중..." : "사전예약 신청하기"}
                </CTAButton>
                <button
                  type="button"
                  onClick={() => { setStep("otp"); setError(null); }}
                  style={{
                    width: "100%", marginTop: 12, background: "transparent", border: "none",
                    color: T.inkSoft, fontSize: 12, cursor: "pointer", padding: 0,
                  }}
                >
                  이전으로
                </button>
              </form>
            )}
          </div>
        </div>

        {/* trust footer */}
        <div style={{ padding: "0 22px 30px", textAlign: "center", fontSize: 11, color: T.inkSoft, lineHeight: 1.6 }}>
          학교 인증된 사람만 매칭에 참여해요<br />
          <span style={{ fontFamily: T.fontMono }}>support@meetin.app</span>
        </div>
      </div>
    </div>
  );
}

/* ──────────────────── helpers ──────────────────── */

function CapCard({ label, cur, max, pct, accent, soft }: {
  label: string; cur: number; max: number; pct: number; accent: string; soft: string;
}) {
  const remaining = Math.max(max - cur, 0);
  const hot = pct >= 70;
  return (
    <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.radiusLg, padding: 14 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: T.ink }}>{label}</span>
        <span style={{
          fontSize: 10, fontWeight: 700,
          color: hot ? T.accent : T.success,
          background: hot ? T.accentSoft : T.successSoft,
          padding: "2px 7px", borderRadius: 999,
        }}>
          {hot ? "🔥 마감 임박" : "모집 중"}
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginTop: 6 }}>
        <span style={{ fontFamily: T.fontDisplay, fontSize: 24, fontWeight: 800, color: accent, letterSpacing: "-0.02em" }}>{cur}</span>
        <span style={{ fontSize: 11, color: T.inkSoft }}>/ {max}</span>
      </div>
      <div style={{ height: 5, background: soft, borderRadius: 999, overflow: "hidden", marginTop: 8 }}>
        <div style={{ height: "100%", width: `${Math.min(pct, 100)}%`, background: accent, borderRadius: 999 }} />
      </div>
      <div style={{ fontSize: 10.5, color: T.inkSoft, marginTop: 6 }}>{remaining}자리 남음</div>
    </div>
  );
}

function PerkRow({ dot, label, sub, right }: { dot: string; label: string; sub: string; right: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <div style={{ width: 8, height: 8, borderRadius: 999, background: dot, flexShrink: 0 }} />
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: T.ink }}>{label}</div>
        <div style={{ fontSize: 11.5, color: T.inkSoft }}>{sub}</div>
      </div>
      <div style={{ fontSize: 12, fontWeight: 800, color: T.accentInk, fontFamily: T.fontMono }}>{right}</div>
    </div>
  );
}

function Field({ label, mono, children }: { label: string; mono?: boolean; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: T.inkSoft, letterSpacing: "0.1em", marginBottom: 6 }}>{label}</div>
      <div style={{
        display: "flex", alignItems: "center",
        background: T.surfaceMuted, borderRadius: T.radiusMd,
        padding: "14px 16px", border: `1.5px solid ${T.borderStrong}`,
        fontFamily: mono ? T.fontMono : T.fontSans,
      }}>
        {children}
      </div>
    </div>
  );
}

function CTAButton({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { disabled, style, ...rest } = props;
  return (
    <button
      {...rest}
      disabled={disabled}
      style={{
        width: "100%",
        background: T.ink, color: T.bg,
        border: "none", borderRadius: T.radiusLg,
        padding: "16px 20px",
        fontSize: 15, fontWeight: 800, letterSpacing: "-0.01em",
        fontFamily: T.fontSans,
        cursor: disabled ? "not-allowed" : "pointer",
        boxShadow: T.shadowMd,
        opacity: disabled ? 0.4 : 1,
        transition: "opacity 150ms",
        ...style,
      }}
    >
      {children} →
    </button>
  );
}

function NextStep({ n, title, sub }: { n: string; title: string; sub: string }) {
  return (
    <div style={{
      display: "grid", gridTemplateColumns: "36px 1fr", gap: 12,
      padding: "14px 16px",
      background: T.surface, border: `1px solid ${T.border}`,
      borderRadius: T.radiusMd,
    }}>
      <div style={{
        fontFamily: T.fontMono, fontSize: 11, fontWeight: 800,
        color: T.accent, letterSpacing: "0.05em", paddingTop: 2,
      }}>{n}</div>
      <div>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: T.ink }}>{title}</div>
        <div style={{ fontSize: 12, color: T.inkMid, marginTop: 3, lineHeight: 1.45 }}>{sub}</div>
      </div>
    </div>
  );
}

function ShareBtn({ bg, fg, border, onClick, children }: {
  bg: string; fg: string; border?: boolean; onClick?: () => void; children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flex: 1, background: bg, color: fg,
        border: border ? `1px solid ${T.borderStrong}` : "none",
        borderRadius: T.radiusMd, padding: "12px 14px",
        fontSize: 13, fontWeight: 700, letterSpacing: "-0.01em",
        cursor: "pointer", fontFamily: T.fontSans,
      }}
    >
      {children}
    </button>
  );
}

function ErrorText({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 12, color: "oklch(0.55 0.18 25)",
      background: "oklch(0.96 0.04 25)",
      border: `1px solid oklch(0.85 0.08 25)`,
      borderRadius: T.radiusMd, padding: "10px 12px", marginBottom: 12,
    }}>
      {children}
    </div>
  );
}

/* ──────────────────── polaroid scenes ──────────────────── */

function PolaroidScene({ scene }: { scene: "cafe" | "park" | "pub" }) {
  if (scene === "cafe") {
    return (
      <svg viewBox="0 0 100 100" style={{ display: "block", width: "100%", aspectRatio: "1", borderRadius: 2, background: "#E9DECC" }}>
        <rect x="0" y="0" width="100" height="58" fill="#F0E6D4" />
        <rect x="0" y="58" width="100" height="42" fill="#D4C4A8" />
        <line x1="0" y1="20" x2="100" y2="20" stroke="#C9B996" strokeWidth="0.4" />
        <line x1="33" y1="0" x2="33" y2="58" stroke="#C9B996" strokeWidth="0.4" />
        <line x1="66" y1="0" x2="66" y2="58" stroke="#C9B996" strokeWidth="0.4" />
        <rect x="0" y="58" width="100" height="3" fill="#8B6F47" />
        <ellipse cx="22" cy="74" rx="9" ry="3" fill="#3E2A1A" />
        <ellipse cx="22" cy="73" rx="8" ry="2.5" fill="#6B4A2E" />
        <ellipse cx="50" cy="78" rx="11" ry="3.5" fill="#fff" stroke="#C9B996" strokeWidth="0.5" />
        <ellipse cx="50" cy="77.5" rx="6" ry="2" fill="#E5C9A0" />
        <ellipse cx="78" cy="74" rx="9" ry="3" fill="#3E2A1A" />
        <ellipse cx="78" cy="73" rx="8" ry="2.5" fill="#6B4A2E" />
        <path d="M 20 64 Q 22 60, 20 56" stroke="#fff" strokeWidth="0.8" fill="none" opacity="0.6" />
        <path d="M 24 64 Q 26 61, 24 57" stroke="#fff" strokeWidth="0.8" fill="none" opacity="0.4" />
        <path d="M 76 64 Q 78 60, 76 56" stroke="#fff" strokeWidth="0.8" fill="none" opacity="0.6" />
        <line x1="50" y1="0" x2="50" y2="14" stroke="#8B6F47" strokeWidth="0.5" />
        <ellipse cx="50" cy="16" rx="6" ry="3" fill="#E8B968" />
        <ellipse cx="50" cy="15" rx="5" ry="2" fill="#F5D38C" />
      </svg>
    );
  }
  if (scene === "park") {
    return (
      <svg viewBox="0 0 100 100" style={{ display: "block", width: "100%", aspectRatio: "1", borderRadius: 2, background: "#D9CFB7" }}>
        <rect x="0" y="0" width="100" height="55" fill="#E5D9BD" />
        <circle cx="78" cy="22" r="9" fill="#F5C46B" opacity="0.85" />
        <circle cx="78" cy="22" r="6" fill="#F5D38C" />
        <ellipse cx="18" cy="48" rx="14" ry="18" fill="#8FA572" />
        <rect x="16" y="55" width="3" height="12" fill="#5C4632" />
        <ellipse cx="42" cy="44" rx="11" ry="14" fill="#7A9061" />
        <rect x="40" y="50" width="2.5" height="10" fill="#5C4632" />
        <rect x="0" y="62" width="100" height="38" fill="#A8B984" />
        <rect x="30" y="72" width="50" height="22" fill="#C75948" transform="rotate(-3 55 83)" />
        <g transform="rotate(-3 55 83)" opacity="0.4">
          <line x1="40" y1="72" x2="40" y2="94" stroke="#fff" strokeWidth="0.4" />
          <line x1="50" y1="72" x2="50" y2="94" stroke="#fff" strokeWidth="0.4" />
          <line x1="60" y1="72" x2="60" y2="94" stroke="#fff" strokeWidth="0.4" />
          <line x1="70" y1="72" x2="70" y2="94" stroke="#fff" strokeWidth="0.4" />
          <line x1="30" y1="80" x2="80" y2="80" stroke="#fff" strokeWidth="0.4" />
          <line x1="30" y1="87" x2="80" y2="87" stroke="#fff" strokeWidth="0.4" />
        </g>
        <circle cx="42" cy="80" r="3" fill="#F5D38C" />
        <circle cx="55" cy="84" r="2.5" fill="#fff" />
        <rect x="62" y="78" width="6" height="4" rx="1" fill="#7A9061" />
      </svg>
    );
  }
  // pub
  return (
    <svg viewBox="0 0 100 100" style={{ display: "block", width: "100%", aspectRatio: "1", borderRadius: 2, background: "#3E2A1A" }}>
      <rect x="0" y="0" width="100" height="62" fill="#5C3F26" />
      <line x1="0" y1="0" x2="100" y2="0" stroke="#2E1F12" strokeWidth="0.6" />
      {[15, 35, 55, 75].map((x, i) => (
        <g key={i}>
          <line x1={x} y1="0" x2={x} y2={6 + (i % 2) * 3} stroke="#2E1F12" strokeWidth="0.4" />
          <circle cx={x} cy={9 + (i % 2) * 3} r="3" fill="#F5C46B" />
          <circle cx={x} cy={9 + (i % 2) * 3} r="5" fill="#F5C46B" opacity="0.25" />
        </g>
      ))}
      <rect x="0" y="30" width="100" height="2" fill="#3E2A1A" />
      {[10, 20, 28, 38, 48, 58, 68, 78, 88].map((x, i) => (
        <rect key={i} x={x} y={20} width="3" height="10" fill={["#3E2A1A", "#1F1208", "#5C3F26", "#2E1F12"][i % 4]} rx="0.5" />
      ))}
      <rect x="0" y="62" width="100" height="38" fill="#1F1208" />
      <ellipse cx="25" cy="78" rx="6" ry="2" fill="#F5C46B" opacity="0.85" />
      <rect x="20" y="72" width="10" height="7" fill="#F5C46B" opacity="0.3" />
      <rect x="20" y="72" width="10" height="7" fill="none" stroke="#F5D38C" strokeWidth="0.4" />
      <ellipse cx="25" cy="72" rx="5" ry="1.5" fill="#F5D38C" opacity="0.6" />
      <ellipse cx="50" cy="80" rx="7" ry="2.5" fill="#C75948" opacity="0.8" />
      <rect x="44" y="73" width="12" height="8" fill="#C75948" opacity="0.4" />
      <rect x="44" y="73" width="12" height="8" fill="none" stroke="#E8B968" strokeWidth="0.4" />
      <ellipse cx="78" cy="78" rx="6" ry="2" fill="#F5C46B" opacity="0.85" />
      <rect x="73" y="72" width="10" height="7" fill="#F5C46B" opacity="0.3" />
      <rect x="73" y="72" width="10" height="7" fill="none" stroke="#F5D38C" strokeWidth="0.4" />
    </svg>
  );
}
