"use client";
import ErrorBanner from "@/components/ui/ErrorBanner";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Script from "next/script";
import {
  getWallet, getWalletTransactions, prepareCharge, confirmCharge,
  getBankAccount, updateBankAccount, requestWithdraw, getWithdrawPreview,
} from "@/lib/api";
import { AppShell } from "@/components/ui/AppShell";

const TOSS_CLIENT_KEY = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY ?? "";

type TxType = "CHARGE" | "FORFEIT" | "WITHDRAW" | "WITHDRAW_DONE" | "ADMIN_ADJUST" | "TICKET_PURCHASE";

interface Transaction {
  id: number;
  tx_type: TxType;
  amount: number;
  balance_after: number;
  note: string | null;
  meeting_id: number | null;
  created_at: string;
}

const TX_LABELS: Record<TxType, string> = {
  CHARGE: "잔액 충전",
  FORFEIT: "매칭권 몰수",
  WITHDRAW: "출금 신청",
  WITHDRAW_DONE: "출금 완료",
  ADMIN_ADJUST: "관리자 조정",
  TICKET_PURCHASE: "매칭권 구매",
};

const TX_COLORS: Record<TxType, string> = {
  CHARGE: "text-emerald-600",
  FORFEIT: "text-red-700",
  WITHDRAW: "text-orange-500",
  WITHDRAW_DONE: "text-orange-600",
  ADMIN_ADJUST: "text-purple-500",
  TICKET_PURCHASE: "text-indigo-500",
};

const TX_ICONS: Record<TxType, string> = {
  CHARGE: "💳",
  FORFEIT: "🚫",
  WITHDRAW: "💸",
  WITHDRAW_DONE: "✅",
  ADMIN_ADJUST: "🛡️",
  TICKET_PURCHASE: "🎟️",
};

const CHARGE_OPTIONS = [10000, 20000, 30000, 50000];
const WITHDRAW_OPTIONS = [10000, 30000, 50000, 100000];

const BANKS = [
  "카카오뱅크", "토스뱅크", "케이뱅크",
  "국민은행", "신한은행", "우리은행", "하나은행",
  "농협은행", "기업은행", "SC제일은행", "씨티은행",
  "새마을금고", "신협", "우체국", "저축은행",
];

export default function WalletPage() {
  const router = useRouter();

  // 지갑
  const [balance, setBalance] = useState<number | null>(null);
  const [matchingTickets, setMatchingTickets] = useState(0);
  const [canAfford, setCanAfford] = useState(false);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 충전
  const [charging, setCharging] = useState(false);
  const [chargeAmount, setChargeAmount] = useState(10000);
  const [showChargeModal, setShowChargeModal] = useState(false);

  // 계좌
  const [bankName, setBankName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountHolder, setAccountHolder] = useState("");
  const [savingAccount, setSavingAccount] = useState(false);
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [hasAccount, setHasAccount] = useState(false);

  // 출금
  const [withdrawAmount, setWithdrawAmount] = useState(10000);
  const [withdrawing, setWithdrawing] = useState(false);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [withdrawPreview, setWithdrawPreview] = useState<{
    refund_type: "청약철회" | "일반환불"; fee: number; net_amount: number; eligible: boolean; reason: string;
  } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  useEffect(() => {
    const anyOpen = showChargeModal || showAccountModal || showWithdrawModal;
    document.body.style.overflow = anyOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [showChargeModal, showAccountModal, showWithdrawModal]);

  const loadData = async () => {
    try {
      const [wallet, txData, account] = await Promise.all([
        getWallet(),
        getWalletTransactions(30),
        getBankAccount(),
      ]);
      setBalance(wallet.balance);
      setMatchingTickets(wallet.matching_tickets);
      setCanAfford(wallet.can_afford);
      setTransactions(txData.transactions as Transaction[]);
      if (account.bank_name) {
        setBankName(account.bank_name);
        setAccountNumber(account.account_number ?? "");
        setAccountHolder(account.account_holder ?? "");
        setHasAccount(true);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "데이터 로드 실패");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  // Toss 결제 성공 리다이렉트 처리 (paymentKey, orderId, amount 쿼리 파라미터)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const paymentKey = params.get("paymentKey");
    const orderId = params.get("orderId");
    const amount = params.get("amount");
    if (!paymentKey || !orderId || !amount) return;

    console.log("🔍 Toss 리다이렉트 파라미터:", { paymentKey, orderId, amount });
    window.history.replaceState({}, "", "/me/wallet");
    setCharging(true);
    confirmCharge({ order_id: orderId, payment_key: paymentKey, amount: Number(amount) })
      .then(async () => {
        await loadData();
        alert(`✅ ${Number(amount).toLocaleString()}원이 충전되었습니다!`);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "충전 확인 실패"))
      .finally(() => setCharging(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCharge = async () => {
    if (chargeAmount < 1000) { setError("최소 1,000원 이상 충전하세요"); return; }
    setCharging(true);
    setError(null);
    try {
      const { orderId, orderName } = await prepareCharge(chargeAmount);

      if (TOSS_CLIENT_KEY) {
        // Toss 결제창 실행 — 성공 시 이 페이지로 리다이렉트되어 위의 useEffect가 처리
        const tossPayments = (window as any).TossPayments(TOSS_CLIENT_KEY);
        tossPayments.requestPayment("카드", {
          amount: chargeAmount,
          orderId,
          orderName,
          customerName: "MEETIN 회원",
          successUrl: `${window.location.origin}/me/wallet`,
          failUrl: `${window.location.origin}/me/wallet`,
        });
        return; // Toss가 페이지를 리다이렉트하므로 이후 코드 실행 안 됨
      }

      // Mock 모드 (TOSS_CLIENT_KEY 없는 개발 환경)
      await confirmCharge({ order_id: orderId, payment_key: "mock_key", amount: chargeAmount });
      await loadData();
      setShowChargeModal(false);
      alert(`✅ ${chargeAmount.toLocaleString()}원이 충전되었습니다! (테스트 모드)`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "충전 실패");
    } finally {
      setCharging(false);
    }
  };

  const handleSaveAccount = async () => {
    if (!bankName || !accountNumber.trim() || !accountHolder.trim()) {
      setError("모든 계좌 정보를 입력해주세요."); return;
    }
    setSavingAccount(true);
    setError(null);
    try {
      await updateBankAccount({ bank_name: bankName, account_number: accountNumber.trim(), account_holder: accountHolder.trim() });
      setHasAccount(true);
      setShowAccountModal(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "계좌 저장 실패");
    } finally {
      setSavingAccount(false);
    }
  };

  const fetchWithdrawPreview = async (amount: number) => {
    if (amount < 1000) { setWithdrawPreview(null); return; }
    setPreviewLoading(true);
    try {
      const preview = await getWithdrawPreview(amount);
      setWithdrawPreview(preview);
    } catch { setWithdrawPreview(null); }
    finally { setPreviewLoading(false); }
  };

  const handleWithdraw = async () => {
    if (!hasAccount) { setError("출금 계좌를 먼저 등록해주세요."); return; }
    if (!withdrawPreview?.eligible) { setError("출금 불가 조건입니다."); return; }
    setWithdrawing(true);
    setError(null);
    try {
      const res = await requestWithdraw(withdrawAmount);
      await loadData();
      setShowWithdrawModal(false);
      const netStr = res.net_amount.toLocaleString();
      alert(`✅ 출금 신청이 완료되었습니다.\n실입금액 ${netStr}원이 1~2 영업일 내에 ${bankName} ${accountNumber}로 입금됩니다.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "출금 신청 실패");
    } finally {
      setWithdrawing(false);
    }
  };

  if (loading) {
    return (
      <AppShell>
        <div className="flex min-h-[60vh] items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-200 border-t-blue-600" />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      {TOSS_CLIENT_KEY && (
        <Script src="https://js.tosspayments.com/v1/payment" strategy="afterInteractive" />
      )}
      <div className="mx-auto max-w-md px-4 py-6 space-y-5">

        {/* 잔액 카드 */}
        <div className="rounded-3xl bg-gradient-to-br from-blue-600 to-blue-800 p-6 text-white shadow-xl">
          <p className="text-sm font-medium text-blue-200">현재 잔액</p>
          <p className="mt-1 text-4xl font-black tracking-tight">
            {balance?.toLocaleString() ?? "—"}
            <span className="ml-1 text-lg font-semibold text-blue-200">원</span>
          </p>

          <div className="mt-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-blue-200">매칭권</p>
              <p className="text-sm font-bold text-white">{matchingTickets}개</p>
            </div>
            <div className={`rounded-full px-3 py-1 text-xs font-bold ${
              canAfford ? "bg-emerald-500/30 text-emerald-200" : "bg-red-500/30 text-red-200"
            }`}>
              {canAfford ? "✓ 매칭권 보유 중" : "⚠ 매칭권 없음"}
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3">
            <button
              onClick={() => setShowChargeModal(true)}
              className="rounded-2xl bg-white/20 py-3 text-sm font-bold text-white hover:bg-white/30 active:scale-95 transition-all"
            >
              + 잔액 충전
            </button>
            <button
              onClick={() => {
                if (!hasAccount) { setShowAccountModal(true); return; }
                setShowWithdrawModal(true);
                fetchWithdrawPreview(withdrawAmount);
              }}
              className="rounded-2xl bg-white/10 border border-white/30 py-3 text-sm font-bold text-white hover:bg-white/20 active:scale-95 transition-all"
            >
              잔액 출금
            </button>
          </div>
        </div>

        {/* 에러 */}
        {error && (
          <ErrorBanner message={error} />
        )}

        {/* 계좌 정보 */}
        <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-gray-800">출금 계좌</p>
              {hasAccount ? (
                <p className="mt-0.5 text-sm text-gray-500">
                  {bankName} · {accountNumber} ({accountHolder})
                </p>
              ) : (
                <p className="mt-0.5 text-xs text-gray-400">등록된 계좌가 없습니다</p>
              )}
            </div>
            <button
              onClick={() => setShowAccountModal(true)}
              className="rounded-xl border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:border-blue-400 hover:text-blue-600 transition-all"
            >
              {hasAccount ? "수정" : "등록"}
            </button>
          </div>
        </div>

        {/* 거래 내역 */}
        <div>
          <h3 className="mb-3 text-base font-bold text-gray-900">거래 내역</h3>
          {transactions.length === 0 ? (
            <div className="rounded-2xl bg-white border border-gray-100 p-8 text-center shadow-sm">
              <p className="text-sm text-gray-400">거래 내역이 없습니다</p>
            </div>
          ) : (
            <div className="rounded-2xl bg-white border border-gray-100 shadow-sm overflow-hidden">
              {transactions.map((tx, idx) => (
                <div
                  key={tx.id}
                  className={`flex items-center gap-4 px-4 py-4 ${
                    idx < transactions.length - 1 ? "border-b border-gray-50" : ""
                  }`}
                >
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-gray-100 text-lg">
                    {TX_ICONS[tx.tx_type]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800">{TX_LABELS[tx.tx_type]}</p>
                    {tx.note && (
                      <p className="mt-0.5 truncate text-xs text-gray-400">{tx.note}</p>
                    )}
                    <p className="mt-0.5 text-xs text-gray-300">
                      {new Date(tx.created_at).toLocaleString("ko-KR", {
                        month: "short", day: "numeric", hour: "2-digit", minute: "2-digit"
                      })}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className={`text-sm font-bold ${TX_COLORS[tx.tx_type]}`}>
                      {tx.amount > 0 ? `+${tx.amount.toLocaleString()}` : tx.amount === 0 ? "—" : tx.amount.toLocaleString()}원
                    </p>
                    <p className="mt-0.5 text-xs text-gray-400">{tx.balance_after.toLocaleString()}원</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 충전 모달 */}
      {showChargeModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40">
          <div className="w-full max-w-md rounded-t-3xl bg-white p-6 pb-modal-safe">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">잔액 충전</h2>
              <button onClick={() => setShowChargeModal(false)} className="flex h-11 w-11 items-center justify-center rounded-full text-gray-400 active:bg-gray-100 text-xl">✕</button>
            </div>
            <div className="grid grid-cols-2 gap-3 mb-4">
              {CHARGE_OPTIONS.map((opt) => (
                <button key={opt} onClick={() => setChargeAmount(opt)}
                  className={`rounded-xl border-2 py-3 text-sm font-bold transition-all ${
                    chargeAmount === opt ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-200 text-gray-600 hover:border-gray-300"
                  }`}
                >
                  {opt.toLocaleString()}원
                </button>
              ))}
            </div>
            <div className="mb-5">
              <label className="mb-1.5 block text-xs font-medium text-gray-500">직접 입력</label>
              <div className="flex items-center gap-2">
                <input type="number" value={chargeAmount} onChange={(e) => setChargeAmount(Number(e.target.value))}
                  min={1000} max={500000} step={1000}
                  className="flex-1 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base outline-none focus:border-blue-400"
                />
                <span className="text-sm text-gray-500">원</span>
              </div>
              <p className="mt-1 text-xs text-gray-400">최소 1,000원 · 최대 500,000원</p>
            </div>
            {error && <p className="mb-3 text-xs text-red-500">{error}</p>}
            <button onClick={handleCharge} disabled={charging}
              className="w-full rounded-xl bg-blue-600 py-3.5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50 transition-all"
            >
              {charging ? "처리 중..." : `${chargeAmount.toLocaleString()}원 충전하기`}
            </button>
            <p className="mt-3 text-center text-xs text-gray-400">
              {TOSS_CLIENT_KEY ? "토스 결제창으로 이동합니다" : "개발 환경 — 실제 결제 없이 바로 충전됩니다"}
            </p>
          </div>
        </div>
      )}

      {/* 계좌 등록 모달 */}
      {showAccountModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40">
          <div className="w-full max-w-md rounded-t-3xl bg-white p-6 pb-modal-safe">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">출금 계좌 등록</h2>
              <button onClick={() => setShowAccountModal(false)} className="flex h-11 w-11 items-center justify-center rounded-full text-gray-400 active:bg-gray-100 text-xl">✕</button>
            </div>

            <div className="space-y-4 mb-6">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-500">은행</label>
                <select value={bankName} onChange={(e) => setBankName(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900 outline-none focus:border-blue-400"
                >
                  <option value="">은행 선택</option>
                  {BANKS.map((b) => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-500">계좌번호</label>
                <input type="text" value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)}
                  placeholder="- 없이 숫자만 입력"
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900 placeholder-gray-400 outline-none focus:border-blue-400"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-500">예금주</label>
                <input type="text" value={accountHolder} onChange={(e) => setAccountHolder(e.target.value)}
                  placeholder="예금주 실명"
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900 placeholder-gray-400 outline-none focus:border-blue-400"
                />
              </div>
            </div>

            {error && <p className="mb-3 text-xs text-red-500">{error}</p>}
            <button onClick={handleSaveAccount} disabled={savingAccount}
              className="w-full rounded-xl bg-blue-600 py-3.5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50 transition-all"
            >
              {savingAccount ? "저장 중..." : "계좌 저장"}
            </button>
          </div>
        </div>
      )}

      {/* 출금 신청 모달 */}
      {showWithdrawModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40">
          <div className="w-full max-w-md rounded-t-3xl bg-white p-6 pb-modal-safe">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">잔액 출금</h2>
              <button onClick={() => setShowWithdrawModal(false)} className="flex h-11 w-11 items-center justify-center rounded-full text-gray-400 active:bg-gray-100 text-xl">✕</button>
            </div>

            <div className="mb-4 rounded-xl bg-gray-50 px-4 py-3">
              <p className="text-xs text-gray-500">출금 계좌</p>
              <p className="mt-0.5 text-sm font-semibold text-gray-800">
                {bankName} {accountNumber} ({accountHolder})
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-4">
              {WITHDRAW_OPTIONS.map((opt) => (
                <button key={opt} onClick={() => { setWithdrawAmount(opt); fetchWithdrawPreview(opt); }}
                  className={`rounded-xl border-2 py-3 text-sm font-bold transition-all ${
                    withdrawAmount === opt ? "border-orange-500 bg-orange-50 text-orange-700" : "border-gray-200 text-gray-600 hover:border-gray-300"
                  }`}
                >
                  {opt.toLocaleString()}원
                </button>
              ))}
            </div>

            <div className="mb-4">
              <label className="mb-1.5 block text-xs font-medium text-gray-500">직접 입력</label>
              <div className="flex items-center gap-2">
                <input type="number" value={withdrawAmount}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setWithdrawAmount(v);
                    fetchWithdrawPreview(v);
                  }}
                  min={1000} max={1000000} step={1000}
                  className="flex-1 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900 outline-none focus:border-orange-400"
                />
                <span className="text-sm text-gray-500">원</span>
              </div>
              <p className="mt-1 text-xs text-gray-400">
                현재 잔액 {balance?.toLocaleString()}원
              </p>
            </div>

            {/* 수수료 미리보기 */}
            {previewLoading ? (
              <div className="mb-4 h-20 animate-pulse rounded-2xl bg-gray-100" />
            ) : withdrawPreview ? (
              <div className={`mb-4 rounded-2xl border px-4 py-3.5 ${
                withdrawPreview.refund_type === "청약철회"
                  ? "border-emerald-200 bg-emerald-50"
                  : "border-orange-100 bg-orange-50"
              }`}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-gray-500">환불 유형</span>
                  <span className={`text-xs font-bold rounded-full px-2 py-0.5 ${
                    withdrawPreview.refund_type === "청약철회"
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-orange-100 text-orange-700"
                  }`}>
                    {withdrawPreview.refund_type}
                  </span>
                </div>
                <div className="space-y-1.5 text-sm">
                  <div className="flex justify-between text-gray-600">
                    <span>출금 신청액</span>
                    <span>{withdrawAmount.toLocaleString()}원</span>
                  </div>
                  <div className="flex justify-between text-gray-500 text-xs">
                    <span>수수료 ({withdrawPreview.refund_type === "청약철회" ? "없음" : "10%"})</span>
                    <span>- {withdrawPreview.fee.toLocaleString()}원</span>
                  </div>
                  <div className="flex justify-between font-bold text-gray-900 border-t border-gray-200 pt-1.5 mt-1.5">
                    <span>실제 입금액</span>
                    <span className="text-orange-600">{withdrawPreview.net_amount.toLocaleString()}원</span>
                  </div>
                </div>
                {!withdrawPreview.eligible && (
                  <p className="mt-2 text-xs text-red-500">수수료 차감 후 입금액이 최소 기준 미만입니다.</p>
                )}
              </div>
            ) : null}

            {error && <p className="mb-3 text-xs text-red-500">{error}</p>}
            <button onClick={handleWithdraw} disabled={withdrawing || !withdrawPreview?.eligible}
              className="w-full rounded-xl bg-orange-500 py-3.5 text-sm font-bold text-white hover:bg-orange-600 disabled:opacity-50 transition-all"
            >
              {withdrawing ? "처리 중..." : `${withdrawAmount.toLocaleString()}원 출금 신청`}
            </button>
            <p className="mt-3 text-center text-xs text-gray-400">신청 후 1~2 영업일 내 입금됩니다</p>
          </div>
        </div>
      )}
    </AppShell>
  );
}
