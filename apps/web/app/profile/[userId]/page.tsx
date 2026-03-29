"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getUserProfile } from "@/lib/api";
import { AppShell } from "@/components/ui/AppShell";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const QA_QUESTIONS: Record<number, string> = {
  1:  "내 MBTI는?",
  2:  "나를 표현하는 해시태그 3개!",
  3:  "나의 최애 술과 주량은?",
  4:  "절대 포기 못하는 최애 안주 원픽!",
  5:  "쉬는 날엔 주로 뭘 하나요?",
  6:  "내 매력 포인트를 딱 한 단어로?",
  7:  "평소 연락 스타일은?",
  8:  "나의 이상형은?",
  9:  "선호하는 데이트 코스는?",
  10: "미팅에서 나의 포지션은?",
};

function mediaUrl(url: string | null | undefined) {
  if (!url) return null;
  return url.startsWith("http") ? url : `${BASE}${url}`;
}

type Profile = Awaited<ReturnType<typeof getUserProfile>>;

export default function UserProfilePage() {
  const params = useParams();
  const router = useRouter();
  const userId = Number(params.userId);

  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"photos" | "qa">("photos");
  const [selected, setSelected] = useState<{ photo_url: string; caption: string | null } | null>(null);

  useEffect(() => {
    getUserProfile(userId)
      .then(setProfile)
      .catch((e) => setError(e instanceof Error ? e.message : "프로필을 불러올 수 없습니다"))
      .finally(() => setLoading(false));
  }, [userId]);

  const qaAnswers: Record<string, string> = (() => {
    try { return profile?.qa_answers ? JSON.parse(profile.qa_answers) : {}; }
    catch { return {}; }
  })();

  const infoLine = [
    profile?.university,
    profile?.major,
    profile?.entry_label,
    profile?.age ? `${profile.age}세` : null,
  ].filter(Boolean).join(" · ");

  if (loading) {
    return (
      <AppShell>
        <div className="flex min-h-[60vh] items-center justify-center text-sm text-gray-400">
          로딩 중…
        </div>
      </AppShell>
    );
  }

  if (error || !profile) {
    return (
      <AppShell>
        <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
          <p className="text-sm text-red-500">{error ?? "프로필을 찾을 수 없습니다"}</p>
          <button onClick={() => router.back()} className="text-sm text-blue-600 underline">
            돌아가기
          </button>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-md">
        {/* 뒤로가기 */}
        <button
          onClick={() => router.back()}
          className="absolute left-4 top-[60px] z-10 flex h-11 w-11 items-center justify-center rounded-full bg-black/30 text-white backdrop-blur-sm active:bg-black/50"
        >
          ←
        </button>

        {/* ── 커버 + 프로필 사진 ── */}
        <div className="relative mb-3">
          <div className="h-36 w-full overflow-hidden bg-gray-200">
            {mediaUrl(profile.cover_url) ? (
              <img src={mediaUrl(profile.cover_url)!} alt="커버" className="h-full w-full object-cover" />
            ) : (
              <div className="h-full w-full bg-gradient-to-br from-blue-100 to-pink-100" />
            )}
          </div>

          <div className="absolute left-4" style={{ bottom: "-48px" }}>
            {mediaUrl(profile.photo_url_1) ? (
              <img
                src={mediaUrl(profile.photo_url_1)!}
                alt="프로필"
                className="h-24 w-24 rounded-full object-cover border-4 border-white shadow-md"
              />
            ) : (
              <div className="flex h-24 w-24 items-center justify-center rounded-full bg-gray-200 text-5xl border-4 border-white shadow-md">
                👤
              </div>
            )}
          </div>
        </div>

        <div className="h-14" />

        {/* ── 닉네임 + 정보 + 바이오 ── */}
        <div className="px-4 pb-4">
          <p className="text-xl font-black text-gray-900">{profile.nickname ?? "익명"}</p>
          {infoLine && <p className="mt-1 text-xs text-gray-400">{infoLine}</p>}
          {profile.bio_short && (
            <p className="mt-2 text-sm text-gray-600">{profile.bio_short}</p>
          )}
        </div>

        {/* ── 탭 바 ── */}
        <div className="flex border-t-2 border-gray-200">
          {(["photos", "qa"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${
                tab === t
                  ? "border-b-2 border-gray-900 text-gray-900"
                  : "text-gray-400 hover:text-gray-600"
              }`}
            >
              {t === "photos" ? "사진" : "10문 10답"}
            </button>
          ))}
        </div>

        {/* ── 사진 탭 ── */}
        {tab === "photos" && (
          <div className="px-0.5 pt-0.5">
            {profile.posts.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-16 text-gray-400">
                <span className="text-4xl">📷</span>
                <p className="text-sm">아직 올린 사진이 없습니다</p>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-0.5">
                {profile.posts.map((post) => (
                  <button
                    key={post.id}
                    onClick={() => setSelected(post)}
                    className="aspect-square overflow-hidden bg-gray-100"
                  >
                    <img src={mediaUrl(post.photo_url)!} alt="" className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── 10문 10답 탭 ── */}
        {tab === "qa" && (
          <div className="flex flex-col divide-y divide-gray-100">
            {Object.entries(QA_QUESTIONS).map(([n, q]) => {
              const answer = qaAnswers[n];
              if (!answer) return null;
              return (
                <div key={n} className="px-4 py-4">
                  <p className="mb-1 text-xs font-bold text-blue-500">Q{n}. {q}</p>
                  <p className="text-sm text-gray-800">{answer}</p>
                </div>
              );
            })}
            {Object.values(qaAnswers).every((v) => !v) && (
              <div className="flex flex-col items-center gap-2 py-16 text-gray-400">
                <span className="text-4xl">✏️</span>
                <p className="text-sm">아직 답변이 없습니다</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── 사진 상세 모달 ── */}
      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
          onClick={() => setSelected(null)}
        >
          <div className="relative w-full max-w-sm mx-4" onClick={(e) => e.stopPropagation()}>
            <img src={mediaUrl(selected.photo_url)!} alt="" className="w-full rounded-2xl object-contain max-h-[70vh]" />
            {selected.caption && (
              <p className="mt-2 text-center text-sm text-white/80">{selected.caption}</p>
            )}
            <button
              onClick={() => setSelected(null)}
              className="mt-4 w-full rounded-xl border border-white/30 py-2.5 text-sm font-semibold text-white hover:bg-white/10"
            >
              닫기
            </button>
          </div>
        </div>
      )}
    </AppShell>
  );
}
