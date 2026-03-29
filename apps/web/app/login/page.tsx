"use client";

import { useState, FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { sendPhoneOtp, verifyPhoneOtp, findUsernameByToken, resetPasswordByToken } from "@/lib/api";

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [modal, setModal] = useState<null | "find-id" | "reset-password">(null);

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
  "w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all";

// ─── OTP 공통 훅 로직 (모달 내부에서 재사용) ────────────────
function useOtpFlow() {
  const [phone, setPhone] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [phoneToken, setPhoneToken] = useState<string | null>(null);
  const [otpLoading, setOtpLoading] = useState(false);
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendOtp = async () => {
    setError(null);
    if (!phone.trim()) { setError("전화번호를 입력해주세요."); return; }
    setOtpLoading(true);
    try {
      await sendPhoneOtp(phone.trim());
      setOtpSent(true);
      setPhoneToken(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "인증번호 발송 실패");
    } finally {
      setOtpLoading(false);
    }
  };

  const verifyOtp = async (): Promise<string | null> => {
    setError(null);
    if (!otpCode.trim()) { setError("인증번호를 입력해주세요."); return null; }
    setVerifyLoading(true);
    try {
      const { phone_token } = await verifyPhoneOtp(phone.trim(), otpCode.trim());
      setPhoneToken(phone_token);
      return phone_token;
    } catch (err) {
      setError(err instanceof Error ? err.message : "인증 실패");
      return null;
    } finally {
      setVerifyLoading(false);
    }
  };

  return {
    phone, setPhone,
    otpCode, setOtpCode,
    otpSent, phoneToken,
    otpLoading, verifyLoading,
    error, setError,
    sendOtp, verifyOtp,
  };
}

// ─── 아이디 찾기 모달 ─────────────────────────────────────

function FindIdModal({ onClose }: { onClose: () => void }) {
  const otp = useOtpFlow();
  const [result, setResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleVerifyAndFind = async () => {
    const token = await otp.verifyOtp();
    if (!token) return;
    setLoading(true);
    try {
      const res = await findUsernameByToken(token);
      setResult(res.masked_username ?? "가입된 계정을 찾을 수 없습니다.");
    } catch (err) {
      otp.setError(err instanceof Error ? err.message : "오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <ModalShell title="아이디 찾기" onClose={onClose}>
      {!result ? (
        <div className="space-y-4">
          <p className="text-sm text-gray-500">가입 시 등록한 전화번호로 인증하면 아이디를 확인할 수 있습니다.</p>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">전화번호</label>
            <div className="flex gap-2">
              <input
                type="tel"
                value={otp.phone}
                onChange={(e) => otp.setPhone(e.target.value)}
                placeholder="01000000000"
                className={`${inputCls} flex-1`}
              />
              <button
                type="button"
                onClick={otp.sendOtp}
                disabled={otp.otpLoading}
                className="shrink-0 rounded-xl bg-gray-800 px-3 py-3 text-xs font-bold text-white hover:bg-gray-700 disabled:opacity-40 transition-all"
              >
                {otp.otpLoading ? "발송중" : otp.otpSent ? "재발송" : "인증번호 발송"}
              </button>
            </div>
          </div>

          {otp.otpSent && (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">인증번호</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  inputMode="numeric"
                  value={otp.otpCode}
                  onChange={(e) => otp.setOtpCode(e.target.value)}
                  placeholder="6자리 입력"
                  maxLength={6}
                  className={`${inputCls} flex-1`}
                />
                <button
                  type="button"
                  onClick={handleVerifyAndFind}
                  disabled={otp.verifyLoading || loading}
                  className="shrink-0 rounded-xl bg-blue-600 px-3 py-3 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-40 transition-all"
                >
                  {otp.verifyLoading || loading ? "확인중" : "아이디 찾기"}
                </button>
              </div>
            </div>
          )}

          {otp.error && (
            <div className="rounded-xl bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-600">
              {otp.error}
            </div>
          )}
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

type ResetStep = "phone" | "newpw" | "done";

function ResetPasswordModal({ onClose }: { onClose: () => void }) {
  const otp = useOtpFlow();
  const [step, setStep] = useState<ResetStep>("phone");
  const [verifiedToken, setVerifiedToken] = useState<string | null>(null);
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [resetError, setResetError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleVerifyPhone = async () => {
    const token = await otp.verifyOtp();
    if (!token) return;
    setVerifiedToken(token);
    setStep("newpw");
  };

  const handleResetSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setResetError(null);
    if (newPw !== confirmPw) { setResetError("비밀번호가 일치하지 않습니다."); return; }
    if (newPw.length < 8) { setResetError("비밀번호는 8자 이상이어야 합니다."); return; }
    if (!verifiedToken) return;
    setLoading(true);
    try {
      await resetPasswordByToken(verifiedToken, newPw);
      setStep("done");
    } catch (err) {
      setResetError(err instanceof Error ? err.message : "오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <ModalShell title="비밀번호 찾기" onClose={onClose}>
      {step !== "done" && (
        <div className="mb-5 flex items-center gap-2">
          {(["phone", "newpw"] as ResetStep[]).map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                step === s ? "bg-blue-600 text-white"
                : i < ["phone", "newpw"].indexOf(step) ? "bg-emerald-500 text-white"
                : "bg-gray-200 text-gray-500"
              }`}>
                {i < ["phone", "newpw"].indexOf(step) ? "✓" : i + 1}
              </div>
              <span className={`text-xs ${step === s ? "font-semibold text-gray-800" : "text-gray-400"}`}>
                {s === "phone" ? "전화번호 인증" : "새 비밀번호 설정"}
              </span>
              {i < 1 && <div className="h-px w-6 bg-gray-200" />}
            </div>
          ))}
        </div>
      )}

      {step === "phone" && (
        <div className="space-y-4">
          <p className="text-sm text-gray-500">가입 시 등록한 전화번호로 인증해주세요.</p>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">전화번호</label>
            <div className="flex gap-2">
              <input type="tel" value={otp.phone} onChange={(e) => otp.setPhone(e.target.value)}
                placeholder="01000000000" className={`${inputCls} flex-1`} />
              <button type="button" onClick={otp.sendOtp} disabled={otp.otpLoading}
                className="shrink-0 rounded-xl bg-gray-800 px-3 py-3 text-xs font-bold text-white hover:bg-gray-700 disabled:opacity-40 transition-all">
                {otp.otpLoading ? "발송중" : otp.otpSent ? "재발송" : "인증번호 발송"}
              </button>
            </div>
          </div>
          {otp.otpSent && (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">인증번호</label>
              <div className="flex gap-2">
                <input type="text" inputMode="numeric" value={otp.otpCode}
                  onChange={(e) => otp.setOtpCode(e.target.value)} placeholder="6자리 입력" maxLength={6}
                  className={`${inputCls} flex-1`} />
                <button type="button" onClick={handleVerifyPhone} disabled={otp.verifyLoading}
                  className="shrink-0 rounded-xl bg-blue-600 px-3 py-3 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-40 transition-all">
                  {otp.verifyLoading ? "확인중" : "다음"}
                </button>
              </div>
            </div>
          )}
          {otp.error && (
            <div className="rounded-xl bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-600">{otp.error}</div>
          )}
        </div>
      )}

      {step === "newpw" && (
        <form onSubmit={handleResetSubmit} className="space-y-4">
          <p className="text-sm text-gray-500">새로 사용할 비밀번호를 입력해주세요.</p>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">새 비밀번호</label>
            <input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)}
              placeholder="8자 이상, 특수문자 포함" required minLength={8} className={inputCls} />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">비밀번호 확인</label>
            <input type="password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)}
              placeholder="비밀번호 재입력" required
              className={`w-full rounded-xl border px-4 py-3 text-sm outline-none focus:ring-2 transition-all ${
                confirmPw && newPw !== confirmPw
                  ? "border-red-300 bg-red-50 focus:border-red-400 focus:ring-red-100"
                  : "border-gray-200 bg-white focus:border-blue-500 focus:ring-blue-100"
              }`} />
            {confirmPw && newPw !== confirmPw && (
              <p className="mt-1 text-xs text-red-500">비밀번호가 일치하지 않습니다.</p>
            )}
          </div>
          {resetError && (
            <div className="rounded-xl bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-600">{resetError}</div>
          )}
          <div className="flex gap-3">
            <button type="button" onClick={() => { setStep("phone"); setResetError(null); }}
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
