"use client";
import ErrorBanner from "@/components/ui/ErrorBanner";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Script from "next/script";
import {
  getWallet, getWalletTransactions, prepareCharge, confirmCharge,
  requestWithdraw, getWithdrawPreview,
} from "@/lib/api";
import { AppShell } from "@/components/ui/AppShell";

const IMP_CODE = process.env.NEXT_PUBLIC_IMP_CODE ?? "";
const IMP_PAY_CHANNEL_KEY = process.env.NEXT_PUBLIC_IMP_PAY_CHANNEL_KEY ?? "";

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

  // 출금
  const [withdrawAmount, setWithdrawAmount] = useState(10000);
  const [withdrawing, setWithdrawing] = useState(false);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [withdrawPreview, setWithdrawPreview] = useState<{
    refund_type: "청약철회" | "일반환불"; fee: number; net_amount: number; eligible: boolean; reason: string;
  } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  useEffect(() => {
    const anyOpen = showChargeModal || showWithdrawModal;
    document.body.style.overflow = anyOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [showChargeModal, showWithdrawModal]);

  const loadData = async () => {
    try {
      const [wallet, txData] = await Promise.all([
        getWallet(),
        getWalletTransactions(30),
      ]);
      setBalance(wallet.balance);
      setMatchingTickets(wallet.matching_tickets);
      setCanAfford(wallet.can_afford);
      setTransactions(txData.transactions as Transaction[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "데이터 로드 실패");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  // 포트원 결제 리다이렉트 처리 (imp_uid, merchant_uid, imp_success 쿼리 파라미터)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const imp_uid = params.get("imp_uid");
    const merchant_uid = params.get("merchant_uid");
    const imp_success = params.get("imp_success");
    const amount = params.get("amount");
    if (!imp_uid || !merchant_uid) return;

    window.history.replaceState({}, "", "/me/wallet");

    if (imp_success === "false") {
      setError("결제가 취소되었습니다.");
      return;
    }

    setCharging(true);
    confirmCharge({ imp_uid, merchant_uid, amount: Number(amount) })
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

      if (IMP_CODE) {
        const IMP = (window as any).IMP;
        IMP.init(IMP_CODE);
        IMP.request_pay(
          {
            channelKey: IMP_PAY_CHANNEL_KEY,
            pay_method: "card",
            merchant_uid: orderId,
            name: orderName,
            amount: chargeAmount,
            m_redirect_url: `${window.location.origin}/me/wallet?merchant_uid=${orderId}&amount=${chargeAmount}`,
          },
          async (rsp: any) => {
            if (!rsp.success) {
              setError(rsp.error_msg ?? "결제에 실패했습니다.");
              setCharging(false);
              return;
            }
            try {
              await confirmCharge({ imp_uid: rsp.imp_uid, merchant_uid: rsp.merchant_uid, amount: chargeAmount });
              await loadData();
              setShowChargeModal(false);
              alert(`✅ ${chargeAmount.toLocaleString()}원이 충전되었습니다!`);
            } catch (e) {
              setError(e instanceof Error ? e.message : "충전 확인 실패");
            } finally {
              setCharging(false);
            }
          },
        );
        return;
      }

      // Mock 모드 (IMP_CODE 없는 개발 환경)
      await confirmCharge({ imp_uid: "mock_imp_uid", merchant_uid: orderId, amount: chargeAmount });
      await loadData();
      setShowChargeModal(false);
      alert(`✅ ${chargeAmount.toLocaleString()}원이 충전되었습니다! (테스트 모드)`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "충전 실패");
    } finally {
      setCharging(false);
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
    if (!withdrawPreview?.eligible) { setError("출금 불가 조건입니다."); return; }
    setWithdrawing(true);
    setError(null);
    try {
      const res = await requestWithdraw(withdrawAmount);
      await loadData();
      setShowWithdrawModal(false);
      const netStr = res.net_amount.toLocaleString();
      alert(`✅ 출금 신청이 완료되었습니다.\n실환불액 ${netStr}원이 원결제 수단으로 환불됩니다.`);
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
      {IMP_CODE && (
        <Script src="https://cdn.iamport.kr/v1/iamport.js" strategy="afterInteractive" />
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

        {/* 서비스 상세 설명 + 사업자 정보 */}
        <div className="rounded-2xl border border-gray-100 bg-white px-4 py-4 text-xs text-gray-500 space-y-1.5">
          <p className="font-semibold text-gray-700 mb-2">서비스 상세 설명</p>
          <p>MEETIN.은 대학생 미팅 주선 디지털 서비스입니다.</p>
          <p>· <span className="font-medium text-gray-700">잔액 충전</span>: 앱 내 전자지갑에 충전하는 선불 충전금 (1,000원 단위, 최대 500,000원)</p>
          <p>· <span className="font-medium text-gray-700">매칭권</span>: 미팅 참가 신청에 필요한 디지털 이용권 (잔액으로 구매)</p>
          <p>· 결제 후 미팅 매칭이 확정된 시점부터 서비스가 제공됩니다.</p>
          <p>· 미사용 잔액은 환불 정책에 따라 출금 신청이 가능합니다.</p>

          <div className="my-2 border-t border-gray-100" />

          <p className="font-semibold text-gray-700 mb-1.5">사업자 정보</p>
          <p className="text-gray-400">상호명: MEETIN. · 대표자: 전상욱</p>
          <p className="text-gray-400">사업자등록번호: 420-05-03754 (간이과세자)</p>
          <p className="text-gray-400">사업장주소: 경기도 고양시 일산서구 대산로 106, 109동 1401호 (주엽동, 강선마을)</p>
          <p className="text-gray-400">통신판매업신고번호: 2026-고양일산서-0435</p>
          <p className="text-gray-400">유선번호: 010-4544-7834</p>
          <p className="text-gray-400">이메일: adamjeon2003@gmail.com</p>
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
              {IMP_CODE ? "KG이니시스 결제창으로 이동합니다" : "개발 환경 — 실제 결제 없이 바로 충전됩니다"}
            </p>
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
                    <span>실제 환불액</span>
                    <span className="text-orange-600">{withdrawPreview.net_amount.toLocaleString()}원</span>
                  </div>
                </div>
                {!withdrawPreview.eligible && (
                  <p className="mt-2 text-xs text-red-500">수수료 차감 후 환불액이 최소 기준 미만입니다.</p>
                )}
              </div>
            ) : null}

            {error && <p className="mb-3 text-xs text-red-500">{error}</p>}
            <button onClick={handleWithdraw} disabled={withdrawing || !withdrawPreview?.eligible}
              className="w-full rounded-xl bg-orange-500 py-3.5 text-sm font-bold text-white hover:bg-orange-600 disabled:opacity-50 transition-all"
            >
              {withdrawing ? "처리 중..." : `${withdrawAmount.toLocaleString()}원 출금 신청`}
            </button>
            <p className="mt-3 text-center text-xs text-gray-400">신청 후 관리자 확인을 거쳐 원결제 수단으로 환불됩니다</p>
          </div>
        </div>
      )}
    </AppShell>
  );
}
