"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getMyTickets, purchaseTickets, getWallet } from "@/lib/api";
import type { TicketTx } from "@/lib/api";
import { AppShell } from "@/components/ui/AppShell";

const PURCHASE_OPTIONS = [
  { count: 1,  price: 2_000 },
  { count: 3,  price: 6_000 },
  { count: 5,  price: 10_000 },
  { count: 10, price: 20_000 },
  { count: 15, price: 30_000 },
  { count: 20, price: 40_000 },
];

const TX_TYPE_LABEL: Record<string, string> = {
  PURCHASE: "구매",
  CONSUME:  "소모",
  REFUND:   "환급",
};

export default function TicketsPage() {
  const router = useRouter();
  const [tickets, setTickets] = useState<number>(0);
  const [balance, setBalance] = useState<number>(0);
  const [txs, setTxs] = useState<TicketTx[]>([]);
  const [loading, setLoading] = useState(true);
  const [buying, setBuying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      const [ticketData, walletData] = await Promise.all([
        getMyTickets(),
        getWallet(),
      ]);
      setTickets(ticketData.tickets);
      setTxs(ticketData.transactions);
      setBalance(walletData.balance);
    } catch (e) {
      setError(e instanceof Error ? e.message : "오류가 발생했습니다");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handlePurchase = async (count: number, price: number) => {
    if (balance < price) return;
    if (!confirm(`매칭권 ${count}개를 ₩${price.toLocaleString()}에 구매하시겠습니까?`)) return;
    setBuying(true);
    try {
      const res = await purchaseTickets(count);
      setTickets(res.tickets);
      setBalance(res.balance);
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "구매 실패");
    } finally {
      setBuying(false);
    }
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-md px-4 py-6 space-y-6">
        <h1 className="text-xl font-bold text-gray-900">매칭권</h1>

        {loading ? (
          <div className="text-center text-gray-400 py-10">로딩 중...</div>
        ) : error ? (
          <div className="text-red-500 text-sm">{error}</div>
        ) : (
          <>
            {/* 보유 티켓 */}
            <div className="rounded-2xl bg-blue-600 p-6 text-white text-center shadow">
              <p className="text-sm font-medium opacity-80 mb-1">보유 매칭권</p>
              <p className="text-5xl font-black">{tickets}</p>
              <p className="text-sm opacity-70 mt-1">개</p>
            </div>

            {/* 잔액 */}
            <div className="rounded-xl bg-white border border-gray-100 px-4 py-3 flex items-center justify-between shadow-sm">
              <span className="text-sm text-gray-500">현재 잔액</span>
              <span className="font-bold text-gray-800">₩{balance.toLocaleString()}</span>
            </div>

            {/* 구매 옵션 */}
            <div>
              <p className="text-sm font-semibold text-gray-700 mb-3">매칭권 구매</p>
              <div className="grid grid-cols-2 gap-2">
                {PURCHASE_OPTIONS.map(({ count, price }) => {
                  const canAfford = balance >= price;
                  return (
                    <button
                      key={count}
                      onClick={() => handlePurchase(count, price)}
                      disabled={!canAfford || buying}
                      className={`rounded-xl border px-4 py-3.5 text-center transition-all ${
                        canAfford
                          ? "border-blue-200 bg-white hover:bg-blue-50 active:scale-95"
                          : "border-gray-100 bg-gray-50 opacity-50 cursor-not-allowed"
                      }`}
                    >
                      <p className="text-lg font-bold text-gray-900">{count}개</p>
                      <p className="text-sm text-blue-600 font-semibold">₩{price.toLocaleString()}</p>
                      {!canAfford && (
                        <p className="text-xs text-red-400 mt-0.5">잔액 부족</p>
                      )}
                    </button>
                  );
                })}
              </div>
              {balance < 2_000 && (
                <button
                  onClick={() => router.push("/me/wallet")}
                  className="mt-3 w-full rounded-xl bg-gray-100 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-200 active:bg-gray-300 transition-colors"
                >
                  잔액 충전하러 가기 →
                </button>
              )}
            </div>

            {/* 이력 */}
            <div>
              <p className="text-sm font-semibold text-gray-700 mb-2">이력</p>
              {txs.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">이력이 없습니다</p>
              ) : (
                <div className="space-y-2">
                  {txs.map((t) => (
                    <div
                      key={t.id}
                      className="rounded-xl bg-white border border-gray-100 px-4 py-3 flex items-center justify-between shadow-sm"
                    >
                      <div>
                        <p className="text-sm font-medium text-gray-800">
                          {TX_TYPE_LABEL[t.tx_type] ?? t.tx_type}
                        </p>
                        <p className="text-xs text-gray-400">{t.note ?? ""}</p>
                      </div>
                      <div className="text-right">
                        <p
                          className={`text-sm font-bold ${
                            t.amount > 0 ? "text-blue-600" : t.amount < 0 ? "text-red-500" : "text-gray-400"
                          }`}
                        >
                          {t.amount > 0 ? "+" : ""}{t.amount}개
                        </p>
                        <p className="text-xs text-gray-400">{t.tickets_after}개 보유</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
