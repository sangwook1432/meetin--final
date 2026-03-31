"use client";

import { useState, useEffect } from "react";
import Script from "next/script";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const IMP_CODE = process.env.NEXT_PUBLIC_IMP_CODE ?? "";
const IMP_CERT_CHANNEL_KEY = process.env.NEXT_PUBLIC_IMP_CERT_CHANNEL_KEY ?? "";

type Step = "certify" | "gender";

const STEPS: Step[] = ["certify", "gender"];

function getUrgencyLabel(count: number, max: number) {
  if (count >= max) return { text: "마감", cls: "text-red-500" };
  const rate = count / max;
  if (rate >= 0.7) return { text: "🔥 빠르게 마감 중", cls: "text-orange-500" };
  if (rate >= 0.4) return { text: "대기 중", cls: "text-yellow-600" };
  return { text: "모집 중", cls: "text-green-600" };
}

export default function PreregisterPage() {
  const [step, setStep] = useState<Step>("certify");
  const [phoneToken, setPhoneToken] = useState("");
  const [gender, setGender] = useState<"MALE" | "FEMALE" | "">("");
  const [loading, setLoading] = useState(false);
  const [certLoading, setCertLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ tickets: number; gender: "MALE" | "FEMALE" } | null>(null);
  const [stats, setStats] = useState<{ male: number; female: number; male_max: number; female_max: number } | null>(null);

  useEffect(() => {
    fetch(`${BASE}/preregister/stats`)
      .then((r) => r.json())
      .then((d) => setStats(d))
      .catch(() => {});
  }, []);

  // 포트원 본인인증
  const handleCertify = () => {
    setError(null);
    const IMP = (window as any).IMP;
    if (!IMP) {
      setError("본인인증 모듈을 불러오는 중입니다. 잠시 후 다시 시도해주세요.");
      return;
    }
    IMP.init(IMP_CODE || "imp_test");
    setCertLoading(true);
    IMP.certification(
      {
        channelKey: IMP_CERT_CHANNEL_KEY,
        merchant_uid: `cert_${Date.now()}`,
        popup: false,
      },
      async (rsp: any) => {
        if (!rsp.success) {
          setError(rsp.error_msg ?? "본인인증에 실패했습니다.");
          setCertLoading(false);
          return;
        }
        try {
          const res = await fetch(`${BASE}/auth/phone/certify`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ imp_uid: rsp.imp_uid }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.detail ?? "본인인증 처리 실패");
          setPhoneToken(data.phone_token);
          setStep("gender");
        } catch (e) {
          setError(e instanceof Error ? e.message : "본인인증 처리 실패");
        } finally {
          setCertLoading(false);
        }
      },
    );
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
        body: JSON.stringify({ phone_token: phoneToken, gender }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 400) {
          setStep("certify");
          setPhoneToken("");
          throw new Error("인증이 만료되었습니다. 처음부터 다시 시도해주세요.");
        }
        const detail = data.detail;
        if (res.status === 409) throw new Error("이미 사전예약된 번호입니다. 앱 출시를 기다려주세요! 🎉");
        throw new Error(typeof detail === "string" ? detail : "오류가 발생했습니다.");
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
      <div className="flex min-h-screen flex-col items-center justify-center bg-white px-4">
        <div className="w-full max-w-sm rounded-3xl border border-gray-100 bg-white p-8 text-center shadow-xl">
          <div className="mb-4 text-5xl">{done.gender === "FEMALE" ? "🎀" : "🎯"}</div>
          <h1 className="text-2xl font-black text-gray-900">사전예약 완료!</h1>
          <p className="mt-3 text-sm leading-relaxed text-gray-500">
            앱 출시와 동시에<br />
            <span className="font-bold text-blue-600">매칭권 {done.tickets}개</span>가 자동으로 지급됩니다.
          </p>
          {done.gender === "FEMALE" && (
            <p className="mt-1 text-xs font-medium text-pink-500">+ 우선 매칭 혜택도 드려요 ✨</p>
          )}
          <div className="mt-6 rounded-2xl bg-blue-50 px-4 py-4">
            <p className="text-xs font-medium text-blue-500">출시 알림을 받으려면</p>
            <p className="mt-1 text-sm font-bold text-blue-800">가입하신 번호로 문자를 드릴게요 📱</p>
          </div>
        </div>
      </div>
    );
  }

  const femaleLabel = stats ? getUrgencyLabel(stats.female, stats.female_max) : null;
  const maleLabel = stats ? getUrgencyLabel(stats.male, stats.male_max) : null;
  const currentStepIdx = STEPS.indexOf(step);

  return (
    <div className="min-h-screen bg-white px-4 pb-16">
      <Script src="https://cdn.iamport.kr/v1/iamport.js" strategy="afterInteractive" />
      <div className="mx-auto w-full max-w-sm pt-12">

        {/* ── 1. 헤더 ────────────────────────────────────────────── */}
        <div className="mb-8 text-center">
          <p className="mb-3 text-xs font-bold tracking-[0.25em] text-blue-500">MEETIN.</p>
          <h1 className="text-[1.85rem] font-black leading-tight tracking-tight text-gray-900">
            같은 대학생끼리<br />팀 미팅 매칭
          </h1>
          <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-blue-600 px-4 py-1.5">
            <span className="text-xs font-bold text-white">선착순 150명만 무료 매칭권 제공</span>
          </div>
        </div>

        {/* ── 정원 현황 ─────────────────────────────────────────── */}
        <div className="mb-4 grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-pink-100 bg-pink-50 p-4 text-center">
            <p className="text-xl font-black text-pink-600">
              {stats ? stats.female : "—"}
              <span className="text-xs font-semibold text-pink-400"> / {stats?.female_max ?? 150}</span>
            </p>
            <p className="mt-0.5 text-xs font-semibold text-pink-500">여자</p>
            {femaleLabel && (
              <p className={`mt-1 text-xs font-bold ${femaleLabel.cls}`}>{femaleLabel.text}</p>
            )}
            {stats && (
              <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-pink-100">
                <div className="h-1 rounded-full bg-pink-400 transition-all"
                  style={{ width: `${Math.min((stats.female / stats.female_max) * 100, 100)}%` }} />
              </div>
            )}
          </div>
          <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-center">
            <p className="text-xl font-black text-blue-600">
              {stats ? stats.male : "—"}
              <span className="text-xs font-semibold text-blue-400"> / {stats?.male_max ?? 150}</span>
            </p>
            <p className="mt-0.5 text-xs font-semibold text-blue-500">남자</p>
            {maleLabel && (
              <p className={`mt-1 text-xs font-bold ${maleLabel.cls}`}>{maleLabel.text}</p>
            )}
            {stats && (
              <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-blue-100">
                <div className="h-1 rounded-full bg-blue-400 transition-all"
                  style={{ width: `${Math.min((stats.male / stats.male_max) * 100, 100)}%` }} />
              </div>
            )}
          </div>
        </div>

        {/* ── 혜택 섹션 ─────────────────────────────────────────── */}
        <div className="mb-7 rounded-2xl border border-amber-100 bg-amber-50 px-5 py-4">
          <p className="mb-3 text-xs font-bold uppercase tracking-widest text-amber-600">🎁 사전예약 혜택</p>
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">여자</span>
              <span className="text-sm font-semibold text-pink-600">매칭권 2개</span>
            </div>
            <div className="h-px bg-amber-100" />
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">남자</span>
              <span className="text-sm font-semibold text-blue-600">매칭권 1개</span>
            </div>
          </div>
        </div>

        {/* ── 스텝 인디케이터 ──────────────────────────────────────── */}
        <div className="mb-4 flex items-center justify-center gap-1.5">
          {STEPS.map((s, i) => (
            <div key={s}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                step === s ? "w-6 bg-blue-600" : i < currentStepIdx ? "w-3 bg-blue-300" : "w-3 bg-gray-200"
              }`}
            />
          ))}
        </div>

        {/* ── 1단계: 본인인증 ──────────────────────────────────────── */}
        {step === "certify" && (
          <div className="space-y-4 rounded-3xl border border-gray-100 bg-white p-6 shadow-[0_2px_24px_rgba(0,0,0,0.07)]">
            <div>
              <p className="mb-1 text-base font-bold text-gray-900">휴대폰 본인인증</p>
              <p className="mb-4 text-xs text-gray-400">사전예약 신청을 위해 본인인증이 필요해요</p>
            </div>
            {error && <p className="rounded-xl bg-red-50 px-4 py-2.5 text-xs text-red-500">{error}</p>}
            <button
              type="button"
              onClick={handleCertify}
              disabled={certLoading}
              className="w-full rounded-xl bg-blue-600 py-4 text-sm font-bold text-white transition-all hover:bg-blue-700 active:scale-[0.98] disabled:opacity-40"
            >
              {certLoading ? "인증 진행 중..." : "사전예약 하고 먼저 매칭 받기"}
            </button>
            <div className="space-y-1.5 pt-1">
              <p className="flex items-center gap-2 text-xs text-gray-400">
                <span className="text-green-500">✔</span>
                인증 정보는 사전예약 외 다른 용도로 사용되지 않습니다
              </p>
              <p className="flex items-center gap-2 text-xs text-gray-400">
                <span className="text-green-500">✔</span>
                스팸 절대 없음
              </p>
            </div>
          </div>
        )}

        {/* ── 신뢰 섹션 (1단계에서만 표시) ────────────────────────── */}
        {step === "certify" && (
          <div className="mt-4 rounded-2xl border border-green-100 bg-green-50 px-5 py-4">
            <p className="mb-2.5 text-xs font-bold uppercase tracking-widest text-green-600">안전하게 참여하세요</p>
            <ul className="space-y-2">
              {[
                "학교 인증된 사람만 참여",
                "팀 매칭이라 부담 없음",
                "원치 않으면 언제든 거절 가능",
              ].map((item) => (
                <li key={item} className="flex items-center gap-2.5 text-sm text-green-800">
                  <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-green-500 text-[9px] font-bold text-white">✓</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* ── 2단계: 성별 ──────────────────────────────────────────── */}
        {step === "gender" && (
          <form onSubmit={handleSubmit} className="space-y-4 rounded-3xl border border-gray-100 bg-white p-6 shadow-[0_2px_24px_rgba(0,0,0,0.07)]">
            <div>
              <p className="mb-1 text-base font-bold text-gray-900">성별 선택</p>
              <p className="mb-4 text-xs text-gray-400">혜택이 성별에 따라 달라져요</p>
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
              className="w-full rounded-xl bg-blue-600 py-4 text-sm font-bold text-white transition-all hover:bg-blue-700 active:scale-[0.98] disabled:opacity-40"
            >
              {loading ? "등록 중..." : "사전예약 신청하기"}
            </button>
            <button
              type="button"
              onClick={() => { setStep("certify"); setPhoneToken(""); setError(null); }}
              className="w-full text-center text-xs text-gray-400 transition-colors hover:text-gray-600"
            >
              처음부터 다시 하기
            </button>
          </form>
        )}

      </div>
    </div>
  );
}
