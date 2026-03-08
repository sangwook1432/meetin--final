"use client";

/**
 * /me/wallet — 내 지갑 (잔액 조회 + 충전 + 거래 내역)
 *
 * - 현재 잔액 표시
 * - Toss 위젯으로 잔액 충전 (개발환경: mock)
 * - 거래 내역: 충전 / 보증금 차감 / 환급 / 몰수
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getWallet, getWalletTransactions, prepareCharge, confirmCharge } from "@/lib/api";
import { AppShell } from "@/components/ui/AppShell";

type TxType = "CHARGE" | "DEPOSIT_DEDUCT" | "DEPOSIT_REFUND" | "DEPOSIT_FORFEIT" | "ADMIN_ADJUST";

interface Transaction {
  id: number;
  tx_type: TxType;
  amount: number;
  balance_after: number;
  description: string | null;
  ref_meeting_id: number | null;
  created_at: string;
}

const TX_LABELS: Record<TxType, string> = {
  CHARGE: "잔액 충전",
  DEPOSIT_DEDUCT: "보증금 차감",
  DEPOSIT_REFUND: "보증금 환급",
  DEPOSIT_FORFEIT: "보증금 몰수",
  ADMIN_ADJUST: "관리자 조정",
};

const TX_COLORS: Record<TxType, string> = {
  CHARGE: "text-emerald-600",
  DEPOSIT_DEDUCT: "text-red-500",
  DEPOSIT_REFUND: "text-blue-500",
  DEPOSIT_FORFEIT: "text-orange-500",
  ADMIN_ADJUST: "text-purple-500",
};

const TX_ICONS: Record<TxType, string> = {
  CHARGE: "💳",
  DEPOSIT_DEDUCT: "📤",
  DEPOSIT_REFUND: "📥",
  DEPOSIT_FORFEIT: "💸",
  ADMIN_ADJUST: "🛡️",
};

const CHARGE_OPTIONS = [10000, 20000, 30000, 50000];

export default function WalletPage() {
  const router = useRouter();
  const [balance, setBalance] = useState<number | null>(null);
  const [depositAmount, setDepositAmount] = useState(10000);
  const [canAfford, setCanAfford] = useState(false);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [charging, setCharging] = useState(false);
  const [chargeAmount, setChargeAmount] = useState(10000);
  const [showChargeModal, setShowChargeModal] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    try {
      const [wallet, txData] = await Promise.all([
        getWallet(),
        getWalletTransactions(30),
      ]);
      setBalance(wallet.balance);
      setDepositAmount(wallet.deposit_amount);
      setCanAfford(wallet.can_afford);
      setTransactions(txData.transactions as Transaction[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "데이터 로드 실패");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const handleCharge = async () => {
    if (chargeAmount < 1000) {
      setError("최소 1,000원 이상 충전하세요");
      return;
    }
    setCharging(true);
    setError(null);
    try {
      // Toss 결제 위젯 (개발환경: mock 처리)
      const { orderId } = await prepareCharge(chargeAmount);

      // 개발환경: mock 충전 처리 (Toss 실결제 없이 바로 잔액 증가)
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
              <p className="text-xs text-blue-200">보증금</p>
              <p className="text-sm font-bold text-white">{depositAmount.toLocaleString()}원</p>
            </div>
            <div className={`rounded-full px-3 py-1 text-xs font-bold ${
              canAfford ? "bg-emerald-500/30 text-emerald-200" : "bg-red-500/30 text-red-200"
            }`}>
              {canAfford ? "✓ 보증금 충분" : "⚠ 잔액 부족"}
            </div>
          </div>

          <button
            onClick={() => setShowChargeModal(true)}
            className="mt-5 w-full rounded-2xl bg-white/20 py-3 text-sm font-bold text-white hover:bg-white/30 active:scale-95 transition-all"
          >
            + 잔액 충전
          </button>
        </div>

        {/* 에러 */}
        {error && (
          <div className="rounded-xl bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-600">
            {error}
          </div>
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
                  {/* 아이콘 */}
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-gray-100 text-lg">
                    {TX_ICONS[tx.tx_type]}
                  </div>

                  {/* 내용 */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800">
                      {TX_LABELS[tx.tx_type]}
                    </p>
                    {tx.description && (
                      <p className="mt-0.5 truncate text-xs text-gray-400">{tx.description}</p>
                    )}
                    <p className="mt-0.5 text-xs text-gray-300">
                      {new Date(tx.created_at).toLocaleString("ko-KR", {
                        month: "short", day: "numeric", hour: "2-digit", minute: "2-digit"
                      })}
                    </p>
                  </div>

                  {/* 금액 */}
                  <div className="text-right">
                    <p className={`text-sm font-bold ${TX_COLORS[tx.tx_type]}`}>
                      {tx.amount > 0 ? `+${tx.amount.toLocaleString()}` : tx.amount.toLocaleString()}원
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
          <div className="w-full max-w-md rounded-t-3xl bg-white p-6 pb-10">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">잔액 충전</h2>
              <button
                onClick={() => setShowChargeModal(false)}
                className="text-gray-400 hover:text-gray-600 text-xl"
              >✕</button>
            </div>

            <p className="mb-3 text-sm text-gray-600">충전 금액 선택</p>

            {/* 빠른 선택 */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              {CHARGE_OPTIONS.map((opt) => (
                <button
                  key={opt}
                  onClick={() => setChargeAmount(opt)}
                  className={`rounded-xl border-2 py-3 text-sm font-bold transition-all ${
                    chargeAmount === opt
                      ? "border-blue-500 bg-blue-50 text-blue-700"
                      : "border-gray-200 text-gray-600 hover:border-gray-300"
                  }`}
                >
                  {opt.toLocaleString()}원
                </button>
              ))}
            </div>

            {/* 직접 입력 */}
            <div className="mb-5">
              <label className="mb-1.5 block text-xs font-medium text-gray-500">직접 입력</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={chargeAmount}
                  onChange={(e) => setChargeAmount(Number(e.target.value))}
                  min={1000}
                  max={500000}
                  step={1000}
                  className="flex-1 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none focus:border-blue-400"
                />
                <span className="text-sm text-gray-500">원</span>
              </div>
              <p className="mt-1 text-xs text-gray-400">최소 1,000원 · 최대 500,000원</p>
            </div>

            {error && (
              <p className="mb-3 text-xs text-red-500">{error}</p>
            )}

            <button
              onClick={handleCharge}
              disabled={charging}
              className="w-full rounded-xl bg-blue-600 py-3.5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50 transition-all"
            >
              {charging ? "처리 중..." : `${chargeAmount.toLocaleString()}원 충전하기`}
            </button>

            <p className="mt-3 text-center text-xs text-gray-400">
              개발 환경에서는 실제 결제 없이 바로 충전됩니다
            </p>
          </div>
        </div>
      )}
    </AppShell>
  );
}
