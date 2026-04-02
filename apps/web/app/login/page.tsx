"use client";

import { useState, useEffect, FormEvent } from "react";
import Link from "next/link";
import Script from "next/script";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { certifyPhone, findUsernameByToken, sendPasswordResetOtp, verifyEmailOtp, resetPasswordByEmail } from "@/lib/api";

const IMP_CODE = process.env.NEXT_PUBLIC_IMP_CODE ?? "";
const IMP_CERT_CHANNEL_KEY = process.env.NEXT_PUBLIC_IMP_CERT_CHANNEL_KEY ?? "";

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [modal, setModal] = useState<null | "find-id" | "reset-password">(null);

  useEffect(() => {
    document.body.style.overflow = modal ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [modal]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(username.trim().toLowerCase(), password);
      router.replace("/discover");
    } catch (err) {
      setError(err instanceof Error ? err.message : "로그인 실패");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-5">
      <Script src="https://cdn.iamport.kr/v1/iamport.js" strategy="afterInteractive" />
      <div className="w-full max-w-sm">
        <div className="mb-10 text-center">
          <h1 className="text-4xl font-black tracking-tight text-gray-900">
            MEETIN<span className="text-blue-600">.</span>
          </h1>
          <p className="mt-2 text-sm text-gray-500">대학생 팀 미팅 플랫폼</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">아이디</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="아이디 입력"
              required
              className={inputCls}
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">비밀번호</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="비밀번호 입력"
              required
              className={inputCls}
            />
          </div>

          {error && (
            <div className="rounded-xl bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-600">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-blue-600 py-3.5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50 active:scale-95 transition-all"
          >
            {loading ? "로그인 중..." : "로그인"}
          </button>
        </form>

        <div className="mt-4 flex items-center justify-center gap-4 text-xs text-gray-400">
          <button
            type="button"
            onClick={() => setModal("find-id")}
            className="hover:text-blue-600 hover:underline active:text-blue-600 active:underline transition-colors"
          >
            아이디 찾기
          </button>
          <span>·</span>
          <button
            type="button"
            onClick={() => setModal("reset-password")}
            className="hover:text-blue-600 hover:underline active:text-blue-600 active:underline transition-colors"
          >
            비밀번호 찾기
          </button>
        </div>

        <p className="mt-5 text-center text-sm text-gray-500">
          아직 계정이 없으신가요?{" "}
          <Link href="/register" className="font-semibold text-blue-600 hover:underline">
            회원가입
          </Link>
        </p>
      </div>

      {modal === "find-id" && <FindIdModal onClose={() => setModal(null)} />}
      {modal === "reset-password" && <ResetPasswordModal onClose={() => setModal(null)} />}
    </div>
  );
}

// ─── 공통 스타일 ──────────────────────────────────────────
const inputCls =
  "w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-base text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all";

// ─── 포트원 본인인증 공통 훅 ────────────────────────────────
function useCertifyFlow() {
  const [phoneToken, setPhoneToken] = useState<string | null>(null);
  const [certLoading, setCertLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const certify = (): Promise<string | null> => {
    return new Promise((resolve) => {
      setError(null);
      const IMP = (window as any).IMP;
      if (!IMP) {
        setError("본인인증 모듈을 불러오는 중입니다. 잠시 후 다시 시도해주세요.");
        resolve(null);
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
            resolve(null);
            return;
          }
          try {
            const { phone_token } = await certifyPhone(rsp.imp_uid);
            setPhoneToken(phone_token);
            resolve(phone_token);
          } catch (err) {
            setError(err instanceof Error ? err.message : "본인인증 처리 실패");
            resolve(null);
          } finally {
            setCertLoading(false);
          }
        },
      );
    });
  };

  return { phoneToken, certLoading, error, setError, certify };
}

// ─── 아이디 찾기 모달 ─────────────────────────────────────

function FindIdModal({ onClose }: { onClose: () => void }) {
  const cert = useCertifyFlow();
  const [result, setResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleCertifyAndFind = async () => {
    const token = await cert.certify();
    if (!token) return;
    setLoading(true);
    try {
      const res = await findUsernameByToken(token);
      setResult(res.masked_username ?? "가입된 계정을 찾을 수 없습니다.");
    } catch (err) {
      cert.setError(err instanceof Error ? err.message : "오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <ModalShell title="아이디 찾기" onClose={onClose}>
      {!result ? (
        <div className="space-y-4">
          <p className="text-sm text-gray-500">가입 시 등록한 전화번호로 본인인증하면 아이디를 확인할 수 있습니다.</p>

          {cert.error && (
            <div className="rounded-xl bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-600">
              {cert.error}
            </div>
          )}

          <button
            type="button"
            onClick={handleCertifyAndFind}
            disabled={cert.certLoading || loading}
            className="w-full rounded-xl bg-gray-800 py-3 text-sm font-bold text-white hover:bg-gray-700 disabled:opacity-40 transition-all"
          >
            {cert.certLoading || loading ? "처리 중..." : "휴대폰 본인인증으로 찾기"}
          </button>
        </div>
      ) : (
        <div className="space-y-5">
          <div className="rounded-2xl border border-blue-100 bg-blue-50 px-5 py-4 text-center">
            <p className="text-xs text-blue-500 mb-1">가입된 아이디</p>
            <p className="text-base font-bold text-blue-800 tracking-wide">{result}</p>
          </div>
          <p className="text-center text-xs text-gray-400">보안을 위해 일부 문자는 *로 표시됩니다.</p>
          <button onClick={onClose} className="w-full rounded-xl bg-gray-100 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-200 transition-all">
            닫기
          </button>
        </div>
      )}
    </ModalShell>
  );
}

// ─── 비밀번호 찾기 모달 ───────────────────────────────────

type ResetStep = "email" | "otp" | "newpw" | "done";

function ResetPasswordModal({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState<ResetStep>("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [showNewPw, setShowNewPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSendOtp = async (e: FormEvent) => {
    e.preventDefault();
    setResetError(null);
    setLoading(true);
    try {
      await sendPasswordResetOtp(email.trim().toLowerCase());
      setStep("otp");
    } catch (err) {
      setResetError(err instanceof Error ? err.message : "오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: FormEvent) => {
    e.preventDefault();
    setResetError(null);
    if (otp.length !== 6) { setResetError("6자리 인증코드를 입력해주세요."); return; }
    setLoading(true);
    try {
      const { reset_token } = await verifyEmailOtp(email.trim().toLowerCase(), otp);
      setResetToken(reset_token);
      setStep("newpw");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "오류가 발생했습니다.";
      if (msg.includes("횟수를 초과")) {
        setOtp("");
        setResetError(msg + " 아래 재발송 버튼을 눌러주세요.");
      } else {
        setResetError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResetSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setResetError(null);
    if (newPw !== confirmPw) { setResetError("비밀번호가 일치하지 않습니다."); return; }
    if (newPw.length < 8) { setResetError("비밀번호는 8자 이상이어야 합니다."); return; }
    setLoading(true);
    try {
      await resetPasswordByEmail(email.trim().toLowerCase(), resetToken, newPw);
      setStep("done");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "오류가 발생했습니다.";
      setOtp("");
      setResetToken("");
      setStep("email");
      setResetError(msg);
    } finally {
      setLoading(false);
    }
  };

  const STEPS: ResetStep[] = ["email", "otp", "newpw"];
  const STEP_LABELS = { email: "이메일 입력", otp: "인증코드 확인", newpw: "새 비밀번호" };

  return (
    <ModalShell title="비밀번호 찾기" onClose={onClose}>
      {step !== "done" && (
        <div className="mb-5 flex items-center gap-2">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                step === s ? "bg-blue-600 text-white"
                : i < STEPS.indexOf(step) ? "bg-emerald-500 text-white"
                : "bg-gray-200 text-gray-500"
              }`}>
                {i < STEPS.indexOf(step) ? "✓" : i + 1}
              </div>
              <span className={`text-xs ${step === s ? "font-semibold text-gray-800" : "text-gray-400"}`}>
                {STEP_LABELS[s as keyof typeof STEP_LABELS]}
              </span>
              {i < STEPS.length - 1 && <div className="h-px w-6 bg-gray-200" />}
            </div>
          ))}
        </div>
      )}

      {step === "email" && (
        <form onSubmit={handleSendOtp} className="space-y-4">
          <p className="text-sm text-gray-500">가입 시 등록한 이메일을 입력해주세요. 인증코드를 보내드립니다.</p>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">이메일</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="example@gmail.com" required className={inputCls} />
          </div>
          {resetError && (
            <div className="rounded-xl bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-600">{resetError}</div>
          )}
          <button type="submit" disabled={loading}
            className="w-full rounded-xl bg-gray-800 py-3 text-sm font-bold text-white hover:bg-gray-700 disabled:opacity-40 transition-all">
            {loading ? "발송 중..." : "인증코드 받기"}
          </button>
        </form>
      )}

      {step === "otp" && (
        <form onSubmit={handleVerifyOtp} className="space-y-4">
          <p className="text-sm text-gray-500">
            <span className="font-semibold text-gray-800">{email}</span>로 발송된 6자리 인증코드를 입력해주세요.
          </p>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">인증코드</label>
            <input type="text" value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="000000" required maxLength={6} inputMode="numeric"
              className={`${inputCls} text-center text-lg tracking-[0.4em] font-bold`} />
          </div>
          {resetError && (
            <div className="rounded-xl bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-600">{resetError}</div>
          )}
          <div className="flex gap-3">
            <button type="button" onClick={() => { setStep("email"); setOtp(""); setResetError(null); }}
              className="flex-1 rounded-xl border border-gray-200 py-3 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-all">
              이전
            </button>
            <button type="submit" disabled={otp.length !== 6}
              className="flex-1 rounded-xl bg-blue-600 py-3 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50 active:scale-95 transition-all">
              확인
            </button>
          </div>
          <button type="button" onClick={handleSendOtp} disabled={loading}
            className="w-full text-center text-xs text-gray-400 hover:text-blue-500 transition-colors disabled:opacity-40">
            {loading ? "발송 중..." : "인증코드 재발송"}
          </button>
        </form>
      )}

      {step === "newpw" && (
        <form onSubmit={handleResetSubmit} className="space-y-4">
          <p className="text-sm text-gray-500">새로 사용할 비밀번호를 입력해주세요.</p>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">새 비밀번호</label>
            <div className="relative">
              <input type={showNewPw ? "text" : "password"} value={newPw} onChange={(e) => setNewPw(e.target.value)}
                placeholder="8자 이상, 특수문자 포함" required minLength={8} className={`${inputCls} pr-11`} />
              <button type="button" onClick={() => setShowNewPw((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                {showNewPw ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">비밀번호 확인</label>
            <div className="relative">
              <input type={showConfirmPw ? "text" : "password"} value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)}
                placeholder="비밀번호 재입력" required
                className={`w-full rounded-xl border px-4 py-3 pr-11 text-sm text-gray-900 outline-none focus:ring-2 transition-all ${
                  confirmPw && newPw !== confirmPw
                    ? "border-red-300 bg-red-50 focus:border-red-400 focus:ring-red-100"
                    : "border-gray-200 bg-white focus:border-blue-500 focus:ring-blue-100"
                }`} />
              <button type="button" onClick={() => setShowConfirmPw((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                {showConfirmPw ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>
            {confirmPw && newPw !== confirmPw && (
              <p className="mt-1 text-xs text-red-500">비밀번호가 일치하지 않습니다.</p>
            )}
          </div>
          {resetError && (
            <div className="rounded-xl bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-600">{resetError}</div>
          )}
          <div className="flex gap-3">
            <button type="button" onClick={() => { setStep("otp"); setResetError(null); }}
              className="flex-1 rounded-xl border border-gray-200 py-3 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-all">
              이전
            </button>
            <button type="submit" disabled={loading || newPw !== confirmPw}
              className="flex-1 rounded-xl bg-blue-600 py-3 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50 active:scale-95 transition-all">
              {loading ? "변경 중..." : "비밀번호 변경"}
            </button>
          </div>
        </form>
      )}

      {step === "done" && (
        <div className="space-y-5 text-center">
          <div className="flex flex-col items-center gap-2 py-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-3xl">✓</div>
            <p className="mt-2 text-base font-bold text-gray-900">비밀번호가 변경되었습니다</p>
            <p className="text-sm text-gray-500">새 비밀번호로 로그인해주세요.</p>
          </div>
          <button onClick={onClose}
            className="w-full rounded-xl bg-blue-600 py-3.5 text-sm font-bold text-white hover:bg-blue-700 active:scale-95 transition-all">
            로그인하러 가기
          </button>
        </div>
      )}
    </ModalShell>
  );
}

// ─── 아이콘 ───────────────────────────────────────────────

function EyeIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

// ─── 모달 공통 껍데기 ─────────────────────────────────────

function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md rounded-t-3xl bg-white p-6 pb-10 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">{title}</h2>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
