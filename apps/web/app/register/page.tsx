"use client";

import { useState, FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { registerApi } from "@/lib/api";
import { setTokens } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

export default function RegisterPage() {
  const router = useRouter();
  const { refreshUser } = useAuth();

  const [form, setForm] = useState({
    email: "",
    password: "",
    passwordConfirm: "",
    phone: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (form.password !== form.passwordConfirm) {
      setError("비밀번호가 일치하지 않습니다");
      return;
    }
    if (form.password.length < 8) {
      setError("비밀번호는 8자 이상이어야 합니다");
      return;
    }
    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]/.test(form.password)) {
      setError("비밀번호에 특수문자를 1자 이상 포함해야 합니다");
      return;
    }

    setLoading(true);
    try {
      const tokens = await registerApi({
        email: form.email.trim().toLowerCase(),
        password: form.password,
        phone: form.phone.trim(),
      });
      setTokens(tokens.access_token, tokens.refresh_token);
      await refreshUser();
      // 회원가입 직후 프로필 입력으로 이동
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
          <Field label="이메일">
            <input
              type="email"
              value={form.email}
              onChange={set("email")}
              placeholder="example@university.ac.kr"
              required
              className={inputCls}
            />
          </Field>

          <Field label="전화번호" hint="010-0000-0000 형식">
            <input
              type="tel"
              value={form.phone}
              onChange={set("phone")}
              placeholder="010-0000-0000"
              required
              className={inputCls}
            />
          </Field>

          <Field label="비밀번호" hint="8자 이상, 특수문자 포함">
            <input
              type="password"
              value={form.password}
              onChange={set("password")}
              placeholder="비밀번호 (8자 이상, 특수문자 포함)"
              required
              className={inputCls}
            />
          </Field>

          <Field label="비밀번호 확인">
            <input
              type="password"
              value={form.passwordConfirm}
              onChange={set("passwordConfirm")}
              placeholder="비밀번호 재입력"
              required
              className={inputCls}
            />
          </Field>

          {error && (
            <div className="rounded-xl bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-600">
              {error}
            </div>
          )}

          {/* 약관 안내 */}
          <p className="text-xs text-gray-400 leading-relaxed">
            가입하면 MEETIN 이용약관 및 개인정보 처리방침에 동의하는 것으로 간주됩니다.
          </p>

          <button
            type="submit"
            disabled={loading}
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

// ─── 공통 인풋 스타일 ────────────────────────────────────

const inputCls =
  "w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all";

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
