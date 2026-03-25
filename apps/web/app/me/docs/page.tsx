"use client";

/**
 * /me/docs — 재학증명서 업로드 페이지
 *
 * JPG/PNG/PDF 파일을 직접 업로드하는 방식으로 변경.
 * 백엔드 /me/docs/upload (multipart/form-data) 호출.
 */

import { Suspense, useState, useRef, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { uploadDocFile } from "@/lib/api";
import { AppShell } from "@/components/ui/AppShell";
import type { DocType } from "@/types";

const DOC_LABELS: Record<DocType, string> = {
  ENROLLMENT_CERT: "재학증명서",
  STUDENT_ID: "학생증",
};

function DocsInner() {
  const { user, refreshUser } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const isOnboarding = searchParams.get("onboarding") === "1";

  const [docType, setDocType] = useState<DocType>("ENROLLMENT_CERT");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 서류 제출 여부: localStorage 기반으로 페이지 이동 후에도 유지
  const docPendingKey = user ? `doc_pending_${user.id}` : null;
  const [docSubmitted, setDocSubmitted] = useState(() => {
    if (typeof window === "undefined" || !user) return false;
    return localStorage.getItem(`doc_pending_${user.id}`) === "1";
  });

  // VERIFIED/REJECTED 확정 시 플래그 정리
  useEffect(() => {
    if (!docPendingKey) return;
    if (user?.verification_status === "VERIFIED" || user?.verification_status === "REJECTED") {
      localStorage.removeItem(docPendingKey);
      setDocSubmitted(false);
    }
  }, [user?.verification_status, docPendingKey]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setError(null);

    // 이미지 미리보기
    if (f.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = (ev) => setPreview(ev.target?.result as string);
      reader.readAsDataURL(f);
    } else {
      setPreview(null);
    }
  };

  const handleUpload = async () => {
    setError(null);
    if (!file) {
      setError("파일을 선택해주세요");
      return;
    }

    setUploading(true);
    try {
      await uploadDocFile(docType, file);
      await refreshUser();
      if (docPendingKey) localStorage.setItem(docPendingKey, "1");
      setDocSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "업로드 실패");
    } finally {
      setUploading(false);
    }
  };

  if (!user) return null;

  // ── VERIFIED 상태 ─────────────────────────────────────
  if (user.verification_status === "VERIFIED") {
    if (docPendingKey) localStorage.removeItem(docPendingKey);
    return (
      <AppShell>
        <div className="mx-auto max-w-md px-4 py-10">
          <div className="rounded-2xl bg-emerald-50 border border-emerald-200 p-8 text-center">
            <div className="text-5xl mb-4">✅</div>
            <h2 className="text-lg font-bold text-emerald-800">인증 완료!</h2>
            <p className="mt-2 text-sm text-emerald-600">
              재학 인증이 완료되었습니다. 이제 미팅에 자유롭게 참가할 수 있습니다.
            </p>
            <button
              onClick={() => router.push("/discover")}
              className="mt-6 w-full rounded-xl bg-emerald-600 py-3 text-sm font-bold text-white hover:bg-emerald-700 transition-all"
            >
              미팅 둘러보기 →
            </button>
          </div>
        </div>
      </AppShell>
    );
  }

  // ── 업로드 완료(검토 대기) ──────────────────────────────
  if (docSubmitted && user.verification_status !== "REJECTED") {
    return (
      <AppShell>
        <div className="mx-auto max-w-md px-4 py-10">
          <div className="rounded-2xl bg-yellow-50 border border-yellow-200 p-8 text-center">
            <div className="text-5xl mb-4">⏳</div>
            <h2 className="text-lg font-bold text-yellow-800">검토 중</h2>
            <p className="mt-2 text-sm text-yellow-700">
              서류를 제출했습니다. 관리자 검토 후 인증이 완료됩니다.
              <br />보통 24시간 이내 처리됩니다.
            </p>
            <button
              onClick={() => router.push("/discover")}
              className="mt-6 w-full rounded-xl bg-yellow-500 py-3 text-sm font-bold text-white hover:bg-yellow-600 transition-all"
            >
              {isOnboarding ? "미팅 먼저 둘러보기 →" : "확인"}
            </button>
          </div>
        </div>
      </AppShell>
    );
  }

  // ── 업로드 폼 ─────────────────────────────────────────
  return (
    <AppShell>
      <div className="mx-auto max-w-md px-4 py-6">
        {isOnboarding && (
          <div className="mb-6 rounded-2xl bg-blue-50 border border-blue-100 p-4">
            <p className="font-semibold text-blue-800 text-sm">마지막 단계! 재학 인증 📄</p>
            <p className="mt-1 text-xs text-blue-600">
              재학증명서 또는 학생증을 업로드하면 미팅 참가가 가능합니다.
            </p>
            <div className="mt-3 flex gap-1 text-xs text-blue-500">
              <span>✅ 1. 프로필 입력</span>
              <span>→</span>
              <span className="font-bold">2. 재학증명서 업로드</span>
              <span>→</span>
              <span>3. 미팅 참가</span>
            </div>
          </div>
        )}

        {user.verification_status === "REJECTED" && (
          <div className="mb-5 rounded-xl bg-red-50 border border-red-200 px-4 py-3">
            <p className="text-sm font-semibold text-red-700">❌ 인증 거절됨</p>
            <p className="mt-1 text-xs text-red-600">
              서류를 다시 확인하고 재업로드해주세요.
            </p>
          </div>
        )}

        <h2 className="mb-5 text-lg font-bold text-gray-900">재학 인증</h2>

        <div className="space-y-4">
          {/* 서류 유형 선택 */}
          <div className="rounded-2xl bg-white border border-gray-100 p-4 shadow-sm">
            <p className="mb-3 text-sm font-semibold text-gray-700">서류 유형</p>
            <div className="flex gap-3">
              {(["ENROLLMENT_CERT", "STUDENT_ID"] as DocType[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setDocType(t)}
                  className={`flex-1 rounded-xl py-3 text-sm border-2 font-medium transition-all ${
                    docType === t
                      ? "border-blue-500 bg-blue-50 text-blue-700"
                      : "border-gray-200 text-gray-500"
                  }`}
                >
                  {t === "ENROLLMENT_CERT" ? "📄 재학증명서" : "🪪 학생증"}
                </button>
              ))}
            </div>
          </div>

          {/* 파일 업로드 영역 */}
          <div className="rounded-2xl bg-white border border-gray-100 p-4 shadow-sm">
            <p className="mb-1 text-sm font-semibold text-gray-700">
              {DOC_LABELS[docType]} 파일 선택
            </p>
            <p className="mb-3 text-xs text-gray-400">
              JPG, PNG, PDF 형식 · 최대 10MB
            </p>

            {/* 드래그앤드롭/클릭 업로드 영역 */}
            <div
              onClick={() => fileInputRef.current?.click()}
              className={`cursor-pointer rounded-xl border-2 border-dashed p-6 text-center transition-all hover:border-blue-400 hover:bg-blue-50 ${
                file ? "border-blue-400 bg-blue-50" : "border-gray-200 bg-gray-50"
              }`}
            >
              {preview ? (
                <img
                  src={preview}
                  alt="미리보기"
                  className="mx-auto max-h-48 rounded-lg object-contain shadow-sm"
                />
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <span className="text-3xl">📁</span>
                  <p className="text-sm font-medium text-gray-600">
                    {file ? file.name : "파일을 선택하거나 여기에 끌어다 놓으세요"}
                  </p>
                  <p className="text-xs text-gray-400">JPG · PNG · PDF</p>
                </div>
              )}
              {file && !preview && (
                <p className="mt-2 text-sm font-medium text-blue-700">
                  📎 {file.name}
                </p>
              )}
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept=".jpg,.jpeg,.png,.pdf"
              onChange={handleFileChange}
              className="hidden"
            />

            {file && (
              <button
                onClick={() => { setFile(null); setPreview(null); if (fileInputRef.current) fileInputRef.current.value = ""; }}
                className="mt-2 text-xs text-gray-400 hover:text-red-500 transition-colors"
              >
                ✕ 파일 제거
              </button>
            )}
          </div>

          {/* 주의사항 */}
          <div className="rounded-xl bg-gray-50 border border-gray-200 px-4 py-3 text-xs text-gray-500 space-y-1">
            <p className="font-semibold text-gray-600">📌 업로드 주의사항</p>
            <p>• 개인정보(이름, 학번)가 포함된 서류를 업로드해주세요</p>
            <p>• 이미지가 선명하게 보여야 합니다</p>
            <p>• 개인정보는 인증 목적으로만 사용되며 안전하게 보관됩니다</p>
          </div>

          {error && (
            <div className="rounded-xl bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-600">
              {error}
            </div>
          )}

          <button
            onClick={handleUpload}
            disabled={uploading || !file}
            className="w-full rounded-xl bg-blue-600 py-3.5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50 active:scale-95 transition-all"
          >
            {uploading ? "제출 중..." : "제출하기"}
          </button>

          {isOnboarding && (
            <button
              onClick={() => router.push("/discover")}
              className="w-full py-2 text-sm text-gray-400 hover:text-gray-600"
            >
              나중에 하기
            </button>
          )}
        </div>
      </div>
    </AppShell>
  );
}

export default function DocsPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center text-sm text-gray-400">로딩 중...</div>}>
      <DocsInner />
    </Suspense>
  );
}
