"use client";

/**
 * /me/profile — 프로필 설정 페이지
 *
 * 온보딩 플로우 (?onboarding=1):
 *   회원가입 직후 이 페이지로 오면 "프로필 설정하기" 안내 표시
 *   저장 후 /me/docs 로 이동 (재학증명서 업로드 유도)
 *
 * 일반 접근:
 *   저장 후 /discover 로 이동
 *
 * 핵심 필드:
 *   gender — 이 값이 없으면 미팅 참가/조회 모두 불가 (백엔드 400)
 */

import { useState, useEffect, FormEvent, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { updateProfile } from "@/lib/api";
import { AppShell } from "@/components/ui/AppShell";
import type { Gender, LookalikeType } from "@/types";

const UNIVERSITIES = [
  "서울대학교", "연세대학교", "고려대학교", "성균관대학교", "한양대학교",
  "중앙대학교", "경희대학교", "한국외국어대학교", "이화여자대학교", "숙명여자대학교",
  "서강대학교", "숭실대학교", "건국대학교", "동국대학교", "홍익대학교",
  "국민대학교", "세종대학교", "단국대학교", "아주대학교", "인하대학교",
  "직접입력",
];

const AREAS = [
  "강남/서초", "홍대/마포", "신촌/이대", "건대/성수", "왕십리/용답",
  "종로/광화문", "이태원/한남", "잠실/송파", "여의도/영등포", "부천/인천",
  "분당/판교", "수원/용인", "기타",
];

export default function ProfilePage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center text-sm text-gray-400">로딩 중...</div>}>
      <ProfileInner />
    </Suspense>
  );
}

function ProfileInner() {
  const { user, refreshUser, loading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const isOnboarding = searchParams.get("onboarding") === "1";

  const [form, setForm] = useState({
    nickname: "",
    gender: "" as Gender | "",
    university: "",
    universityCustom: "",
    major: "",
    entry_year: "",
    age: "",
    preferred_area: "",
    bio_short: "",
    lookalike_type: "" as LookalikeType | "",
    lookalike_value: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // 기존 프로필로 폼 초기화
  useEffect(() => {
    if (!user) return;
    const uni = UNIVERSITIES.includes(user.university ?? "")
      ? (user.university ?? "")
      : user.university
      ? "직접입력"
      : "";
    setForm({
      nickname: user.nickname ?? "",
      gender: user.gender ?? "",
      university: uni,
      universityCustom: !UNIVERSITIES.includes(user.university ?? "") ? (user.university ?? "") : "",
      major: user.major ?? "",
      entry_year: user.entry_year?.toString() ?? "",
      age: user.age?.toString() ?? "",
      preferred_area: user.preferred_area ?? "",
      bio_short: user.bio_short ?? "",
      lookalike_type: user.lookalike_type ?? "",
      lookalike_value: user.lookalike_value ?? "",
    });
  }, [user]);

  const set = (k: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!form.gender) { setError("성별은 필수입니다"); return; }
    if (!form.university && !form.universityCustom) { setError("학교를 입력해주세요"); return; }

    setSaving(true);
    try {
      const finalUni = form.university === "직접입력" ? form.universityCustom : form.university;
      await updateProfile({
        nickname: form.nickname || undefined,
        gender: form.gender as Gender,
        university: finalUni || undefined,
        major: form.major || undefined,
        entry_year: form.entry_year ? Number(form.entry_year) : undefined,
        age: form.age ? Number(form.age) : undefined,
        preferred_area: form.preferred_area || undefined,
        bio_short: form.bio_short || undefined,
        lookalike_type: (form.lookalike_type as LookalikeType) || undefined,
        lookalike_value: form.lookalike_value || undefined,
      });
      await refreshUser();
      setSuccess(true);
      setTimeout(() => {
        router.push(isOnboarding ? "/me/docs?onboarding=1" : "/discover");
      }, 800);
    } catch (err) {
      setError(err instanceof Error ? err.message : "저장 실패");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="flex min-h-screen items-center justify-center text-sm text-gray-400">로딩 중...</div>;

  return (
    <AppShell>
      <div className="mx-auto max-w-md px-4 py-6">
        {/* 온보딩 배너 */}
        {isOnboarding && (
          <div className="mb-6 rounded-2xl bg-blue-50 border border-blue-100 p-4">
            <p className="font-semibold text-blue-800 text-sm">프로필을 설정해주세요 👋</p>
            <p className="mt-1 text-xs text-blue-600">
              성별과 학교 정보를 입력해야 미팅에 참가할 수 있습니다.
            </p>
            <div className="mt-3 flex gap-1 text-xs text-blue-500">
              <span className="font-bold">1. 프로필 입력</span>
              <span>→</span>
              <span>2. 재학증명서 업로드</span>
              <span>→</span>
              <span>3. 미팅 참가</span>
            </div>
          </div>
        )}

        <h2 className="mb-5 text-lg font-bold text-gray-900">내 프로필</h2>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* 성별 — 필수 */}
          <section className="rounded-2xl bg-white border border-gray-100 p-4 shadow-sm">
            <SectionTitle required>성별</SectionTitle>
            <div className="mt-3 flex gap-3">
              {(["MALE", "FEMALE"] as Gender[]).map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, gender: g }))}
                  className={`flex-1 rounded-xl py-3 text-sm font-semibold border-2 transition-all ${
                    form.gender === g
                      ? g === "MALE"
                        ? "border-blue-500 bg-blue-50 text-blue-700"
                        : "border-pink-500 bg-pink-50 text-pink-700"
                      : "border-gray-200 text-gray-500 hover:border-gray-300"
                  }`}
                >
                  {g === "MALE" ? "👨 남성" : "👩 여성"}
                </button>
              ))}
            </div>
          </section>

          {/* 기본 정보 */}
          <section className="rounded-2xl bg-white border border-gray-100 p-4 shadow-sm space-y-4">
            <SectionTitle>기본 정보</SectionTitle>

            <FormField label="닉네임">
              <input type="text" value={form.nickname} onChange={set("nickname")}
                placeholder="닉네임 (선택)" maxLength={50} className={inputCls} />
            </FormField>

            <FormField label="학교" required>
              <select value={form.university} onChange={set("university")} className={inputCls}>
                <option value="">학교 선택</option>
                {UNIVERSITIES.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
              {form.university === "직접입력" && (
                <input type="text" value={form.universityCustom} onChange={set("universityCustom")}
                  placeholder="학교명 직접 입력" className={`${inputCls} mt-2`} />
              )}
            </FormField>

            <div className="grid grid-cols-2 gap-3">
              <FormField label="학과">
                <input type="text" value={form.major} onChange={set("major")}
                  placeholder="예) 컴퓨터공학과" className={inputCls} />
              </FormField>
              <FormField label="학번 (2자리)">
                <input type="number" value={form.entry_year} onChange={set("entry_year")}
                  placeholder="예) 24" min={0} max={99} className={inputCls} />
              </FormField>
            </div>

            <FormField label="나이">
              <input type="number" value={form.age} onChange={set("age")}
                placeholder="나이" min={18} max={40} className={inputCls} />
            </FormField>
          </section>

          {/* 미팅 선호 정보 */}
          <section className="rounded-2xl bg-white border border-gray-100 p-4 shadow-sm space-y-4">
            <SectionTitle>미팅 선호 정보</SectionTitle>

            <FormField label="선호 지역">
              <select value={form.preferred_area} onChange={set("preferred_area")} className={inputCls}>
                <option value="">지역 선택</option>
                {AREAS.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </FormField>

            <FormField label="한줄 소개" hint="최대 40자">
              <input type="text" value={form.bio_short} onChange={set("bio_short")}
                placeholder="나를 표현하는 한 줄" maxLength={40} className={inputCls} />
              <p className="mt-1 text-right text-xs text-gray-400">{form.bio_short.length}/40</p>
            </FormField>

            <FormField label="닮은꼴 유형">
              <div className="flex gap-3">
                {(["CELEB", "ANIMAL"] as LookalikeType[]).map((t) => (
                  <button key={t} type="button"
                    onClick={() => setForm((f) => ({ ...f, lookalike_type: t }))}
                    className={`flex-1 rounded-xl py-2.5 text-sm border-2 transition-all ${
                      form.lookalike_type === t
                        ? "border-blue-500 bg-blue-50 text-blue-700 font-semibold"
                        : "border-gray-200 text-gray-500"
                    }`}
                  >
                    {t === "CELEB" ? "🌟 연예인" : "🐾 동물"}
                  </button>
                ))}
              </div>
            </FormField>

            {form.lookalike_type && (
              <FormField label="닮은꼴 이름">
                <input type="text" value={form.lookalike_value} onChange={set("lookalike_value")}
                  placeholder={form.lookalike_type === "CELEB" ? "예) 아이유" : "예) 강아지"}
                  maxLength={60} className={inputCls} />
              </FormField>
            )}
          </section>

          {error && (
            <div className="rounded-xl bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-600">
              {error}
            </div>
          )}
          {success && (
            <div className="rounded-xl bg-emerald-50 border border-emerald-100 px-4 py-3 text-sm text-emerald-700">
              ✅ 저장되었습니다!
            </div>
          )}

          <button type="submit" disabled={saving}
            className="w-full rounded-xl bg-blue-600 py-3.5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50 active:scale-95 transition-all">
            {saving ? "저장 중..." : isOnboarding ? "저장하고 다음 단계로 →" : "저장"}
          </button>
        </form>
      </div>
    </AppShell>
  );
}

// ─── 공통 컴포넌트 ────────────────────────────────────────

const inputCls = "w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100 transition-all";

function SectionTitle({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <p className="text-sm font-semibold text-gray-700">
      {children}
      {required && <span className="ml-1 text-red-500">*</span>}
    </p>
  );
}

function FormField({ label, hint, required, children }: {
  label: string; hint?: string; required?: boolean; children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline gap-1.5">
        <label className="text-xs font-medium text-gray-600">{label}</label>
        {required && <span className="text-red-500 text-xs">*</span>}
        {hint && <span className="text-xs text-gray-400">{hint}</span>}
      </div>
      {children}
    </div>
  );
}
