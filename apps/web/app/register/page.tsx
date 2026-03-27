"use client";

import { useState, FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { registerApi, sendPhoneOtp, verifyPhoneOtp, getPhoneTokenInfo } from "@/lib/api";
import { setTokens } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

export default function RegisterPage() {
  const router = useRouter();
  const { refreshUser } = useAuth();

  const [form, setForm] = useState({
    username: "",
    phone: "",
    otpCode: "",
    password: "",
    passwordConfirm: "",
    // KG이니시스 mock 입력 (계약 전 테스트용)
    mockName: "",
    mockBirthDate: "",   // YYYYMMDD
    mockGender: "",      // "M" | "F"
  });
  const [phoneToken, setPhoneToken] = useState<string | null>(null);
  const [otpSent, setOtpSent] = useState(false);
  const [phoneVerified, setPhoneVerified] = useState(false);

  // 본인인증 완료 후 자동완성 데이터
  const [verifiedInfo, setVerifiedInfo] = useState<{
    name: string | null;
    age: number | null;
    phone: string | null;
  } | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [otpLoading, setOtpLoading] = useState(false);
  const [verifyLoading, setVerifyLoading] = useState(false);

  const [agreedTerms, setAgreedTerms] = useState(false);
  const [agreedPrivacy, setAgreedPrivacy] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [showPwConfirm, setShowPwConfirm] = useState(false);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  // 인증번호 발송
  const handleSendOtp = async () => {
    setError(null);
    if (!form.phone.trim()) {
      setError("전화번호를 입력해주세요.");
      return;
    }
    setOtpLoading(true);
    try {
      await sendPhoneOtp(form.phone.trim());
      setOtpSent(true);
      setPhoneVerified(false);
      setPhoneToken(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "인증번호 발송 실패");
    } finally {
      setOtpLoading(false);
    }
  };

  // OTP 인증
  const handleVerifyOtp = async () => {
    setError(null);
    if (!form.otpCode.trim()) {
      setError("인증번호를 입력해주세요.");
      return;
    }
    setVerifyLoading(true);
    try {
      const mock = (form.mockName || form.mockBirthDate || form.mockGender)
        ? { name: form.mockName || undefined, birth_date: form.mockBirthDate || undefined, gender: form.mockGender || undefined }
        : undefined;

      const { phone_token } = await verifyPhoneOtp(form.phone.trim(), form.otpCode.trim(), mock);
      setPhoneToken(phone_token);
      setPhoneVerified(true);

      // 인증 완료 후 자동완성 데이터 조회
      const info = await getPhoneTokenInfo(phone_token);
      if (info.name || info.age) {
        setVerifiedInfo({ name: info.name, age: info.age, phone: info.phone });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "인증 실패");
    } finally {
      setVerifyLoading(false);
    }
  };

  // 회원가입 제출
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!phoneVerified || !phoneToken) {
      setError("전화번호 인증을 완료해주세요.");
      return;
    }
    if (!agreedTerms || !agreedPrivacy) {
      setError("이용약관 및 개인정보처리방침에 동의해주세요.");
      return;
    }
    if (form.password !== form.passwordConfirm) {
      setError("비밀번호가 일치하지 않습니다.");
      return;
    }
    if (form.password.length < 8) {
      setError("비밀번호는 8자 이상이어야 합니다.");
      return;
    }
    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]/.test(form.password)) {
      setError("비밀번호에 특수문자를 1자 이상 포함해야 합니다.");
      return;
    }

    setLoading(true);
    try {
      const tokens = await registerApi({
        username: form.username.trim().toLowerCase(),
        password: form.password,
        phone_token: phoneToken,
      });
      setTokens(tokens.access_token);
      await refreshUser();
      router.replace("/me/profile?onboarding=1");
    } catch (err) {
      setError(err instanceof Error ? err.message : "회원가입 실패");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-5 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-black tracking-tight text-gray-900">
            MEETIN<span className="text-blue-600">.</span>
          </h1>
          <p className="mt-2 text-sm text-gray-500">회원가입</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* 아이디 */}
          <Field label="아이디" hint="영문, 숫자, _ - . 사용 가능">
            <input
              type="text"
              value={form.username}
              onChange={set("username")}
              placeholder="3자 이상, 영문 소문자 권장"
              required
              className={inputCls}
            />
          </Field>

          {/* KG이니시스 mock 본인인증 입력 (계약 전 테스트용) */}
          {!phoneVerified && (
            <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 px-4 py-3 space-y-2">
              <p className="text-xs font-semibold text-gray-500">본인인증 정보 (KG이니시스 mock)</p>
              <input
                type="text"
                value={form.mockName}
                onChange={set("mockName")}
                placeholder="이름 (예: 홍길동)"
                className={`${inputCls} text-xs py-2`}
              />
              <input
                type="text"
                value={form.mockBirthDate}
                onChange={set("mockBirthDate")}
                placeholder="생년월일 8자리 (예: 19990101)"
                maxLength={8}
                className={`${inputCls} text-xs py-2`}
              />
              <select
                value={form.mockGender}
                onChange={(e) => setForm((f) => ({ ...f, mockGender: e.target.value }))}
                className={`${inputCls} text-xs py-2`}
              >
                <option value="">성별 선택</option>
                <option value="M">남성</option>
                <option value="F">여성</option>
              </select>
            </div>
          )}

          {/* 전화번호 + OTP 발송 */}
          <Field label="전화번호">
            <div className="flex gap-2">
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => {
                  set("phone")(e);
                  setOtpSent(false);
                  setPhoneVerified(false);
                  setPhoneToken(null);
                  setVerifiedInfo(null);
                }}
                placeholder="01000000000"
                required
                disabled={phoneVerified}
                className={`${inputCls} flex-1 ${phoneVerified ? "bg-gray-50 text-gray-400" : ""}`}
              />
              <button
                type="button"
                onClick={handleSendOtp}
                disabled={otpLoading || phoneVerified}
                className="shrink-0 rounded-xl bg-gray-800 px-4 py-3 text-xs font-bold text-white hover:bg-gray-700 disabled:opacity-40 transition-all"
              >
                {otpLoading ? "발송중" : otpSent ? "재발송" : "인증번호 발송"}
              </button>
            </div>
          </Field>

          {/* OTP 입력 — 발송 후 표시 */}
          {otpSent && !phoneVerified && (
            <Field label="인증번호">
              <div className="flex gap-2">
                <input
                  type="text"
                  inputMode="numeric"
                  value={form.otpCode}
                  onChange={set("otpCode")}
                  placeholder="6자리 입력"
                  maxLength={6}
                  className={`${inputCls} flex-1`}
                />
                <button
                  type="button"
                  onClick={handleVerifyOtp}
                  disabled={verifyLoading}
                  className="shrink-0 rounded-xl bg-blue-600 px-4 py-3 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-40 transition-all"
                >
                  {verifyLoading ? "확인중" : "인증하기"}
                </button>
              </div>
            </Field>
          )}

          {/* 인증 완료 + 자동완성 정보 */}
          {phoneVerified && (
            <div className="rounded-xl bg-emerald-50 border border-emerald-100 px-4 py-3 space-y-1">
              <div className="flex items-center gap-2 text-sm text-emerald-700">
                <span className="font-bold">✓</span> 본인인증 완료
              </div>
              {verifiedInfo && (
                <div className="mt-2 grid grid-cols-3 gap-2">
                  <div className="rounded-lg bg-white border border-emerald-100 px-3 py-2 text-center">
                    <p className="text-xs text-gray-400">이름</p>
                    <p className="text-sm font-semibold text-gray-900">{verifiedInfo.name ?? "—"}</p>
                  </div>
                  <div className="rounded-lg bg-white border border-emerald-100 px-3 py-2 text-center">
                    <p className="text-xs text-gray-400">나이</p>
                    <p className="text-sm font-semibold text-gray-900">{verifiedInfo.age != null ? `${verifiedInfo.age}세` : "—"}</p>
                  </div>
                  <div className="rounded-lg bg-white border border-emerald-100 px-3 py-2 text-center">
                    <p className="text-xs text-gray-400">전화번호</p>
                    <p className="text-sm font-semibold text-gray-900">{form.phone}</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 비밀번호 */}
          <Field label="비밀번호" hint="8자 이상, 특수문자 포함">
            <div className="relative">
              <input
                type={showPw ? "text" : "password"}
                value={form.password}
                onChange={set("password")}
                placeholder="비밀번호 (8자 이상, 특수문자 포함)"
                required
                className={`${inputCls} pr-11`}
              />
              <button
                type="button"
                onClick={() => setShowPw((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showPw ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>
          </Field>

          <Field label="비밀번호 확인">
            <div className="relative">
              <input
                type={showPwConfirm ? "text" : "password"}
                value={form.passwordConfirm}
                onChange={set("passwordConfirm")}
                placeholder="비밀번호 재입력"
                required
                className={`${inputCls} pr-11`}
              />
              <button
                type="button"
                onClick={() => setShowPwConfirm((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showPwConfirm ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>
          </Field>

          {error && (
            <div className="rounded-xl bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-600">
              {error}
            </div>
          )}

          {/* 약관 동의 */}
          <div className="space-y-2.5 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={agreedTerms}
                onChange={(e) => setAgreedTerms(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-blue-600 cursor-pointer"
              />
              <span className="text-xs text-gray-600 leading-relaxed">
                <span className="font-medium text-gray-800">[필수]</span>{" "}
                <Link href="/terms" target="_blank" className="underline hover:text-blue-500">이용약관</Link>
                {" "}(지갑 충전·환불 규정 포함)에 동의합니다.
              </span>
            </label>
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={agreedPrivacy}
                onChange={(e) => setAgreedPrivacy(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-blue-600 cursor-pointer"
              />
              <span className="text-xs text-gray-600 leading-relaxed">
                <span className="font-medium text-gray-800">[필수]</span>{" "}
                <Link href="/privacy" target="_blank" className="underline hover:text-blue-500">개인정보처리방침</Link>
                에 동의합니다.
              </span>
            </label>
          </div>

          <button
            type="submit"
            disabled={loading || !phoneVerified}
            className="w-full rounded-xl bg-blue-600 py-3.5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50 active:scale-95 transition-all"
          >
            {loading ? "처리 중..." : "회원가입"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-gray-500">
          이미 계정이 있으신가요?{" "}
          <Link href="/login" className="font-semibold text-blue-600 hover:underline">
            로그인
          </Link>
        </p>
      </div>
    </div>
  );
}

const inputCls =
  "w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all";

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

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline gap-2">
        <label className="text-sm font-medium text-gray-700">{label}</label>
        {hint && <span className="text-xs text-gray-400">{hint}</span>}
      </div>
      {children}
    </div>
  );
}
