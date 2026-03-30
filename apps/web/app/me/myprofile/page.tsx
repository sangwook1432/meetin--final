"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { AppShell } from "@/components/ui/AppShell";
import {
  getMyProfilePosts,
  uploadProfilePost,
  deleteProfilePost,
  updateProfile,
  uploadCoverPhoto,
  updateQA,
} from "@/lib/api";
import type { ProfilePost } from "@/types";

const QA_QUESTIONS = [
  { n: 1,  q: "내 MBTI는?",                     placeholder: "예: ENFP 댕댕이" },
  { n: 2,  q: "나를 표현하는 해시태그 3개!",       placeholder: "예: #맛집탐방 #칼답 #소주파" },
  { n: 3,  q: "나의 최애 술과 주량은?",            placeholder: "예: 하이볼 3잔 / 소주 2병" },
  { n: 4,  q: "절대 포기 못하는 최애 안주 원픽!",  placeholder: "예: 파인애플 샤베트 🍍" },
  { n: 5,  q: "쉬는 날엔 주로 뭘 하나요?",        placeholder: "예: 넷플릭스 정주행 / 롤 랭겜" },
  { n: 6,  q: "내 매력 포인트를 딱 한 단어로?",    placeholder: "예: 눈웃음 / 리액션 봇" },
  { n: 7,  q: "평소 연락 스타일은?",               placeholder: "예: 톡 칼답 / 전화 통화 선호" },
  { n: 8,  q: "나의 이상형은?",                   placeholder: "예: 예의 바른 사람 / 개그 코드 맞는 사람" },
  { n: 9,  q: "선호하는 데이트 코스는?",           placeholder: "예: 감성 카페 투어 / 방탈출" },
  { n: 10, q: "미팅에서 나의 포지션은?",           placeholder: "예: 텐션 끌어올려~ / 조용히 웃어주는 편" },
];

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

function avatarUrl(url: string | null | undefined) {
  if (!url) return null;
  return url.startsWith("http") ? url : `${BASE}${url}`;
}

export default function MyProfilePage() {
  const { user, refreshUser } = useAuth();

  // ── 게시물 상태 ──────────────────────────────────────
  const [posts, setPosts] = useState<ProfilePost[]>([]);
  const [postsLoading, setPostsLoading] = useState(true);

  // ── 바이오 인라인 편집 ────────────────────────────────
  const [editingBio, setEditingBio] = useState(false);
  const [bioValue, setBioValue] = useState(user?.bio_short ?? "");
  const [bioSaving, setBioSaving] = useState(false);

  // ── 탭 ────────────────────────────────────────────────
  const [tab, setTab] = useState<"photos" | "qa">("photos");

  // ── 선택된 사진 (상세 뷰) ─────────────────────────────
  const [selected, setSelected] = useState<ProfilePost | null>(null);

  useEffect(() => {
    document.body.style.overflow = selected ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [selected]);

  // ── 10문 10답 ─────────────────────────────────────────
  const [qaAnswers, setQaAnswers] = useState<Record<string, string>>({});
  const [editingQa, setEditingQa] = useState<number | null>(null);
  const [qaInput, setQaInput] = useState("");
  const [qaSaving, setQaSaving] = useState(false);

  // ── 게시물 업로드 ─────────────────────────────────────
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // ── 커버 업로드 ───────────────────────────────────────
  const coverInputRef = useRef<HTMLInputElement>(null);
  const [coverUploading, setCoverUploading] = useState(false);

  useEffect(() => {
    getMyProfilePosts()
      .then((res) => setPosts(res.posts))
      .catch(() => {})
      .finally(() => setPostsLoading(false));
  }, []);

  // qa_answers 파싱
  useEffect(() => {
    try {
      const parsed = user?.qa_answers ? JSON.parse(user.qa_answers) : {};
      setQaAnswers(parsed);
    } catch { setQaAnswers({}); }
  }, [user?.qa_answers]);

  // bio 편집 시 user 값으로 초기화
  useEffect(() => {
    if (!editingBio) setBioValue(user?.bio_short ?? "");
  }, [user?.bio_short, editingBio]);

  async function saveBio() {
    setBioSaving(true);
    try {
      await updateProfile({ bio_short: bioValue.trim() || undefined });
      await refreshUser?.();
      setEditingBio(false);
    } catch {
      /* ignore */
    } finally {
      setBioSaving(false);
    }
  }

  async function saveQaAnswer(n: number) {
    setQaSaving(true);
    const next = { ...qaAnswers, [String(n)]: qaInput.trim() };
    if (!qaInput.trim()) delete next[String(n)];
    try {
      await updateQA(next);
      setQaAnswers(next);
      setEditingQa(null);
    } catch { /* ignore */ } finally {
      setQaSaving(false);
    }
  }

  async function handleCoverChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setCoverUploading(true);
    try {
      await uploadCoverPhoto(file);
      await refreshUser();
    } catch { /* ignore */ } finally {
      setCoverUploading(false);
      e.target.value = "";
    }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(null);
    setUploading(true);
    try {
      const post = await uploadProfilePost(file);
      setPosts((prev) => [post, ...prev]);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "업로드 실패");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  async function handleDelete(post: ProfilePost) {
    if (!confirm("이 사진을 삭제할까요?")) return;
    try {
      await deleteProfilePost(post.id);
      setPosts((prev) => prev.filter((p) => p.id !== post.id));
      setSelected(null);
    } catch {
      alert("삭제 실패");
    }
  }

  const entryLabel = user?.entry_year
    ? `${String(user.entry_year).slice(-2)}학번`
    : null;

  const infoLine = [
    user?.university,
    user?.major,
    entryLabel,
    user?.age ? `${user.age}세` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <AppShell>
      <div className="mx-auto max-w-md">
        {/* ── 커버 + 프로필 사진 ──────────────────────── */}
        {/* 커버 영역 (h-36) + 프사 절반(h-12) 오버랩 → 아래 여백 h-12 */}
        <div className="relative mb-3">
          {/* 커버 사진 */}
          <button
            onClick={() => coverInputRef.current?.click()}
            className="relative block h-36 w-full overflow-hidden bg-gray-200"
          >
            {avatarUrl(user?.cover_url) ? (
              <img
                src={avatarUrl(user?.cover_url)!}
                alt="커버"
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center gap-2 text-gray-400">
                <span className="text-2xl">🖼️</span>
                <span className="text-sm">배경사진 추가</span>
              </div>
            )}
            {/* 커버 업로드 오버레이 */}
            {coverUploading && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                <span className="text-white text-sm">업로드 중…</span>
              </div>
            )}
            {/* 편집 버튼 (우측 하단) */}
            {!coverUploading && (
              <div className="absolute bottom-2 right-2 rounded-full bg-black/40 px-2.5 py-1 text-xs text-white">
                편집
              </div>
            )}
          </button>

          {/* 프로필 사진 — 커버 하단에서 절반 오버랩 */}
          <div className="absolute left-4" style={{ bottom: "-48px" }}>
            {avatarUrl(user?.photo_url_1) ? (
              <img
                src={avatarUrl(user?.photo_url_1)!}
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

        {/* 프사 오버랩 높이(h-12) 만큼 여백 확보 */}
        <div className="h-14" />

        {/* ── 닉네임 + 정보 + 자기소개 ────────────────── */}
        <div className="px-4 pb-4">
          <div>
            <p className="text-xl font-black text-gray-900">
              {user?.nickname ?? "닉네임 없음"}
            </p>
            {infoLine && (
              <p className="mt-1 text-xs text-gray-400">{infoLine}</p>
            )}
          </div>

          {/* 자기소개 */}
          <div className="mt-3">
            {editingBio ? (
              <div className="flex flex-col gap-2">
                <textarea
                  value={bioValue}
                  onChange={(e) => setBioValue(e.target.value)}
                  maxLength={40}
                  rows={2}
                  className="w-full resize-none rounded-xl border border-blue-300 bg-blue-50 px-3 py-2 text-base text-gray-900 outline-none focus:border-blue-500"
                  placeholder="자기소개를 입력하세요 (최대 40자)"
                  autoFocus
                />
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-400">{bioValue.length}/40</span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setEditingBio(false)}
                      className="rounded-lg border border-gray-200 px-3 py-1 text-xs text-gray-500 hover:bg-gray-50 active:bg-gray-100"
                    >
                      취소
                    </button>
                    <button
                      onClick={saveBio}
                      disabled={bioSaving}
                      className="rounded-lg bg-blue-600 px-3 py-1 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                      {bioSaving ? "저장 중…" : "저장"}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setEditingBio(true)}
                className="group flex w-full items-center gap-2 text-left"
              >
                <p className={`flex-1 text-sm ${user?.bio_short ? "text-gray-700" : "text-gray-400 italic"}`}>
                  {user?.bio_short ?? "자기소개를 입력해보세요…"}
                </p>
                <span className="shrink-0 text-xs text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity">
                  ✏️
                </span>
              </button>
            )}
          </div>
        </div>

        {/* ── 탭 바 ───────────────────────────────────── */}
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

        {/* ── 사진 탭 ─────────────────────────────────── */}
        {tab === "photos" && (
          <div className="px-0.5 pt-0.5">
            {uploadError && (
              <div className="mx-4 mb-2 rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-600">
                {uploadError}
              </div>
            )}
            {postsLoading ? (
              <div className="grid grid-cols-3 gap-0.5">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="aspect-square animate-pulse bg-gray-100" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-0.5">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="aspect-square flex items-center justify-center bg-gray-50 hover:bg-gray-100 transition-colors"
                >
                  {uploading ? (
                    <span className="text-2xl animate-spin">⏳</span>
                  ) : (
                    <span className="text-3xl text-gray-300">＋</span>
                  )}
                </button>
                {posts.map((post) => (
                  <button
                    key={post.id}
                    onClick={() => setSelected(post)}
                    className="aspect-square overflow-hidden bg-gray-100"
                  >
                    <img
                      src={avatarUrl(post.photo_url)!}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── 10문 10답 탭 ─────────────────────────────── */}
        {tab === "qa" && (
          <div className="flex flex-col divide-y divide-gray-100">
            {QA_QUESTIONS.map(({ n, q, placeholder }) => {
              const answer = qaAnswers[String(n)];
              const isEditing = editingQa === n;
              return (
                <div key={n} className="px-4 py-4">
                  <p className="mb-1.5 text-xs font-bold text-blue-500">Q{n}. {q}</p>
                  {isEditing ? (
                    <div className="flex flex-col gap-2">
                      <input
                        value={qaInput}
                        onChange={(e) => setQaInput(e.target.value)}
                        maxLength={100}
                        placeholder={placeholder}
                        className="w-full rounded-xl border border-blue-300 bg-blue-50 px-3 py-2 text-base text-gray-900 outline-none focus:border-blue-500"
                        autoFocus
                        onKeyDown={(e) => e.key === "Enter" && saveQaAnswer(n)}
                      />
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => setEditingQa(null)}
                          className="rounded-lg border border-gray-200 px-3 py-1 text-xs text-gray-500 hover:bg-gray-50 active:bg-gray-100"
                        >
                          취소
                        </button>
                        <button
                          onClick={() => saveQaAnswer(n)}
                          disabled={qaSaving}
                          className="rounded-lg bg-blue-600 px-3 py-1 text-xs font-bold text-white hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50"
                        >
                          {qaSaving ? "저장 중…" : "저장"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => { setQaInput(answer ?? ""); setEditingQa(n); }}
                      className="group flex w-full items-center gap-2 text-left"
                    >
                      <p className={`flex-1 text-sm ${answer ? "text-gray-800" : "text-gray-400 italic"}`}>
                        {answer ?? placeholder}
                      </p>
                      <span className="shrink-0 text-xs text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity">
                        ✏️
                      </span>
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png"
          className="hidden"
          onChange={handleFileChange}
        />
        <input
          ref={coverInputRef}
          type="file"
          accept="image/jpeg,image/png"
          className="hidden"
          onChange={handleCoverChange}
        />
      </div>

      {/* ── 사진 상세 모달 ───────────────────────────── */}
      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
          onClick={() => setSelected(null)}
        >
          <div
            className="relative w-full max-w-sm mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={avatarUrl(selected.photo_url)!}
              alt=""
              className="w-full rounded-2xl object-contain max-h-[70vh]"
            />
            {selected.caption && (
              <p className="mt-2 text-center text-sm text-white/80">{selected.caption}</p>
            )}
            <div className="mt-4 flex gap-3">
              <button
                onClick={() => setSelected(null)}
                className="flex-1 rounded-xl border border-white/30 py-2.5 text-sm font-semibold text-white hover:bg-white/10 active:bg-white/20"
              >
                닫기
              </button>
              <button
                onClick={() => handleDelete(selected)}
                className="flex-1 rounded-xl bg-red-500 py-2.5 text-sm font-bold text-white hover:bg-red-600 active:bg-red-700"
              >
                삭제
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
