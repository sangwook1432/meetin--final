"use client";

/**
 * /admin — 관리자 페이지
 *
 * 탭 1: 재학증명서 심사 (PENDING/VERIFIED/REJECTED)
 * 탭 2: 출금 신청 관리 (WITHDRAW 목록 + 완료/반려 처리)
 */

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { apiFetch, adminSearchUserByPhone, adminGrantTickets, type TicketGrantUserInfo } from "@/lib/adminApi";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

function resolveFileUrl(url: string): string {
  if (url.startsWith("http")) return url;
  return `${API_BASE}${url}`;
}

// ─── 타입 ────────────────────────────────────────────────────────

interface VerificationUser {
  user_id: number;
  username: string | null;
  nickname: string | null;
  university: string | null;
  major: string | null;
  entry_year: number | null;
  age: number | null;
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

interface Withdrawal {
  tx_id: number;
  user_id: number;
  nickname: string | null;
  amount: number;
  fee: number;
  net_amount: number;
  note: string | null;
  created_at: string;
}

interface Feedback {
  id: number;
  meeting_id: number;
  user_id: number;
  complaint: string | null;
  created_at: string;
}

interface PreregistrationEntry {
  id: number;
  phone: string | null;
  gender: "MALE" | "FEMALE";
  granted: boolean;
  created_at: string;
}

interface PreregistrationData {
  total: number;
  male: number;
  female: number;
  granted: number;
  pending: number;
  entries: PreregistrationEntry[];
}

interface ChatReport {
  id: number;
  room_id: number | null;
  meeting_id: number | null;
  reporter_user_id: number | null;
  reporter_nickname: string | null;
  reported_user_id: number | null;
  reported_nickname: string | null;
  reported_warning_count: number;
  reported_is_banned: boolean;
  reported_suspended_until: string | null;
  evidence_message_id: number | null;
  evidence_content: string | null;
  reason: string;
  reason_label: string;
  detail: string | null;
  status: "PENDING" | "CONFIRMED" | "REJECTED";
  admin_note: string | null;
  created_at: string;
  resolved_at: string | null;
}

const STATUS_FILTER_OPTIONS = [
  { value: "PENDING", label: "대기 중", color: "border-yellow-300 bg-yellow-50 text-yellow-800" },
  { value: "VERIFIED", label: "승인됨", color: "border-green-300 bg-green-50 text-green-800" },
  { value: "REJECTED", label: "반려됨", color: "border-red-300 bg-red-50 text-red-800" },
] as const;

const DOC_TYPE_LABEL: Record<string, string> = {
  ENROLLMENT_CERT: "재학증명서",
  STUDENT_ID: "학생증",
};

// ─── 메인 컴포넌트 ───────────────────────────────────────────────

export default function AdminPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [tab, setTab] = useState<"verify" | "withdraw" | "complaints" | "preregister" | "reports" | "tickets">("verify");

  // ── 재학증명서 심사 상태 ──────────────────────────────────────
  const [stats, setStats] = useState<Stats>({});
  const [statusFilter, setStatusFilter] = useState<"PENDING" | "VERIFIED" | "REJECTED">("PENDING");
  const [users, setUsers] = useState<VerificationUser[]>([]);
  const [selectedUser, setSelectedUser] = useState<VerificationUser | null>(null);
  const [docs, setDocs] = useState<VerificationDoc[]>([]);
  const [rejectNote, setRejectNote] = useState("");
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  // ── 출금 신청 상태 ────────────────────────────────────────────
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [withdrawLoading, setWithdrawLoading] = useState(false);
  const [withdrawError, setWithdrawError] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<number | null>(null);

  // ── 불편사항 상태 ─────────────────────────────────────────────
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);

  // ── 사전예약 상태 ─────────────────────────────────────────────
  const [preregData, setPreregData] = useState<PreregistrationData | null>(null);
  const [preregLoading, setPreregLoading] = useState(false);
  const [preregError, setPreregError] = useState<string | null>(null);

  // ── 신고 관리 상태 ────────────────────────────────────────────
  const [reports, setReports] = useState<ChatReport[]>([]);
  const [reportStatusFilter, setReportStatusFilter] = useState<"PENDING" | "CONFIRMED" | "REJECTED">("PENDING");
  const [reportsLoading, setReportsLoading] = useState(false);
  const [reportsError, setReportsError] = useState<string | null>(null);
  const [reportNotes, setReportNotes] = useState<Record<number, string>>({});
  const [reportActionId, setReportActionId] = useState<number | null>(null);

  // 접근 권한 체크
  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.replace("/login"); return; }
    if (!user.is_admin) { router.replace("/discover"); return; }
  }, [authLoading, user, router]);

  // ── 재학증명서 데이터 로드 ────────────────────────────────────
  const fetchVerifyData = useCallback(async () => {
    setVerifyLoading(true);
    setVerifyError(null);
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
      setVerifyError(e instanceof Error ? e.message : "로드 실패");
    } finally {
      setVerifyLoading(false);
    }
  }, [statusFilter]);

  // ── 사전예약 데이터 로드 ──────────────────────────────────────
  const fetchPreregistrations = useCallback(async () => {
    setPreregLoading(true);
    setPreregError(null);
    try {
      const res = await apiFetch<PreregistrationData>("/admin/preregistrations");
      setPreregData(res);
    } catch (e) {
      setPreregError(e instanceof Error ? e.message : "로드 실패");
    } finally {
      setPreregLoading(false);
    }
  }, []);

  // ── 불편사항 데이터 로드 ──────────────────────────────────────
  const fetchFeedbacks = useCallback(async () => {
    setFeedbackLoading(true);
    setFeedbackError(null);
    try {
      const res = await apiFetch<Feedback[]>("/admin/feedbacks?limit=100");
      setFeedbacks(res);
    } catch (e) {
      setFeedbackError(e instanceof Error ? e.message : "로드 실패");
    } finally {
      setFeedbackLoading(false);
    }
  }, []);

  // ── 신고 데이터 로드 ──────────────────────────────────────────
  const fetchReports = useCallback(async () => {
    setReportsLoading(true);
    setReportsError(null);
    try {
      const res = await apiFetch<{ reports: ChatReport[] }>(`/admin/reports?status=${reportStatusFilter}&limit=100`);
      setReports(res.reports);
    } catch (e) {
      setReportsError(e instanceof Error ? e.message : "로드 실패");
    } finally {
      setReportsLoading(false);
    }
  }, [reportStatusFilter]);

  // ── 출금 신청 데이터 로드 ─────────────────────────────────────
  const fetchWithdrawals = useCallback(async () => {
    setWithdrawLoading(true);
    setWithdrawError(null);
    try {
      const res = await apiFetch<{ withdrawals: Withdrawal[] }>("/admin/withdrawals?limit=100");
      setWithdrawals(res.withdrawals);
    } catch (e) {
      setWithdrawError(e instanceof Error ? e.message : "로드 실패");
    } finally {
      setWithdrawLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user?.is_admin) return;
    if (tab === "verify") fetchVerifyData();
    else if (tab === "withdraw") fetchWithdrawals();
    else if (tab === "complaints") fetchFeedbacks();
    else if (tab === "preregister") fetchPreregistrations();
    else if (tab === "reports") fetchReports();
  }, [user, tab, fetchVerifyData, fetchWithdrawals, fetchFeedbacks, fetchReports]);

  useEffect(() => {
    if (tab === "reports") fetchReports();
  }, [reportStatusFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 유저 선택 → 서류 불러오기 ─────────────────────────────────
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

  // ── 승인 ──────────────────────────────────────────────────────
  const handleApprove = async () => {
    if (!selectedUser) return;
    if (!confirm(`${selectedUser.username} 을(를) 승인하시겠습니까?`)) return;
    setActionLoading(true);
    try {
      await apiFetch(`/admin/verifications/${selectedUser.user_id}/approve`, {
        method: "POST",
        body: JSON.stringify({ note: "승인" }),
      });
      await fetchVerifyData();
    } catch (e) {
      alert(e instanceof Error ? e.message : "승인 실패");
    } finally {
      setActionLoading(false);
    }
  };

  // ── 반려 ──────────────────────────────────────────────────────
  const handleReject = async () => {
    if (!selectedUser) return;
    if (!rejectNote.trim()) { alert("반려 사유를 입력해주세요."); return; }
    if (!confirm(`${selectedUser.username} 을(를) 반려하시겠습니까?`)) return;
    setActionLoading(true);
    try {
      await apiFetch(`/admin/verifications/${selectedUser.user_id}/reject`, {
        method: "POST",
        body: JSON.stringify({ note: rejectNote }),
      });
      await fetchVerifyData();
    } catch (e) {
      alert(e instanceof Error ? e.message : "반려 실패");
    } finally {
      setActionLoading(false);
    }
  };

  // ── 출금 완료 처리 ────────────────────────────────────────────
  const handleWithdrawComplete = async (txId: number, amount: number, netAmount?: number) => {
    const displayAmount = netAmount ?? amount;
    if (!confirm(`tx#${txId} — 실입금액 ${displayAmount.toLocaleString()}원 이체 완료 처리하시겠습니까?\n실제 이체가 완료된 경우에만 누르세요.`)) return;
    setProcessingId(txId);
    try {
      await apiFetch(`/admin/withdrawals/${txId}/complete`, { method: "POST" });
      await fetchWithdrawals();
    } catch (e) {
      alert(e instanceof Error ? e.message : "처리 실패");
    } finally {
      setProcessingId(null);
    }
  };

  // ── 출금 반려 ─────────────────────────────────────────────────
  const handleWithdrawReject = async (txId: number, amount: number) => {
    if (!confirm(`tx#${txId} — ${amount.toLocaleString()}원 출금을 반려하시겠습니까?\n잔액이 복원됩니다.`)) return;
    setProcessingId(txId);
    try {
      await apiFetch(`/admin/withdrawals/${txId}/reject`, { method: "POST" });
      await fetchWithdrawals();
    } catch (e) {
      alert(e instanceof Error ? e.message : "처리 실패");
    } finally {
      setProcessingId(null);
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
          <p className="text-xs text-gray-400 mt-0.5">관리 패널</p>
        </div>
        <button
          onClick={() => router.push("/discover")}
          className="text-sm text-gray-500 hover:text-gray-700 underline"
        >
          서비스로 이동 →
        </button>
      </div>

      {/* 탭 */}
      <div className="max-w-6xl mx-auto px-6 pt-5 overflow-x-auto">
        <div className="flex gap-1 bg-gray-100 rounded-2xl p-1 w-max">
          <button
            onClick={() => setTab("verify")}
            className={`shrink-0 whitespace-nowrap rounded-xl px-5 py-2.5 text-sm font-bold transition-all ${
              tab === "verify" ? "bg-white shadow text-gray-900" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            📋 재학증명서 심사
          </button>
          <button
            onClick={() => setTab("withdraw")}
            className={`shrink-0 whitespace-nowrap rounded-xl px-5 py-2.5 text-sm font-bold transition-all flex items-center gap-2 ${
              tab === "withdraw" ? "bg-white shadow text-gray-900" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            💸 출금 신청
            {withdrawals.length > 0 && tab !== "withdraw" && (
              <span className="rounded-full bg-orange-500 text-white text-xs px-1.5 py-0.5 leading-none">
                {withdrawals.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setTab("complaints")}
            className={`shrink-0 whitespace-nowrap rounded-xl px-5 py-2.5 text-sm font-bold transition-all flex items-center gap-2 ${
              tab === "complaints" ? "bg-white shadow text-gray-900" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            📣 불편사항
            {feedbacks.length > 0 && tab !== "complaints" && (
              <span className="rounded-full bg-red-500 text-white text-xs px-1.5 py-0.5 leading-none">
                {feedbacks.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setTab("preregister")}
            className={`shrink-0 whitespace-nowrap rounded-xl px-5 py-2.5 text-sm font-bold transition-all flex items-center gap-2 ${
              tab === "preregister" ? "bg-white shadow text-gray-900" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            📱 사전예약
            {preregData && preregData.total > 0 && tab !== "preregister" && (
              <span className="rounded-full bg-blue-500 text-white text-xs px-1.5 py-0.5 leading-none">
                {preregData.total}
              </span>
            )}
          </button>
          <button
            onClick={() => setTab("reports")}
            className={`shrink-0 whitespace-nowrap rounded-xl px-5 py-2.5 text-sm font-bold transition-all flex items-center gap-2 ${
              tab === "reports" ? "bg-white shadow text-gray-900" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            🚨 신고 관리
            {reports.filter(r => r.status === "PENDING").length > 0 && tab !== "reports" && (
              <span className="rounded-full bg-red-500 text-white text-xs px-1.5 py-0.5 leading-none">
                {reports.filter(r => r.status === "PENDING").length}
              </span>
            )}
          </button>
          <button
            onClick={() => setTab("tickets")}
            className={`shrink-0 whitespace-nowrap rounded-xl px-5 py-2.5 text-sm font-bold transition-all ${
              tab === "tickets" ? "bg-white shadow text-gray-900" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            🎟 매칭권 지급
          </button>
        </div>
      </div>

      {/* ── 탭 1: 재학증명서 심사 ─────────────────────────────────── */}
      {tab === "verify" && (
        <div className="max-w-6xl mx-auto px-6 py-6 flex gap-6">
          {/* 왼쪽: 목록 */}
          <div className="w-1/2 flex flex-col gap-4">
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

            {verifyError ? (
              <div className="rounded-xl bg-red-50 border border-red-100 p-4 text-sm text-red-600">
                {verifyError}
                <button onClick={fetchVerifyData} className="ml-3 underline">다시 시도</button>
              </div>
            ) : verifyLoading ? (
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
                        <p className="text-xs text-gray-500 mt-0.5">{u.username}</p>
                        {u.university && <p className="text-xs text-gray-400 mt-0.5">{u.university}</p>}
                        <p className="text-xs text-gray-400 mt-0.5">
                          {[u.major, u.entry_year ? `${u.entry_year}학번` : null, u.age ? `${u.age}세` : null].filter(Boolean).join(" · ")}
                        </p>
                      </div>
                      <span className="text-xs bg-gray-100 text-gray-600 rounded-full px-2 py-0.5">
                        서류 {u.doc_count}건
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 오른쪽: 서류 + 액션 */}
          <div className="w-1/2">
            {!selectedUser ? (
              <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-12 text-center text-sm text-gray-400">
                왼쪽 목록에서 유저를 선택하세요
              </div>
            ) : (
              <div className="rounded-2xl bg-white border border-gray-100 p-5 flex flex-col gap-5">
                <div>
                  <h2 className="text-base font-bold text-gray-900">
                    {selectedUser.nickname ?? selectedUser.username}
                    <span className="ml-2 text-xs text-gray-400">({selectedUser.verification_status})</span>
                  </h2>
                  <p className="text-sm text-gray-500 mt-0.5">{selectedUser.username}</p>
                  {selectedUser.university && <p className="text-sm text-gray-500">{selectedUser.university}</p>}
                  <p className="text-sm text-gray-500 mt-0.5">
                    {[selectedUser.major, selectedUser.entry_year ? `${selectedUser.entry_year}학번` : null, selectedUser.age ? `${selectedUser.age}세` : null].filter(Boolean).join(" · ") || "전공/학번/나이 미입력"}
                  </p>
                </div>

                <div>
                  <p className="text-sm font-semibold text-gray-700 mb-3">제출 서류 ({docs.length}건)</p>
                  {docs.length === 0 ? (
                    <p className="text-sm text-gray-400">제출된 서류가 없습니다</p>
                  ) : (
                    <div className="flex flex-col gap-3">
                      {docs.map((doc) => (
                        <div key={doc.id} className="rounded-xl border border-gray-100 overflow-hidden">
                          <div className="bg-gray-50 px-4 py-2 flex items-center justify-between">
                            <span className="text-xs font-semibold text-gray-700">
                              {DOC_TYPE_LABEL[doc.doc_type] ?? doc.doc_type}
                            </span>
                            <span className={`text-xs rounded-full px-2 py-0.5 ${
                              doc.status === "REVIEWED" ? "bg-gray-200 text-gray-600" : "bg-yellow-100 text-yellow-700"
                            }`}>
                              {doc.status === "REVIEWED" ? "검토됨" : "제출됨"}
                            </span>
                          </div>
                          {doc.file_url.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? (
                            <img src={resolveFileUrl(doc.file_url)} alt={doc.doc_type}
                              className="w-full max-h-48 object-contain bg-white"
                              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                            />
                          ) : (
                            <div className="px-4 py-3">
                              <a href={resolveFileUrl(doc.file_url)} target="_blank" rel="noopener noreferrer"
                                className="text-sm text-blue-600 underline break-all"
                              >
                                파일 열기 →
                              </a>
                            </div>
                          )}
                          {doc.note && (
                            <div className="px-4 py-2 bg-gray-50 text-xs text-gray-500">메모: {doc.note}</div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {selectedUser.verification_status === "PENDING" && (
                  <div className="flex flex-col gap-3 border-t border-gray-100 pt-4">
                    <button onClick={handleApprove} disabled={actionLoading}
                      className="w-full rounded-xl bg-emerald-600 py-3 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50 transition-all"
                    >
                      {actionLoading ? "처리 중..." : "✅ 승인하기"}
                    </button>
                    <div className="flex flex-col gap-2">
                      <textarea value={rejectNote} onChange={(e) => setRejectNote(e.target.value)}
                        placeholder="반려 사유를 입력하세요 (필수)" rows={2}
                        className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-red-300 focus:outline-none resize-none"
                      />
                      <button onClick={handleReject} disabled={actionLoading || !rejectNote.trim()}
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
      )}

      {/* ── 탭 3: 불편사항 ───────────────────────────────────────── */}
      {tab === "complaints" && (
        <div className="max-w-6xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-bold text-gray-900">불편사항 접수 목록</h2>
              <p className="text-xs text-gray-400 mt-0.5">미팅 후 불만족 응답 유저의 불편사항</p>
            </div>
            <button onClick={fetchFeedbacks}
              className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:border-gray-300 transition-all"
            >
              새로고침
            </button>
          </div>

          {feedbackError ? (
            <div className="rounded-xl bg-red-50 border border-red-100 p-4 text-sm text-red-600">
              {feedbackError}
            </div>
          ) : feedbackLoading ? (
            <div className="flex flex-col gap-3">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-20 animate-pulse rounded-2xl bg-gray-100" />
              ))}
            </div>
          ) : feedbacks.length === 0 ? (
            <div className="rounded-2xl bg-white border border-gray-100 p-16 text-center">
              <p className="text-3xl mb-3">📣</p>
              <p className="text-sm font-semibold text-gray-500">접수된 불편사항이 없습니다</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {feedbacks.map((fb) => (
                <div key={fb.id} className="rounded-2xl bg-white border border-gray-100 shadow-sm p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs bg-red-100 text-red-700 rounded-full px-2 py-0.5 font-semibold">
                          미팅 #{fb.meeting_id}
                        </span>
                        <span className="text-xs bg-gray-100 text-gray-600 rounded-full px-2 py-0.5">
                          유저 #{fb.user_id}
                        </span>
                      </div>
                      <p className="text-sm text-gray-800 leading-relaxed">
                        {fb.complaint ?? <span className="text-gray-400 italic">내용 없음</span>}
                      </p>
                      <p className="mt-2 text-xs text-gray-400">
                        {new Date(fb.created_at).toLocaleString("ko-KR", {
                          year: "numeric", month: "short", day: "numeric",
                          hour: "2-digit", minute: "2-digit"
                        })}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── 탭 4: 사전예약 ───────────────────────────────────────── */}
      {tab === "preregister" && (
        <div className="max-w-6xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-bold text-gray-900">사전예약 목록</h2>
              <p className="text-xs text-gray-400 mt-0.5">앱 출시 시 매칭권 지급 대상</p>
            </div>
            <div className="flex gap-2">
              {preregData && preregData.entries.length > 0 && (
                <button
                  onClick={() => {
                    const rows = [
                      ["번호", "성별", "지급여부", "신청일시"],
                      ...preregData.entries.map((e) => [
                        e.phone ?? "알수없음",
                        e.gender === "FEMALE" ? "여자" : "남자",
                        e.granted ? "지급완료" : "미지급",
                        new Date(e.created_at).toLocaleString("ko-KR"),
                      ]),
                    ];
                    const csv = rows.map((r) => r.join(",")).join("\n");
                    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `사전예약_${new Date().toISOString().slice(0, 10)}.csv`;
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                  className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:border-gray-300 transition-all"
                >
                  📥 CSV 다운로드
                </button>
              )}
              <button
                onClick={fetchPreregistrations}
                className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:border-gray-300 transition-all"
              >
                새로고침
              </button>
            </div>
          </div>

          {/* 통계 카드 */}
          {preregData && (
            <div className="grid grid-cols-4 gap-3 mb-5">
              {[
                { label: "전체", value: preregData.total, color: "border-gray-200 bg-gray-50 text-gray-800" },
                { label: "여자", value: preregData.female, color: "border-pink-200 bg-pink-50 text-pink-800" },
                { label: "남자", value: preregData.male, color: "border-blue-200 bg-blue-50 text-blue-800" },
                { label: "지급완료", value: preregData.granted, color: "border-green-200 bg-green-50 text-green-800" },
              ].map(({ label, value, color }) => (
                <div key={label} className={`rounded-2xl border p-4 text-center ${color}`}>
                  <div className="text-2xl font-black">{value}</div>
                  <div className="text-xs font-medium mt-0.5">{label}</div>
                </div>
              ))}
            </div>
          )}

          {preregError ? (
            <div className="rounded-xl bg-red-50 border border-red-100 p-4 text-sm text-red-600">
              {preregError}
              <button onClick={fetchPreregistrations} className="ml-3 underline">다시 시도</button>
            </div>
          ) : preregLoading ? (
            <div className="flex flex-col gap-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-14 animate-pulse rounded-2xl bg-gray-100" />
              ))}
            </div>
          ) : !preregData || preregData.entries.length === 0 ? (
            <div className="rounded-2xl bg-white border border-gray-100 p-16 text-center">
              <p className="text-3xl mb-3">📱</p>
              <p className="text-sm font-semibold text-gray-500">사전예약 내역이 없습니다</p>
            </div>
          ) : (
            <div className="rounded-2xl bg-white border border-gray-100 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500">#</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500">전화번호</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500">성별</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500">지급여부</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500">신청일시</th>
                  </tr>
                </thead>
                <tbody>
                  {preregData.entries.map((entry) => (
                    <tr key={entry.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-3.5 text-xs text-gray-400">{entry.id}</td>
                      <td className="px-5 py-3.5 font-mono text-sm text-gray-900">
                        {entry.phone ?? <span className="text-gray-400 italic">복호화 불가</span>}
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                          entry.gender === "FEMALE"
                            ? "bg-pink-100 text-pink-700"
                            : "bg-blue-100 text-blue-700"
                        }`}>
                          {entry.gender === "FEMALE" ? "여자" : "남자"}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                          entry.granted
                            ? "bg-green-100 text-green-700"
                            : "bg-gray-100 text-gray-500"
                        }`}>
                          {entry.granted ? "✅ 지급완료" : "대기중"}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-xs text-gray-400">
                        {new Date(entry.created_at).toLocaleString("ko-KR", {
                          year: "numeric", month: "short", day: "numeric",
                          hour: "2-digit", minute: "2-digit",
                        })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── 탭: 신고 관리 ────────────────────────────────────────── */}
      {tab === "reports" && (
        <div className="max-w-6xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-bold text-gray-900">신고 관리</h2>
              <p className="text-xs text-gray-400 mt-0.5">채팅방 내 유저 신고 목록</p>
            </div>
            <button onClick={fetchReports}
              className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:border-gray-300 transition-all"
            >
              새로고침
            </button>
          </div>

          {/* 상태 필터 */}
          <div className="flex gap-2 mb-5">
            {(["PENDING", "CONFIRMED", "REJECTED"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setReportStatusFilter(s)}
                className={`rounded-xl border-2 px-4 py-2 text-sm font-semibold transition-all ${
                  reportStatusFilter === s
                    ? s === "PENDING"
                      ? "border-yellow-400 bg-yellow-50 text-yellow-800"
                      : s === "CONFIRMED"
                      ? "border-red-400 bg-red-50 text-red-800"
                      : "border-gray-400 bg-gray-100 text-gray-700"
                    : "border-gray-200 bg-white text-gray-500 hover:border-gray-300"
                }`}
              >
                {s === "PENDING" ? "대기 중" : s === "CONFIRMED" ? "제재 확정" : "기각"}
              </button>
            ))}
          </div>

          {reportsError ? (
            <div className="rounded-xl bg-red-50 border border-red-100 p-4 text-sm text-red-600">
              {reportsError}
              <button onClick={fetchReports} className="ml-3 underline">다시 시도</button>
            </div>
          ) : reportsLoading ? (
            <div className="flex flex-col gap-3">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-28 animate-pulse rounded-2xl bg-gray-100" />
              ))}
            </div>
          ) : reports.length === 0 ? (
            <div className="rounded-2xl bg-white border border-gray-100 p-16 text-center">
              <p className="text-3xl mb-3">🚨</p>
              <p className="text-sm font-semibold text-gray-500">신고 내역이 없습니다</p>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {reports.map((r) => (
                <div key={r.id} className="rounded-2xl bg-white border border-gray-100 shadow-sm p-5">
                  <div className="flex items-start gap-4">
                    <div className="flex-1 min-w-0">
                      {/* 신고자 → 피신고자 */}
                      <div className="flex items-center gap-2 mb-3 flex-wrap">
                        <span className="text-xs bg-gray-100 text-gray-700 rounded-full px-2.5 py-0.5 font-semibold">
                          신고자: {r.reporter_nickname ?? `#${r.reporter_user_id}`}
                        </span>
                        <span className="text-gray-400 text-xs">→</span>
                        <span className="text-xs bg-red-100 text-red-700 rounded-full px-2.5 py-0.5 font-semibold">
                          피신고자: {r.reported_nickname ?? `#${r.reported_user_id}`}
                        </span>
                        {r.reported_is_banned ? (
                          <span className="text-xs bg-black text-white rounded-full px-2 py-0.5 font-bold">영구정지</span>
                        ) : r.reported_suspended_until && new Date(r.reported_suspended_until) > new Date() ? (
                          <span className="text-xs bg-red-700 text-white rounded-full px-2 py-0.5 font-bold">
                            정지중 (~{new Date(r.reported_suspended_until).toLocaleDateString("ko-KR")})
                          </span>
                        ) : r.reported_warning_count > 0 ? (
                          <span className="text-xs bg-yellow-100 text-yellow-800 rounded-full px-2 py-0.5 font-semibold">
                            경고 {r.reported_warning_count}회
                          </span>
                        ) : null}
                        <span className="text-xs bg-orange-100 text-orange-700 rounded-full px-2.5 py-0.5 font-semibold">
                          {r.reason_label}
                        </span>
                        {r.room_id && (
                          <span className="text-xs text-gray-400">채팅방 #{r.room_id}</span>
                        )}
                      </div>

                      {/* 증거 메시지 */}
                      {r.evidence_content && (
                        <div className="mb-3 rounded-xl bg-gray-50 border border-gray-200 px-4 py-2.5">
                          <p className="text-xs text-gray-400 mb-1">증거 메시지 #{r.evidence_message_id}</p>
                          <p className="text-sm text-gray-800">{r.evidence_content}</p>
                        </div>
                      )}

                      {/* 상세 사유 */}
                      {r.detail && (
                        <p className="mb-3 text-sm text-gray-600">
                          <span className="font-semibold">상세:</span> {r.detail}
                        </p>
                      )}

                      <p className="text-xs text-gray-400">
                        {new Date(r.created_at).toLocaleString("ko-KR", {
                          year: "numeric", month: "short", day: "numeric",
                          hour: "2-digit", minute: "2-digit",
                        })}
                      </p>

                      {/* PENDING: 처리 액션 */}
                      {r.status === "PENDING" && (
                        <div className="mt-4 flex flex-col gap-2">
                          <textarea
                            value={reportNotes[r.id] ?? ""}
                            onChange={(e) => setReportNotes((prev) => ({ ...prev, [r.id]: e.target.value }))}
                            placeholder="관리자 메모 (선택)"
                            rows={2}
                            className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-gray-300 focus:outline-none resize-none"
                          />
                          <div className="flex gap-2">
                            <button
                              disabled={reportActionId === r.id}
                              onClick={async () => {
                                if (!confirm(`신고 #${r.id}를 확정하시겠습니까? 피신고자가 제재됩니다.`)) return;
                                setReportActionId(r.id);
                                try {
                                  await apiFetch(`/admin/reports/${r.id}/confirm`, {
                                    method: "POST",
                                    body: JSON.stringify({ note: reportNotes[r.id] ?? "" }),
                                  });
                                  await fetchReports();
                                } catch (e) {
                                  alert(e instanceof Error ? e.message : "처리 실패");
                                } finally {
                                  setReportActionId(null);
                                }
                              }}
                              className="flex-1 rounded-xl bg-red-500 py-2.5 text-sm font-bold text-white hover:bg-red-600 disabled:opacity-50 transition-colors"
                            >
                              {reportActionId === r.id ? "처리 중..." : "⚡ 제재 확정"}
                            </button>
                            <button
                              disabled={reportActionId === r.id}
                              onClick={async () => {
                                setReportActionId(r.id);
                                try {
                                  await apiFetch(`/admin/reports/${r.id}/reject`, {
                                    method: "POST",
                                    body: JSON.stringify({ note: reportNotes[r.id] ?? "" }),
                                  });
                                  await fetchReports();
                                } catch (e) {
                                  alert(e instanceof Error ? e.message : "처리 실패");
                                } finally {
                                  setReportActionId(null);
                                }
                              }}
                              className="flex-1 rounded-xl border-2 border-gray-200 bg-white py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors"
                            >
                              기각
                            </button>
                          </div>
                        </div>
                      )}

                      {/* CONFIRMED / REJECTED: 처리 결과 표시 */}
                      {(r.status === "CONFIRMED" || r.status === "REJECTED") && (
                        <div className={`mt-3 rounded-xl border px-4 py-3 ${
                          r.status === "CONFIRMED"
                            ? "border-red-200 bg-red-50"
                            : "border-gray-200 bg-gray-50"
                        }`}>
                          <p className={`text-xs font-bold mb-1 ${r.status === "CONFIRMED" ? "text-red-700" : "text-gray-600"}`}>
                            {r.status === "CONFIRMED" ? "⚡ 제재 확정됨" : "기각됨"}
                          </p>
                          {r.admin_note && <p className="text-xs text-gray-600">{r.admin_note}</p>}
                          {r.resolved_at && (
                            <p className="text-xs text-gray-400 mt-1">
                              처리일시: {new Date(r.resolved_at).toLocaleString("ko-KR", {
                                year: "numeric", month: "short", day: "numeric",
                                hour: "2-digit", minute: "2-digit",
                              })}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── 탭: 매칭권 지급 ──────────────────────────────────────── */}
      {tab === "tickets" && <TicketGrantTab />}

      {/* ── 탭 2: 출금 신청 관리 ─────────────────────────────────── */}
      {tab === "withdraw" && (
        <div className="max-w-6xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-bold text-gray-900">출금 신청 목록</h2>
              <p className="text-xs text-gray-400 mt-0.5">신청 순서대로 정렬 · 이체 완료 후 "완료" 처리</p>
            </div>
            <button onClick={fetchWithdrawals}
              className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:border-gray-300 transition-all"
            >
              새로고침
            </button>
          </div>

          {withdrawError ? (
            <div className="rounded-xl bg-red-50 border border-red-100 p-4 text-sm text-red-600">
              {withdrawError}
            </div>
          ) : withdrawLoading ? (
            <div className="flex flex-col gap-3">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-20 animate-pulse rounded-2xl bg-gray-100" />
              ))}
            </div>
          ) : withdrawals.length === 0 ? (
            <div className="rounded-2xl bg-white border border-gray-100 p-16 text-center">
              <p className="text-3xl mb-3">💸</p>
              <p className="text-sm font-semibold text-gray-500">처리할 출금 신청이 없습니다</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {withdrawals.map((w) => (
                <div key={w.tx_id} className="rounded-2xl bg-white border border-gray-100 shadow-sm p-5">
                  <div className="flex items-start justify-between gap-4">
                    {/* 신청 정보 */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs bg-orange-100 text-orange-700 rounded-full px-2 py-0.5 font-semibold">
                          tx#{w.tx_id}
                        </span>
                        <span className="text-sm font-bold text-gray-900">
                          {w.nickname ?? `유저 #${w.user_id}`}
                        </span>
                        <span className="text-xs text-gray-400">#{w.user_id}</span>
                      </div>
                      <div className="flex items-baseline gap-2 mt-1">
                        <p className="text-xl font-black text-orange-600">
                          실입금 {w.net_amount.toLocaleString()}원
                        </p>
                        {w.fee > 0 && (
                          <span className="text-xs text-gray-400">
                            (신청 {w.amount.toLocaleString()}원 - 수수료 {w.fee.toLocaleString()}원)
                          </span>
                        )}
                        {w.fee === 0 && (
                          <span className="text-xs bg-emerald-100 text-emerald-700 rounded-full px-2 py-0.5 font-semibold">청약철회</span>
                        )}
                      </div>
                      {w.note && (
                        <p className="mt-1.5 text-xs text-gray-400 bg-gray-50 rounded-lg px-3 py-2">
                          {w.note.replace(/^\[FEE:\d+\|NET:\d+\]\s*/, "")}
                        </p>
                      )}
                      <p className="mt-1.5 text-xs text-gray-400">
                        {new Date(w.created_at).toLocaleString("ko-KR", {
                          year: "numeric", month: "short", day: "numeric",
                          hour: "2-digit", minute: "2-digit"
                        })}
                      </p>
                    </div>

                    {/* 액션 버튼 */}
                    <div className="flex flex-col gap-2 flex-shrink-0">
                      <button
                        onClick={() => handleWithdrawComplete(w.tx_id, w.amount, w.net_amount)}
                        disabled={processingId === w.tx_id}
                        className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50 transition-all whitespace-nowrap"
                      >
                        {processingId === w.tx_id ? "처리 중..." : "✅ 이체 완료"}
                      </button>
                      <button
                        onClick={() => handleWithdrawReject(w.tx_id, w.amount)}
                        disabled={processingId === w.tx_id}
                        className="rounded-xl border border-red-200 px-4 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-40 transition-all whitespace-nowrap"
                      >
                        ❌ 반려
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── 매칭권 지급 탭 컴포넌트 ─────────────────────────────────────

function TicketGrantTab() {
  const [phone, setPhone] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [foundUser, setFoundUser] = useState<TicketGrantUserInfo | null>(null);
  const [amount, setAmount] = useState(1);
  const [note, setNote] = useState("관리자 무상 지급");
  const [granting, setGranting] = useState(false);
  const [grantResult, setGrantResult] = useState<string | null>(null);

  async function handleSearch() {
    setSearchError(null);
    setFoundUser(null);
    setGrantResult(null);
    setSearching(true);
    try {
      const res = await adminSearchUserByPhone(phone.trim());
      setFoundUser(res);
    } catch (e) {
      setSearchError(e instanceof Error ? e.message : "검색 실패");
    } finally {
      setSearching(false);
    }
  }

  async function handleGrant() {
    if (!foundUser) return;
    setGranting(true);
    setGrantResult(null);
    try {
      const res = await adminGrantTickets(foundUser.id, amount, note);
      setGrantResult(`✅ ${res.nickname ?? foundUser.id}님에게 매칭권 ${res.granted}개 지급 완료 (보유: ${res.matching_tickets}개)`);
      setFoundUser({ ...foundUser, matching_tickets: res.matching_tickets });
    } catch (e) {
      setGrantResult(`❌ ${e instanceof Error ? e.message : "지급 실패"}`);
    } finally {
      setGranting(false);
    }
  }

  return (
    <div className="max-w-lg mx-auto px-6 py-6">
      <h2 className="text-base font-bold text-gray-900 mb-1">매칭권 무상 지급</h2>
      <p className="text-xs text-gray-400 mb-6">전화번호로 유저를 검색한 후 매칭권을 지급하세요.</p>

      {/* 전화번호 검색 */}
      <div className="flex gap-2 mb-4">
        <input
          type="text"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          placeholder="01012345678"
          className="flex-1 rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-900 outline-none focus:border-blue-400"
        />
        <button
          onClick={handleSearch}
          disabled={searching || !phone.trim()}
          className="rounded-xl bg-blue-500 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
        >
          {searching ? "검색 중..." : "검색"}
        </button>
      </div>

      {searchError && (
        <div className="rounded-xl bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-600 mb-4">
          {searchError}
        </div>
      )}

      {/* 유저 정보 */}
      {foundUser && (
        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-bold text-gray-900">{foundUser.nickname ?? "닉네임 없음"}</p>
              <p className="text-xs text-gray-400">{foundUser.university ?? "학교 미입력"} · 끝번호 {foundUser.phone_last4}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-400">현재 보유</p>
              <p className="text-lg font-black text-blue-600">{foundUser.matching_tickets}개</p>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-xs font-semibold text-gray-500 mb-1 block">지급 수량</label>
              <input
                type="number"
                min={1}
                max={100}
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value))}
                className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-900 outline-none focus:border-blue-400"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 mb-1 block">사유</label>
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-900 outline-none focus:border-blue-400"
              />
            </div>
          </div>

          <button
            onClick={handleGrant}
            disabled={granting || amount < 1}
            className="w-full rounded-xl bg-blue-500 py-3 text-sm font-bold text-white disabled:opacity-50"
          >
            {granting ? "지급 중..." : `매칭권 ${amount}개 지급`}
          </button>

          {grantResult && (
            <p className="text-sm text-center font-medium text-gray-700">{grantResult}</p>
          )}
        </div>
      )}
    </div>
  );
}
