"use client";

/**
 * /me/docs — 재학증명서 업로드 페이지
 *
 * 현재 파일 스토리지 미연동 상태(MVP)이므로:
 *  - 사용자가 외부 이미지 URL을 직접 붙여넣는 방식으로 동작
 *  - 실제 S3/R2 연동 후 <input type="file"> + presigned URL 방식으로 교체 예정
 *
 * 인증 상태에 따른 UI:
 *  - PENDING  : 업로드 폼 표시
 *  - VERIFIED : "인증 완료" 화면
 *  - REJECTED : 거절 사유 + 재업로드 가능
 */

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { uploadDoc } from "@/lib/api";
import { AppShell } from "@/components/ui/AppShell";
import type { DocType } from "@/types";

const DOC_LABELS: Record<DocType, string> = {
  ENROLLMENT_CERT: "재학증명서",
  STUDENT_ID: "학생증",
};

// useSearchParams를 사용하는 내부 컴포넌트 (Suspense 필요)
function DocsInner() {
  const { user, refreshUser } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const isOnboarding = searchParams.get("onboarding") === "1";

  const [docType, setDocType] = useState<DocType>("ENROLLMENT_CERT");
  const [fileUrl, setFileUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const handleUpload = async () => {
    setError(null);
    if (!fileUrl.trim()) {
      setError("이미지 URL을 입력해주세요");
      return;
    }
    // 기본 URL 형식 체크
    try { new URL(fileUrl.trim()); } catch {
      setError("올바른 URL 형식이 아닙니다");
      return;
    }

    setUploading(true);
    try {
      await uploadDoc({ doc_type: docType, file_url: fileUrl.trim() });
      await refreshUser();
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "업로드 실패");
    } finally {
      setUploading(false);
    }
  };

  if (!user) return null;

  // ── VERIFIED 상태 ─────────────────────────────────────
  if (user.verification_status === "VERIFIED") {
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
  if (done) {
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
            {isOnboarding ? (
              <button
                onClick={() => router.push("/discover")}
                className="mt-6 w-full rounded-xl bg-yellow-500 py-3 text-sm font-bold text-white hover:bg-yellow-600 transition-all"
              >
                미팅 먼저 둘러보기 →
              </button>
            ) : (
              <button
                onClick={() => router.push("/discover")}
                className="mt-6 text-sm text-gray-500 underline"
              >
                확인
              </button>
            )}
          </div>
        </div>
      </AppShell>
    );
  }

  // ── 업로드 폼 ─────────────────────────────────────────
  return (
    <AppShell>
      <div className="mx-auto max-w-md px-4 py-6">
        {/* 온보딩 배너 */}
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

        {/* 거절 상태 안내 */}
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

          {/* URL 입력 */}
          <div className="rounded-2xl bg-white border border-gray-100 p-4 shadow-sm">
            <p className="mb-1 text-sm font-semibold text-gray-700">
              {DOC_LABELS[docType]} 이미지 URL
            </p>
            <p className="mb-3 text-xs text-gray-400">
              이미지를 Google Drive 등에 업로드 후 공유 링크를 붙여넣어 주세요.
            </p>
            <input
              type="url"
              value={fileUrl}
              onChange={(e) => setFileUrl(e.target.value)}
              placeholder="https://drive.google.com/..."
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100 transition-all"
            />
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
            disabled={uploading}
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

// Suspense 래퍼를 포함한 기본 export
export default function DocsPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center text-sm text-gray-400">로딩 중...</div>}>
      <DocsInner />
    </Suspense>
  );
}
