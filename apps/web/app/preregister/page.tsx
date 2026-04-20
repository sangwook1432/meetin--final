"use client";

import { useState, useEffect, useRef } from "react";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

type Step = "phone" | "otp" | "gender";
const STEPS: Step[] = ["phone", "otp", "gender"];

const COOLDOWN_SEC = 60;

function getUrgencyLabel(count: number, max: number) {
  if (count >= max) return { text: "마감", cls: "text-red-400" };
  const rate = count / max;
  if (rate >= 0.7) return { text: "🔥 빠르게 마감 중", cls: "text-orange-400" };
  if (rate >= 0.4) return { text: "대기 중", cls: "text-yellow-400" };
  return { text: "모집 중", cls: "text-green-400" };
}

function formatPhone(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 7) return `${d.slice(0, 3)}-${d.slice(3)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
}

export default function PreregisterPage() {
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [gender, setGender] = useState<"MALE" | "FEMALE" | "">("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ tickets: number; gender: "MALE" | "FEMALE" } | null>(null);
  const [stats, setStats] = useState<{ male: number; female: number; male_max: number; female_max: number } | null>(null);

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

  // ── 1단계: OTP 발송 ───────────────────────────────────────────────
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
      startCooldown();
      setOtp("");
      setStep("otp");
    } catch (e) {
      setError(e instanceof Error ? e.message : "오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  // ── 2단계: OTP 재발송 ─────────────────────────────────────────────
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
      startCooldown();
      setOtp("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  // ── 2단계: OTP 확인 → 3단계로 ────────────────────────────────────
  const handleVerifyOtp = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (otp.replace(/\D/g, "").length !== 6) {
      setError("6자리 인증번호를 입력해주세요.");
      return;
    }
    setStep("gender");
  };

  // ── 3단계: 최종 등록 ──────────────────────────────────────────────
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
      setDone({ tickets: data.welcome_tickets, gender: gender as "MALE" | "FEMALE" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  // ── 완료 화면 ─────────────────────────────────────────────────────
  if (done) {
    return (
      <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-[#080810] px-4">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-40 -right-40 h-[500px] w-[500px] rounded-full bg-blue-600/20 blur-[120px]" />
          <div className="absolute -bottom-40 -left-40 h-[400px] w-[400px] rounded-full bg-purple-600/15 blur-[120px]" />
        </div>
        <div className="relative w-full max-w-sm rounded-3xl border border-white/10 bg-white/5 p-8 text-center backdrop-blur-xl">
          <div className="mb-4 text-5xl">{done.gender === "FEMALE" ? "🎀" : "🎯"}</div>
          <h1 className="text-2xl font-black text-white">사전예약 완료!</h1>
          <p className="mt-3 text-sm leading-relaxed text-white/60">
            앱 출시와 동시에<br />
            <span className="font-bold text-blue-400">매칭권 {done.tickets}개</span>가 자동으로 지급됩니다.
          </p>
          {done.gender === "FEMALE" && (
            <p className="mt-1 text-xs font-medium text-pink-400">+ 우선 매칭 혜택도 드려요 ✨</p>
          )}
          <div className="mt-6 rounded-2xl border border-blue-500/20 bg-blue-500/10 px-4 py-4">
            <p className="text-xs font-medium text-blue-400">출시 알림을 받으려면</p>
            <p className="mt-1 text-sm font-bold text-white">가입하신 번호로 문자를 드릴게요 📱</p>
          </div>
        </div>
      </div>
    );
  }

  const femaleLabel = stats ? getUrgencyLabel(stats.female, stats.female_max) : null;
  const maleLabel   = stats ? getUrgencyLabel(stats.male,   stats.male_max)   : null;
  const currentStepIdx = STEPS.indexOf(step);

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#080810] px-4 pb-16">
      {/* 배경 글로우 */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 right-0 h-[600px] w-[600px] rounded-full bg-blue-600/15 blur-[120px]" />
        <div className="absolute bottom-0 -left-40 h-[500px] w-[500px] rounded-full bg-purple-600/10 blur-[120px]" />
      </div>

      <div className="relative mx-auto w-full max-w-sm pt-12">

        {/* ── 헤더 ───────────────────────────────────────────────── */}
        <div className="mb-8 text-center">
          <p className="mb-3 text-xs font-bold tracking-[0.35em] text-blue-400">MEETIN.</p>
          <h1 className="text-[1.85rem] font-black leading-tight tracking-tight text-white">
            같은 대학생끼리<br />팀 미팅 매칭
          </h1>
          <div className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/10 px-4 py-1.5 backdrop-blur-md">
            <span className="text-xs font-bold text-white">✦ 선착순 150명만 무료 매칭권 제공</span>
          </div>
        </div>

        {/* ── 정원 현황 ──────────────────────────────────────────── */}
        <div className="mb-4 grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-pink-500/20 bg-pink-500/10 p-4 text-center backdrop-blur-md">
            <p className="text-xl font-black text-pink-400">
              {stats ? stats.female : "—"}
              <span className="text-xs font-semibold text-pink-400/60"> / {stats?.female_max ?? 150}</span>
            </p>
            <p className="mt-0.5 text-xs font-semibold text-pink-300">여자</p>
            {femaleLabel && <p className={`mt-1 text-xs font-bold ${femaleLabel.cls}`}>{femaleLabel.text}</p>}
            {stats && (
              <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-pink-500/20">
                <div className="h-1 rounded-full bg-pink-400 transition-all"
                  style={{ width: `${Math.min((stats.female / stats.female_max) * 100, 100)}%` }} />
              </div>
            )}
          </div>
          <div className="rounded-2xl border border-blue-500/20 bg-blue-500/10 p-4 text-center backdrop-blur-md">
            <p className="text-xl font-black text-blue-400">
              {stats ? stats.male : "—"}
              <span className="text-xs font-semibold text-blue-400/60"> / {stats?.male_max ?? 150}</span>
            </p>
            <p className="mt-0.5 text-xs font-semibold text-blue-300">남자</p>
            {maleLabel && <p className={`mt-1 text-xs font-bold ${maleLabel.cls}`}>{maleLabel.text}</p>}
            {stats && (
              <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-blue-500/20">
                <div className="h-1 rounded-full bg-blue-400 transition-all"
                  style={{ width: `${Math.min((stats.male / stats.male_max) * 100, 100)}%` }} />
              </div>
            )}
          </div>
        </div>

        {/* ── 혜택 섹션 ──────────────────────────────────────────── */}
        <div className="mb-7 rounded-2xl border border-white/10 bg-white/5 px-5 py-4 backdrop-blur-md">
          <p className="mb-3 text-xs font-bold uppercase tracking-widest text-white/40">🎁 사전예약 혜택</p>
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-sm text-white/60">여자</span>
              <span className="text-sm font-semibold text-pink-400">매칭권 2개</span>
            </div>
            <div className="h-px bg-white/10" />
            <div className="flex items-center justify-between">
              <span className="text-sm text-white/60">남자</span>
              <span className="text-sm font-semibold text-blue-400">매칭권 1개</span>
            </div>
          </div>
        </div>

        {/* ── 스텝 인디케이터 ────────────────────────────────────── */}
        <div className="mb-4 flex items-center justify-center gap-1.5">
          {STEPS.map((s, i) => (
            <div key={s}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                step === s ? "w-6 bg-blue-500" : i < currentStepIdx ? "w-3 bg-blue-500/40" : "w-3 bg-white/15"
              }`}
            />
          ))}
        </div>

        {/* ── 1단계: 전화번호 입력 ───────────────────────────────── */}
        {step === "phone" && (
          <form onSubmit={handleSendOtp} className="space-y-4 rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl">
            <div>
              <p className="mb-1 text-base font-bold text-white">휴대폰 번호 인증</p>
              <p className="mb-4 text-xs text-white/40">사전예약 신청을 위해 인증이 필요해요</p>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-white/50">휴대폰 번호</label>
              <input
                type="tel"
                inputMode="numeric"
                placeholder="010-1234-5678"
                value={formatPhone(phone)}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 11))}
                className="w-full rounded-xl border border-white/20 bg-white/10 px-4 py-3 text-sm text-white placeholder:text-white/30 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                required
              />
            </div>
            {error && (
              <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-xs text-red-400">{error}</p>
            )}
            <button
              type="submit"
              disabled={loading || phone.length < 10}
              className="w-full rounded-xl bg-gradient-to-r from-blue-500 to-blue-600 py-4 text-sm font-bold text-white shadow-[0_0_24px_rgba(59,130,246,0.4)] transition-all hover:from-blue-400 hover:to-blue-500 active:scale-[0.98] disabled:opacity-40 disabled:shadow-none"
            >
              {loading ? "발송 중..." : "인증번호 받기"}
            </button>
            <div className="space-y-1.5 pt-1">
              <p className="flex items-center gap-2 text-xs text-white/30">
                <span className="text-green-400">✔</span>
                인증 정보는 사전예약 외 다른 용도로 사용되지 않습니다
              </p>
              <p className="flex items-center gap-2 text-xs text-white/30">
                <span className="text-green-400">✔</span>
                스팸 절대 없음
              </p>
            </div>
          </form>
        )}

        {/* ── 2단계: OTP 입력 ────────────────────────────────────── */}
        {step === "otp" && (
          <form onSubmit={handleVerifyOtp} className="space-y-4 rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl">
            <div>
              <p className="mb-1 text-base font-bold text-white">인증번호 입력</p>
              <p className="mb-4 text-xs text-white/40">
                <span className="font-semibold text-white/70">{formatPhone(phone)}</span>으로 발송된<br />
                6자리 인증번호를 입력해주세요
              </p>
            </div>
            <div>
              <input
                type="text"
                inputMode="numeric"
                placeholder="000000"
                maxLength={6}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                className="w-full rounded-xl border border-white/20 bg-white/10 px-4 py-3 text-center text-xl font-bold tracking-[0.4em] text-white placeholder:text-white/20 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                autoFocus
                required
              />
            </div>
            {error && (
              <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-xs text-red-400">{error}</p>
            )}
            <button
              type="submit"
              disabled={loading || otp.length < 6}
              className="w-full rounded-xl bg-gradient-to-r from-blue-500 to-blue-600 py-4 text-sm font-bold text-white shadow-[0_0_24px_rgba(59,130,246,0.4)] transition-all hover:from-blue-400 hover:to-blue-500 active:scale-[0.98] disabled:opacity-40 disabled:shadow-none"
            >
              확인
            </button>
            <div className="flex items-center justify-between pt-1">
              <button
                type="button"
                onClick={() => { setStep("phone"); setError(null); }}
                className="text-xs text-white/30 transition-colors hover:text-white/60"
              >
                번호 변경
              </button>
              <button
                type="button"
                onClick={handleResend}
                disabled={cooldown > 0 || loading}
                className="text-xs font-semibold text-blue-400 transition-colors hover:text-blue-300 disabled:text-white/30"
              >
                {cooldown > 0 ? `재발송 (${cooldown}초)` : "인증번호 재발송"}
              </button>
            </div>
          </form>
        )}

        {/* ── 3단계: 성별 선택 ───────────────────────────────────── */}
        {step === "gender" && (
          <form onSubmit={handleSubmit} className="space-y-4 rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl">
            <div>
              <p className="mb-1 text-base font-bold text-white">성별 선택</p>
              <p className="mb-4 text-xs text-white/40">성별 오기입 시 회원가입 때 혜택 지급이 불가할 수 있어요</p>
              <div className="grid grid-cols-2 gap-2">
                {(["FEMALE", "MALE"] as const).map((g) => {
                  const isFull = stats
                    ? (g === "FEMALE" ? stats.female >= stats.female_max : stats.male >= stats.male_max)
                    : false;
                  return (
                    <button
                      key={g}
                      type="button"
                      onClick={() => !isFull && setGender(g)}
                      disabled={isFull}
                      className={`rounded-xl border-2 py-3.5 text-sm font-bold transition-all disabled:cursor-not-allowed disabled:opacity-40 ${
                        gender === g
                          ? g === "FEMALE"
                            ? "border-pink-400/60 bg-pink-500/20 text-pink-300"
                            : "border-blue-400/60 bg-blue-500/20 text-blue-300"
                          : "border-white/10 bg-white/5 text-white/50 hover:border-white/20 hover:bg-white/10"
                      }`}
                    >
                      {g === "FEMALE" ? "👩 여자" : "👨 남자"}
                      {isFull && <span className="ml-1 text-xs text-red-400">마감</span>}
                    </button>
                  );
                })}
              </div>
            </div>
            {error && (
              <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-xs text-red-400">{error}</p>
            )}
            <button
              type="submit"
              disabled={loading || !gender}
              className="w-full rounded-xl bg-gradient-to-r from-blue-500 to-blue-600 py-4 text-sm font-bold text-white shadow-[0_0_24px_rgba(59,130,246,0.4)] transition-all hover:from-blue-400 hover:to-blue-500 active:scale-[0.98] disabled:opacity-40 disabled:shadow-none"
            >
              {loading ? "등록 중..." : "사전예약 신청하기"}
            </button>
            <button
              type="button"
              onClick={() => { setStep("otp"); setError(null); }}
              className="w-full text-center text-xs text-white/30 transition-colors hover:text-white/60"
            >
              이전으로
            </button>
          </form>
        )}

        {/* ── 신뢰 섹션 (1단계에서만 표시) ──────────────────────── */}
        {step === "phone" && (
          <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 px-5 py-4 backdrop-blur-md">
            <p className="mb-2.5 text-xs font-bold uppercase tracking-widest text-white/40">안전하게 참여하세요</p>
            <ul className="space-y-2">
              {[
                "학교 인증된 사람만 참여",
                "팀 매칭이라 부담 없음",
                "원치 않으면 언제든 거절 가능",
              ].map((item) => (
                <li key={item} className="flex items-center gap-2.5 text-sm text-white/60">
                  <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-green-500/80 text-[9px] font-bold text-white">✓</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        )}

      </div>
    </div>
  );
}
