"use client";

import { useState, useEffect } from "react";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

type Step = "phone" | "otp" | "gender";

export default function PreregisterPage() {
  const [step, setStep] = useState<Step>("phone");

  // 단계별 상태
  const [phone, setPhone] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [phoneToken, setPhoneToken] = useState("");
  const [gender, setGender] = useState<"MALE" | "FEMALE" | "">("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ tickets: number; gender: "MALE" | "FEMALE" } | null>(null);

  const [stats, setStats] = useState<{ male: number; female: number; male_max: number; female_max: number } | null>(null);

  // 정원 현황 로드
  useEffect(() => {
    fetch(`${BASE}/preregister/stats`)
      .then((r) => r.json())
      .then((d) => setStats(d))
      .catch(() => {});
  }, []);

  // ── 에러 메시지 추출 헬퍼 ─────────────────────────────────────
  const parseError = (status: number, detail: unknown, messages: Partial<Record<number, string>>, fallback: string): string => {
    if (messages[status]) return messages[status]!;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail)) return (detail as { msg: string }[]).map((d) => d.msg).join(", ");
    return fallback;
  };

  // ── 1단계: OTP 발송 ────────────────────────────────────────────
  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${BASE}/auth/phone/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(parseError(res.status, data.detail, {
        400: "올바른 휴대폰 번호를 입력해주세요. (예: 01012345678)",
        429: "인증번호 발송 횟수를 초과했습니다. 1시간 후 다시 시도해주세요.",
        500: "SMS 발송에 실패했습니다. 잠시 후 다시 시도해주세요.",
      }, "발송에 실패했습니다."));
      setStep("otp");
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류가 발생했습니다. 인터넷 연결을 확인해주세요.");
    } finally {
      setLoading(false);
    }
  };

  // ── 2단계: OTP 검증 ────────────────────────────────────────────
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${BASE}/auth/phone/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, code: otpCode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(parseError(res.status, data.detail, {
        400: "인증번호가 올바르지 않거나 만료되었습니다. 다시 확인해주세요.",
        429: "인증 시도 횟수를 초과했습니다. 10분 후 다시 시도해주세요.",
      }, "인증에 실패했습니다."));
      setPhoneToken(data.phone_token);
      setStep("gender");
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  // ── 3단계: 사전예약 등록 ───────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!gender) { setError("성별을 선택해주세요."); return; }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${BASE}/preregister`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone_token: phoneToken, gender }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 400) {
          // phone_token 만료 → 처음부터 다시
          setStep("phone");
          setOtpCode("");
          setPhoneToken("");
          throw new Error("인증이 만료되었습니다. 처음부터 다시 시도해주세요.");
        }
        throw new Error(parseError(res.status, data.detail, {
          409: "이미 사전예약된 번호입니다. 앱 출시를 기다려주세요! 🎉",
        }, "오류가 발생했습니다."));
      }
      setDone({ tickets: data.welcome_tickets, gender: gender as "MALE" | "FEMALE" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  // ── 완료 화면 ──────────────────────────────────────────────────
  if (done) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 px-4">
        <div className="w-full max-w-sm rounded-3xl bg-white p-8 text-center shadow-xl">
          <div className="mb-4 text-5xl">{done.gender === "FEMALE" ? "🎀" : "🎯"}</div>
          <h1 className="text-2xl font-black text-gray-900">사전예약 완료!</h1>
          <p className="mt-3 text-gray-500 text-sm leading-relaxed">
            앱 출시와 동시에<br />
            <span className="font-bold text-blue-600">매칭권 {done.tickets}개</span>가 자동으로 지급됩니다.
          </p>
          <div className="mt-6 rounded-2xl bg-blue-50 px-4 py-4">
            <p className="text-xs text-blue-500 font-medium">출시 알림을 받으려면</p>
            <p className="mt-1 text-sm font-bold text-blue-800">가입하신 번호로 문자를 드릴게요 📱</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 px-4">
      <div className="w-full max-w-sm">

        {/* 헤더 */}
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-black tracking-tight text-gray-900">MEETIN.</h1>
          <p className="mt-2 text-sm text-gray-500">대학생 미팅 앱 — 사전예약</p>
        </div>

        {/* 정원 현황 */}
        <div className="mb-6 grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-pink-50 border border-pink-100 p-4 text-center">
            <p className="text-2xl font-black text-pink-600">
              {stats ? `${stats.female}/${stats.female_max}` : "—"}
            </p>
            <p className="mt-0.5 text-xs text-pink-400 font-medium">여자 정원</p>
            {stats && stats.female >= stats.female_max && (
              <p className="mt-1 text-xs font-bold text-red-500">마감</p>
            )}
          </div>
          <div className="rounded-2xl bg-blue-50 border border-blue-100 p-4 text-center">
            <p className="text-2xl font-black text-blue-600">
              {stats ? `${stats.male}/${stats.male_max}` : "—"}
            </p>
            <p className="mt-0.5 text-xs text-blue-400 font-medium">남자 정원</p>
            {stats && stats.male >= stats.male_max && (
              <p className="mt-1 text-xs font-bold text-red-500">마감</p>
            )}
          </div>
        </div>

        {/* 단계 인디케이터 */}
        <div className="mb-4 flex items-center justify-center gap-2">
          {(["phone", "otp", "gender"] as Step[]).map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div className={`h-2 w-2 rounded-full transition-all ${
                step === s ? "bg-blue-600 w-4" : i < ["phone","otp","gender"].indexOf(step) ? "bg-blue-300" : "bg-gray-200"
              }`} />
            </div>
          ))}
        </div>

        {/* ── 1단계: 전화번호 입력 ── */}
        {step === "phone" && (
          <form onSubmit={handleSendOtp} className="rounded-3xl bg-white p-6 shadow-xl space-y-4">
            <div>
              <p className="mb-4 text-sm font-semibold text-gray-700">휴대폰 번호를 입력해주세요</p>
              <label className="mb-1.5 block text-xs font-semibold text-gray-500">휴대폰 번호</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="01012345678"
                required
                className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900 outline-none focus:border-blue-400 focus:bg-white transition-all"
              />
            </div>
            {error && <p className="rounded-xl bg-red-50 px-4 py-2.5 text-xs text-red-500">{error}</p>}
            <button
              type="submit"
              disabled={loading || !phone}
              className="w-full rounded-xl bg-blue-600 py-3.5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-40 transition-all"
            >
              {loading ? "발송 중..." : "인증번호 받기"}
            </button>
            <p className="text-center text-xs text-gray-400">앱 출시 시 입력하신 번호로 알림을 드립니다</p>
          </form>
        )}

        {/* ── 2단계: OTP 입력 ── */}
        {step === "otp" && (
          <form onSubmit={handleVerifyOtp} className="rounded-3xl bg-white p-6 shadow-xl space-y-4">
            <div>
              <p className="mb-1 text-sm font-semibold text-gray-700">인증번호를 입력해주세요</p>
              <p className="mb-4 text-xs text-gray-400">{phone}로 발송된 6자리 번호</p>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ""))}
                placeholder="000000"
                required
                className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-center text-xl font-bold tracking-widest text-gray-900 outline-none focus:border-blue-400 focus:bg-white transition-all"
              />
            </div>
            {error && <p className="rounded-xl bg-red-50 px-4 py-2.5 text-xs text-red-500">{error}</p>}
            <button
              type="submit"
              disabled={loading || otpCode.length !== 6}
              className="w-full rounded-xl bg-blue-600 py-3.5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-40 transition-all"
            >
              {loading ? "확인 중..." : "인증 확인"}
            </button>
            <button
              type="button"
              onClick={() => { setStep("phone"); setOtpCode(""); setError(null); }}
              className="w-full text-center text-xs text-gray-400 hover:text-gray-600"
            >
              번호 다시 입력하기
            </button>
          </form>
        )}

        {/* ── 3단계: 성별 선택 ── */}
        {step === "gender" && (
          <form onSubmit={handleSubmit} className="rounded-3xl bg-white p-6 shadow-xl space-y-4">
            <div>
              <p className="mb-4 text-sm font-semibold text-gray-700">성별을 선택해주세요</p>
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
                      className={`rounded-xl border-2 py-3 text-sm font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                        gender === g
                          ? g === "FEMALE"
                            ? "border-pink-400 bg-pink-50 text-pink-700"
                            : "border-blue-400 bg-blue-50 text-blue-700"
                          : "border-gray-200 text-gray-500 hover:border-gray-300"
                      }`}
                    >
                      {g === "FEMALE" ? "👩 여자" : "👨 남자"}
                      {isFull && <span className="ml-1 text-xs text-red-400">마감</span>}
                    </button>
                  );
                })}
              </div>
            </div>
            {error && <p className="rounded-xl bg-red-50 px-4 py-2.5 text-xs text-red-500">{error}</p>}
            <button
              type="submit"
              disabled={loading || !gender}
              className="w-full rounded-xl bg-blue-600 py-3.5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-40 transition-all"
            >
              {loading ? "등록 중..." : "사전예약 신청하기"}
            </button>
            <p className="text-center text-xs text-gray-400">앱 출시 시 입력하신 번호로 알림을 드립니다</p>
          </form>
        )}

      </div>
    </div>
  );
}
