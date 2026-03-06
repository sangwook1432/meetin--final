"use client";

/**
 * /admin — 관리자 재학증명서 심사 페이지
 *
 * 기능:
 *  1. 심사 현황 요약 (PENDING / VERIFIED / REJECTED 카운트)
 *  2. 대기 중인 유저 목록 (이메일, 닉네임, 학교, 제출 서류 수)
 *  3. 유저 선택 → 제출 서류 파일 URL 미리보기
 *  4. 승인 / 반려 처리 (반려 시 사유 입력)
 *
 * 접근 조건:
 *  - 로그인 + is_admin === true
 */

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { apiFetch } from "@/lib/adminApi";

// ─── 타입 ────────────────────────────────────────────────────────

interface VerificationUser {
  user_id: number;
  email: string;
  nickname: string | null;
  university: string | null;
  verification_status: "PENDING" | "VERIFIED" | "REJECTED";
  doc_count: number;
}

interface VerificationDoc {
  id: number;
  user_id: number;
  doc_type: "ENROLLMENT_CERT" | "STUDENT_ID";
  file_url: string;
  status: "SUBMITTED" | "REVIEWED";
  note: string | null;
}

interface Stats {
  PENDING?: number;
  VERIFIED?: number;
  REJECTED?: number;
}

const STATUS_FILTER_OPTIONS = [
  { value: "PENDING", label: "대기 중", color: "bg-yellow-100 text-yellow-800" },
  { value: "VERIFIED", label: "승인됨", color: "bg-green-100 text-green-800" },
  { value: "REJECTED", label: "반려됨", color: "bg-red-100 text-red-800" },
] as const;

const DOC_TYPE_LABEL: Record<string, string> = {
  ENROLLMENT_CERT: "재학증명서",
  STUDENT_ID: "학생증",
};

// ─── 메인 컴포넌트 ───────────────────────────────────────────────

export default function AdminPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [stats, setStats] = useState<Stats>({});
  const [statusFilter, setStatusFilter] = useState<"PENDING" | "VERIFIED" | "REJECTED">("PENDING");
  const [users, setUsers] = useState<VerificationUser[]>([]);
  const [selectedUser, setSelectedUser] = useState<VerificationUser | null>(null);
  const [docs, setDocs] = useState<VerificationDoc[]>([]);
  const [rejectNote, setRejectNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 접근 권한 체크
  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.replace("/login"); return; }
    if (!user.is_admin) { router.replace("/discover"); return; }
  }, [authLoading, user, router]);

  // 통계 + 목록 불러오기
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [statsRes, usersRes] = await Promise.all([
        apiFetch<{ stats: Stats }>("/admin/verifications/stats"),
        apiFetch<VerificationUser[]>(`/admin/verifications?status=${statusFilter}&limit=100`),
      ]);
      setStats(statsRes.stats);
      setUsers(usersRes);
      setSelectedUser(null);
      setDocs([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "로드 실패");
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    if (user?.is_admin) fetchData();
  }, [user, fetchData]);

  // 유저 선택 → 서류 불러오기
  const handleSelectUser = async (u: VerificationUser) => {
    setSelectedUser(u);
    setRejectNote("");
    try {
      const docsRes = await apiFetch<VerificationDoc[]>(`/admin/verifications/${u.user_id}/docs`);
      setDocs(docsRes);
    } catch {
      setDocs([]);
    }
  };

  // 승인
  const handleApprove = async () => {
    if (!selectedUser) return;
    if (!confirm(`${selectedUser.email} 을(를) 승인하시겠습니까?`)) return;
    setActionLoading(true);
    try {
      await apiFetch(`/admin/verifications/${selectedUser.user_id}/approve`, {
        method: "POST",
        body: JSON.stringify({ note: "승인" }),
      });
      await fetchData();
    } catch (e) {
      alert(e instanceof Error ? e.message : "승인 실패");
    } finally {
      setActionLoading(false);
    }
  };

  // 반려
  const handleReject = async () => {
    if (!selectedUser) return;
    if (!rejectNote.trim()) { alert("반려 사유를 입력해주세요."); return; }
    if (!confirm(`${selectedUser.email} 을(를) 반려하시겠습니까?`)) return;
    setActionLoading(true);
    try {
      await apiFetch(`/admin/verifications/${selectedUser.user_id}/reject`, {
        method: "POST",
        body: JSON.stringify({ note: rejectNote }),
      });
      await fetchData();
    } catch (e) {
      alert(e instanceof Error ? e.message : "반려 실패");
    } finally {
      setActionLoading(false);
    }
  };

  if (authLoading || !user?.is_admin) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-gray-400">
        로딩 중...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 헤더 */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-black text-gray-900">🛡️ MEETIN 관리자</h1>
          <p className="text-xs text-gray-400 mt-0.5">재학증명서 심사 패널</p>
        </div>
        <button
          onClick={() => router.push("/discover")}
          className="text-sm text-gray-500 hover:text-gray-700 underline"
        >
          서비스로 이동 →
        </button>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-6 flex gap-6">
        {/* ── 왼쪽: 목록 ─────────────────────────────────── */}
        <div className="w-1/2 flex flex-col gap-4">
          {/* 통계 카드 */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "대기", key: "PENDING", color: "border-yellow-300 bg-yellow-50 text-yellow-800" },
              { label: "승인", key: "VERIFIED", color: "border-green-300 bg-green-50 text-green-800" },
              { label: "반려", key: "REJECTED", color: "border-red-300 bg-red-50 text-red-800" },
            ].map(({ label, key, color }) => (
              <div key={key} className={`rounded-2xl border p-4 text-center ${color}`}>
                <div className="text-2xl font-black">{stats[key as keyof Stats] ?? 0}</div>
                <div className="text-xs font-medium mt-0.5">{label}</div>
              </div>
            ))}
          </div>

          {/* 필터 탭 */}
          <div className="flex gap-2">
            {STATUS_FILTER_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setStatusFilter(opt.value)}
                className={`flex-1 rounded-xl py-2 text-sm font-semibold border-2 transition-all ${
                  statusFilter === opt.value
                    ? `${opt.color} border-current`
                    : "border-gray-200 text-gray-500 bg-white"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* 유저 목록 */}
          {error ? (
            <div className="rounded-xl bg-red-50 border border-red-100 p-4 text-sm text-red-600">
              {error}
              <button onClick={fetchData} className="ml-3 underline">다시 시도</button>
            </div>
          ) : loading ? (
            <div className="flex flex-col gap-2">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-16 animate-pulse rounded-xl bg-gray-100" />
              ))}
            </div>
          ) : users.length === 0 ? (
            <div className="rounded-2xl bg-white border border-gray-100 p-8 text-center text-sm text-gray-400">
              해당 상태의 유저가 없습니다
            </div>
          ) : (
            <div className="flex flex-col gap-2 overflow-y-auto max-h-[60vh] pr-1">
              {users.map((u) => (
                <button
                  key={u.user_id}
                  onClick={() => handleSelectUser(u)}
                  className={`w-full text-left rounded-xl border p-4 transition-all ${
                    selectedUser?.user_id === u.user_id
                      ? "border-blue-400 bg-blue-50"
                      : "border-gray-100 bg-white hover:border-gray-200"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">
                        {u.nickname ?? "닉네임 없음"}
                        <span className="ml-2 text-xs text-gray-400">#{u.user_id}</span>
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">{u.email}</p>
                      {u.university && (
                        <p className="text-xs text-gray-400 mt-0.5">{u.university}</p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className="text-xs bg-gray-100 text-gray-600 rounded-full px-2 py-0.5">
                        서류 {u.doc_count}건
                      </span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── 오른쪽: 서류 + 액션 ───────────────────────────────── */}
        <div className="w-1/2">
          {!selectedUser ? (
            <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-12 text-center text-sm text-gray-400">
              왼쪽 목록에서 유저를 선택하세요
            </div>
          ) : (
            <div className="rounded-2xl bg-white border border-gray-100 p-5 flex flex-col gap-5">
              {/* 선택된 유저 정보 */}
              <div>
                <h2 className="text-base font-bold text-gray-900">
                  {selectedUser.nickname ?? selectedUser.email}
                  <span className="ml-2 text-xs text-gray-400">
                    ({selectedUser.verification_status})
                  </span>
                </h2>
                <p className="text-sm text-gray-500 mt-0.5">{selectedUser.email}</p>
                {selectedUser.university && (
                  <p className="text-sm text-gray-500">{selectedUser.university}</p>
                )}
              </div>

              {/* 서류 목록 */}
              <div>
                <p className="text-sm font-semibold text-gray-700 mb-3">
                  제출 서류 ({docs.length}건)
                </p>
                {docs.length === 0 ? (
                  <p className="text-sm text-gray-400">제출된 서류가 없습니다</p>
                ) : (
                  <div className="flex flex-col gap-3">
                    {docs.map((doc) => (
                      <div
                        key={doc.id}
                        className="rounded-xl border border-gray-100 overflow-hidden"
                      >
                        <div className="bg-gray-50 px-4 py-2 flex items-center justify-between">
                          <span className="text-xs font-semibold text-gray-700">
                            {DOC_TYPE_LABEL[doc.doc_type] ?? doc.doc_type}
                          </span>
                          <span className={`text-xs rounded-full px-2 py-0.5 ${
                            doc.status === "REVIEWED"
                              ? "bg-gray-200 text-gray-600"
                              : "bg-yellow-100 text-yellow-700"
                          }`}>
                            {doc.status === "REVIEWED" ? "검토됨" : "제출됨"}
                          </span>
                        </div>
                        {/* 이미지 미리보기 or 링크 */}
                        {doc.file_url.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? (
                          <img
                            src={doc.file_url}
                            alt={doc.doc_type}
                            className="w-full max-h-48 object-contain bg-white"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = "none";
                            }}
                          />
                        ) : (
                          <div className="px-4 py-3">
                            <a
                              href={doc.file_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sm text-blue-600 underline break-all"
                            >
                              파일 열기 →
                            </a>
                          </div>
                        )}
                        {doc.note && (
                          <div className="px-4 py-2 bg-gray-50 text-xs text-gray-500">
                            메모: {doc.note}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 액션 (이미 VERIFIED 이면 비활성화) */}
              {selectedUser.verification_status === "PENDING" && (
                <div className="flex flex-col gap-3 border-t border-gray-100 pt-4">
                  <button
                    onClick={handleApprove}
                    disabled={actionLoading}
                    className="w-full rounded-xl bg-emerald-600 py-3 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50 transition-all"
                  >
                    {actionLoading ? "처리 중..." : "✅ 승인하기"}
                  </button>

                  <div className="flex flex-col gap-2">
                    <textarea
                      value={rejectNote}
                      onChange={(e) => setRejectNote(e.target.value)}
                      placeholder="반려 사유를 입력하세요 (필수)"
                      rows={2}
                      className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-red-300 focus:outline-none resize-none"
                    />
                    <button
                      onClick={handleReject}
                      disabled={actionLoading || !rejectNote.trim()}
                      className="w-full rounded-xl border border-red-300 bg-white py-3 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-40 transition-all"
                    >
                      {actionLoading ? "처리 중..." : "❌ 반려하기"}
                    </button>
                  </div>
                </div>
              )}

              {selectedUser.verification_status === "VERIFIED" && (
                <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-700 font-semibold">
                  ✅ 이미 승인된 유저입니다
                </div>
              )}

              {selectedUser.verification_status === "REJECTED" && (
                <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 font-semibold">
                  ❌ 반려된 유저입니다
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
