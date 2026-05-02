"use client";

/**
 * /me/myprofile — V1 내 프로필 (메인 탭)
 *
 * 기능:
 *  1. 커버 사진 + 아바타 오버랩 (편집 가능)
 *  2. 닉네임 + 학교/학과/학번/나이
 *  3. 자기소개 인라인 편집
 *  4. 탭: 사진 / 10문 10답
 *  5. 사진 그리드 (추가 업로드, 클릭 시 상세 모달, 삭제)
 *  6. Q&A 인라인 편집
 */

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

  const [posts, setPosts] = useState<ProfilePost[]>([]);
  const [postsLoading, setPostsLoading] = useState(true);

  const [editingBio, setEditingBio] = useState(false);
  const [bioValue, setBioValue] = useState(user?.bio_short ?? "");
  const [bioSaving, setBioSaving] = useState(false);

  const [tab, setTab] = useState<"photos" | "qa">("photos");

  const [selected, setSelected] = useState<ProfilePost | null>(null);

  useEffect(() => {
    document.body.style.overflow = selected ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [selected]);

  const [qaAnswers, setQaAnswers] = useState<Record<string, string>>({});
  const [editingQa, setEditingQa] = useState<number | null>(null);
  const [qaInput, setQaInput] = useState("");
  const [qaSaving, setQaSaving] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const coverInputRef = useRef<HTMLInputElement>(null);
  const [coverUploading, setCoverUploading] = useState(false);

  useEffect(() => {
    getMyProfilePosts()
      .then((res) => setPosts(res.posts))
      .catch(() => {})
      .finally(() => setPostsLoading(false));
  }, []);

  useEffect(() => {
    try {
      const parsed = user?.qa_answers ? JSON.parse(user.qa_answers) : {};
      setQaAnswers(parsed);
    } catch { setQaAnswers({}); }
  }, [user?.qa_answers]);

  useEffect(() => {
    if (!editingBio) setBioValue(user?.bio_short ?? "");
  }, [user?.bio_short, editingBio]);

  async function saveBio() {
    setBioSaving(true);
    try {
      await updateProfile({ bio_short: bioValue.trim() || undefined });
      await refreshUser?.();
      setEditingBio(false);
    } catch { /* ignore */ } finally { setBioSaving(false); }
  }

  async function saveQaAnswer(n: number) {
    setQaSaving(true);
    const next = { ...qaAnswers, [String(n)]: qaInput.trim() };
    if (!qaInput.trim()) delete next[String(n)];
    try {
      await updateQA(next);
      setQaAnswers(next);
      setEditingQa(null);
    } catch { /* ignore */ } finally { setQaSaving(false); }
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
    } catch { alert("삭제 실패"); }
  }

  const entryLabel = user?.entry_year ? `${String(user.entry_year).slice(-2)}학번` : null;
  const infoLine = [
    user?.university,
    user?.major,
    entryLabel,
    user?.age ? `${user.age}세` : null,
  ].filter(Boolean).join(" · ");

  const coverUrl = avatarUrl(user?.cover_url);
  const photoUrl = avatarUrl(user?.photo_url_1);

  return (
    <AppShell>
      <div className="mx-auto max-w-md">
        {/* 커버 + 프로필 사진 */}
        <div className="relative">
          <button
            onClick={() => coverInputRef.current?.click()}
            className="relative block w-full overflow-hidden"
            style={{
              height: 144,
              background: coverUrl
                ? "transparent"
                : "linear-gradient(135deg, var(--accent-soft) 0%, oklch(0.88 0.06 18) 50%, oklch(0.84 0.05 250) 100%)",
            }}
          >
            {coverUrl ? (
              <img src={coverUrl} alt="커버" className="h-full w-full object-cover" />
            ) : (
              <div
                className="flex h-full w-full items-center justify-center gap-2"
                style={{ color: "var(--ink-mid)" }}
              >
                <span className="text-2xl">🖼️</span>
                <span className="text-sm font-semibold">배경사진 추가</span>
              </div>
            )}
            {coverUploading && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                <span className="text-white text-sm">업로드 중…</span>
              </div>
            )}
            {!coverUploading && (
              <div
                className="absolute font-semibold"
                style={{
                  bottom: 8, right: 10,
                  background: "rgba(0,0,0,0.4)",
                  color: "#fff",
                  padding: "4px 10px",
                  borderRadius: 999,
                  fontSize: 11,
                  letterSpacing: "-0.01em",
                }}
              >
                편집
              </div>
            )}
          </button>

          {/* 아바타 오버랩 */}
          <div className="absolute" style={{ left: 16, bottom: -48 }}>
            <div
              style={{
                width: 96, height: 96,
                borderRadius: "50%",
                border: "4px solid var(--surface)",
                boxShadow: "var(--shadow-md)",
                overflow: "hidden",
                background: "var(--surface-muted)",
              }}
            >
              {photoUrl ? (
                <img src={photoUrl} alt="프로필" className="h-full w-full object-cover" />
              ) : (
                <div
                  className="flex h-full w-full items-center justify-center"
                  style={{ fontSize: 40, background: "var(--surface-muted)" }}
                >
                  👤
                </div>
              )}
            </div>
          </div>
        </div>

        <div style={{ height: 56 }} />

        {/* 닉네임 + 정보 + 자기소개 */}
        <div className="px-5 pb-4">
          <p
            className="font-extrabold"
            style={{ fontSize: 22, color: "var(--ink)", letterSpacing: "-0.03em" }}
          >
            {user?.nickname ?? "닉네임 없음"}
          </p>
          {infoLine && (
            <p className="mt-1" style={{ fontSize: 12, color: "var(--ink-soft)" }}>
              {infoLine}
            </p>
          )}

          {/* 자기소개 */}
          <div className="mt-3">
            {editingBio ? (
              <div className="flex flex-col gap-2">
                <textarea
                  value={bioValue}
                  onChange={(e) => setBioValue(e.target.value)}
                  maxLength={40}
                  rows={2}
                  className="w-full resize-none px-3 py-2 outline-none"
                  style={{
                    fontSize: 14,
                    background: "var(--accent-soft)",
                    border: "1px solid var(--accent)",
                    color: "var(--ink)",
                    borderRadius: "var(--radius-md)",
                    fontFamily: "var(--font-sans)",
                    letterSpacing: "-0.01em",
                  }}
                  placeholder="자기소개를 입력하세요 (최대 40자)"
                  autoFocus
                />
                <div className="flex items-center justify-between">
                  <span className="text-xs" style={{ color: "var(--ink-soft)" }}>{bioValue.length}/40</span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setEditingBio(false)}
                      className="px-3 py-1 text-xs"
                      style={{
                        border: "1px solid var(--border)",
                        color: "var(--ink-mid)",
                        borderRadius: "var(--radius-sm)",
                      }}
                    >
                      취소
                    </button>
                    <button
                      onClick={saveBio}
                      disabled={bioSaving}
                      className="px-3 py-1 text-xs font-bold text-white disabled:opacity-50"
                      style={{ background: "var(--accent)", borderRadius: "var(--radius-sm)" }}
                    >
                      {bioSaving ? "저장 중…" : "저장"}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setEditingBio(true)}
                className="group flex w-full items-start gap-2 text-left"
              >
                <p
                  className="flex-1"
                  style={{
                    fontSize: 14,
                    lineHeight: 1.5,
                    color: user?.bio_short ? "var(--ink-mid)" : "var(--ink-soft)",
                    fontStyle: user?.bio_short ? "normal" : "italic",
                    letterSpacing: "-0.01em",
                  }}
                >
                  {user?.bio_short ?? "자기소개를 입력해보세요…"}
                </p>
                <span
                  className="shrink-0 transition-opacity opacity-0 group-hover:opacity-100"
                  style={{ fontSize: 12, color: "var(--ink-soft)" }}
                >
                  ✏️
                </span>
              </button>
            )}
          </div>
        </div>

        {/* 탭 바 */}
        <div
          className="flex"
          style={{ borderTop: "2px solid var(--border)" }}
        >
          {(["photos", "qa"] as const).map((t) => {
            const on = tab === t;
            return (
              <button
                key={t}
                onClick={() => setTab(t)}
                className="flex-1 py-3 font-bold transition-colors"
                style={{
                  fontSize: 13,
                  color: on ? "var(--ink)" : "var(--ink-soft)",
                  borderBottom: `2px solid ${on ? "var(--ink)" : "transparent"}`,
                  letterSpacing: "-0.01em",
                }}
              >
                {t === "photos" ? "사진" : "10문 10답"}
              </button>
            );
          })}
        </div>

        {/* 사진 탭 */}
        {tab === "photos" && (
          <div>
            {uploadError && (
              <div
                className="mx-4 mt-3 px-3 py-2"
                style={{
                  background: "var(--danger-soft)",
                  border: "1px solid var(--danger)",
                  color: "var(--danger)",
                  fontSize: 12,
                  borderRadius: "var(--radius-md)",
                }}
              >
                {uploadError}
              </div>
            )}
            {postsLoading ? (
              <div className="grid grid-cols-3 gap-0.5 mt-0.5">
                {[...Array(6)].map((_, i) => (
                  <div
                    key={i}
                    className="aspect-square animate-pulse"
                    style={{ background: "var(--surface-muted)" }}
                  />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-0.5 mt-0.5">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="aspect-square flex items-center justify-center transition-colors"
                  style={{
                    background: "var(--surface-muted)",
                    color: "var(--ink-soft)",
                    fontSize: 32,
                    fontWeight: 200,
                  }}
                >
                  {uploading ? (
                    <span className="animate-spin" style={{ fontSize: 24 }}>⏳</span>
                  ) : "＋"}
                </button>
                {posts.map((post) => (
                  <button
                    key={post.id}
                    onClick={() => setSelected(post)}
                    className="aspect-square overflow-hidden"
                    style={{ background: "var(--surface-muted)" }}
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

        {/* Q&A 탭 */}
        {tab === "qa" && (
          <div>
            {QA_QUESTIONS.map(({ n, q, placeholder }, i) => {
              const answer = qaAnswers[String(n)];
              const isEditing = editingQa === n;
              return (
                <div
                  key={n}
                  className="px-5 py-4"
                  style={{
                    borderBottom: i < QA_QUESTIONS.length - 1 ? "1px solid var(--border)" : "none",
                  }}
                >
                  <p
                    className="mb-2 font-extrabold"
                    style={{
                      fontSize: 11,
                      color: "var(--accent)",
                      letterSpacing: "-0.01em",
                    }}
                  >
                    Q{n}. {q}
                  </p>
                  {isEditing ? (
                    <div className="flex flex-col gap-2">
                      <input
                        value={qaInput}
                        onChange={(e) => setQaInput(e.target.value)}
                        maxLength={100}
                        placeholder={placeholder}
                        className="w-full px-3 py-2 outline-none"
                        style={{
                          fontSize: 14,
                          background: "var(--accent-soft)",
                          border: "1px solid var(--accent)",
                          color: "var(--ink)",
                          borderRadius: "var(--radius-md)",
                          fontFamily: "var(--font-sans)",
                        }}
                        autoFocus
                        onKeyDown={(e) => e.key === "Enter" && saveQaAnswer(n)}
                      />
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => setEditingQa(null)}
                          className="px-3 py-1 text-xs"
                          style={{
                            border: "1px solid var(--border)",
                            color: "var(--ink-mid)",
                            borderRadius: "var(--radius-sm)",
                          }}
                        >
                          취소
                        </button>
                        <button
                          onClick={() => saveQaAnswer(n)}
                          disabled={qaSaving}
                          className="px-3 py-1 text-xs font-bold text-white disabled:opacity-50"
                          style={{ background: "var(--accent)", borderRadius: "var(--radius-sm)" }}
                        >
                          {qaSaving ? "저장 중…" : "저장"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => { setQaInput(answer ?? ""); setEditingQa(n); }}
                      className="group flex w-full items-start gap-2 text-left"
                    >
                      <p
                        className="flex-1"
                        style={{
                          fontSize: 14,
                          lineHeight: 1.5,
                          color: answer ? "var(--ink)" : "var(--ink-soft)",
                          fontStyle: answer ? "normal" : "italic",
                          letterSpacing: "-0.01em",
                        }}
                      >
                        {answer ?? "아직 답변하지 않았어요"}
                      </p>
                      <span
                        className="shrink-0 transition-opacity opacity-0 group-hover:opacity-100"
                        style={{ fontSize: 12, color: "var(--ink-soft)" }}
                      >
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

      {/* 사진 상세 모달 */}
      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 animate-fade-in"
          onClick={() => setSelected(null)}
        >
          <div className="relative w-full max-w-sm mx-4" onClick={(e) => e.stopPropagation()}>
            <img
              src={avatarUrl(selected.photo_url)!}
              alt=""
              className="w-full object-contain max-h-[70vh]"
              style={{ borderRadius: "var(--radius-lg)" }}
            />
            {selected.caption && (
              <p className="mt-2 text-center text-sm" style={{ color: "rgba(255,255,255,0.85)" }}>
                {selected.caption}
              </p>
            )}
            <div className="mt-4 flex gap-3">
              <button
                onClick={() => setSelected(null)}
                className="flex-1 py-2.5 text-sm font-semibold text-white"
                style={{
                  border: "1px solid rgba(255,255,255,0.3)",
                  borderRadius: "var(--radius-md)",
                }}
              >
                닫기
              </button>
              <button
                onClick={() => handleDelete(selected)}
                className="flex-1 py-2.5 text-sm font-bold text-white"
                style={{ background: "var(--danger)", borderRadius: "var(--radius-md)" }}
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
