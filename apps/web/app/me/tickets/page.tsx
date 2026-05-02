"use client";

/**
 * /me/tickets — V1 매칭권 페이지 (메인 탭)
 *
 * 기능:
 *  1. 보유 매칭권 hero 카드
 *  2. 잔액 표시 + 충전 진입
 *  3. 6개 구매 옵션 (10/15/20에는 할인 뱃지)
 *  4. 사용 이력 리스트
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getMyTickets, purchaseTickets, getWallet } from "@/lib/api";
import type { TicketTx } from "@/lib/api";
import { AppShell } from "@/components/ui/AppShell";

const PURCHASE_OPTIONS: { count: number; price: number; save?: string }[] = [
  { count: 1,  price: 2_000 },
  { count: 3,  price: 6_000 },
  { count: 5,  price: 10_000 },
  { count: 10, price: 18_000, save: "10% 할인" },
  { count: 15, price: 26_000, save: "14% 할인" },
  { count: 20, price: 32_000, save: "20% 할인" },
];

const TX_TYPE_LABEL: Record<string, string> = {
  PURCHASE: "구매",
  CONSUME: "사용",
  REFUND: "환급",
  WELCOME_BONUS: "환영 보너스",
  ADMIN_GRANT: "관리자 지급",
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
      <div className="mx-auto max-w-md px-5 pt-5 pb-6">
        {loading ? (
          <div className="flex items-center justify-center py-16" style={{ color: "var(--ink-soft)" }}>
            로딩 중...
          </div>
        ) : error ? (
          <div
            className="px-4 py-6 text-center"
            style={{
              background: "var(--danger-soft)",
              border: "1px solid var(--danger)",
              borderRadius: "var(--radius-lg)",
            }}
          >
            <p className="text-sm" style={{ color: "var(--danger)" }}>{error}</p>
          </div>
        ) : (
          <>
            {/* Hero 티켓 카드 */}
            <div
              className="px-6 py-6 mb-4 relative overflow-hidden"
              style={{
                background: "linear-gradient(135deg, var(--accent) 0%, oklch(0.62 0.14 28) 100%)",
                color: "#fff",
                borderRadius: "var(--radius-xl)",
                boxShadow: "var(--shadow-md)",
              }}
            >
              {/* 티켓 펀칭 효과 */}
              <div
                className="absolute"
                style={{
                  left: -10, top: "50%", transform: "translateY(-50%)",
                  width: 20, height: 20, borderRadius: "50%",
                  background: "var(--bg)",
                }}
              />
              <div
                className="absolute"
                style={{
                  right: -10, top: "50%", transform: "translateY(-50%)",
                  width: 20, height: 20, borderRadius: "50%",
                  background: "var(--bg)",
                }}
              />
              <div
                className="font-semibold mb-1"
                style={{ fontSize: 13, opacity: 0.85 }}
              >
                보유 매칭권
              </div>
              <div className="flex items-baseline gap-1.5">
                <span
                  className="font-extrabold"
                  style={{
                    fontSize: 56,
                    lineHeight: 1,
                    letterSpacing: "-0.04em",
                  }}
                >
                  {tickets}
                </span>
                <span style={{ fontSize: 18, opacity: 0.85, fontWeight: 600 }}>장</span>
              </div>
              <div className="mt-2.5" style={{ fontSize: 12, opacity: 0.85 }}>
                미팅 참가 시 1장 사용 · 미사용 환급
              </div>
            </div>

            {/* 잔액 */}
            <div
              className="flex items-center justify-between px-4 py-3 mb-5"
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-md)",
                boxShadow: "var(--shadow-sm)",
              }}
            >
              <span className="text-sm" style={{ color: "var(--ink-mid)" }}>잔액</span>
              <div className="flex items-center gap-3">
                <span
                  className="font-bold"
                  style={{
                    fontSize: 15,
                    color: "var(--ink)",
                    letterSpacing: "-0.01em",
                  }}
                >
                  ₩{balance.toLocaleString()}
                </span>
                <button
                  onClick={() => router.push("/me/wallet")}
                  className="px-3 py-1.5 text-xs font-bold"
                  style={{
                    background: "var(--accent-soft)",
                    color: "var(--accent-ink)",
                    borderRadius: 999,
                  }}
                >
                  충전
                </button>
              </div>
            </div>

            {/* 구매 옵션 */}
            <h3
              className="mb-3 font-semibold"
              style={{
                fontSize: 13,
                color: "var(--ink-mid)",
                letterSpacing: "-0.01em",
              }}
            >
              매칭권 구매
            </h3>
            <div className="grid grid-cols-2 gap-2 mb-2">
              {PURCHASE_OPTIONS.map((o) => {
                const canAfford = balance >= o.price;
                return (
                  <button
                    key={o.count}
                    onClick={() => handlePurchase(o.count, o.price)}
                    disabled={!canAfford || buying}
                    className="text-left px-3 py-3.5 transition-all relative active:scale-[0.99] disabled:cursor-not-allowed"
                    style={{
                      background: "var(--surface)",
                      border: `1px solid ${o.save ? "var(--accent)" : "var(--border)"}`,
                      borderRadius: "var(--radius-md)",
                      opacity: canAfford ? 1 : 0.45,
                      boxShadow: "var(--shadow-sm)",
                    }}
                  >
                    {o.save && (
                      <span
                        className="absolute font-bold"
                        style={{
                          top: -8, right: 10,
                          background: "var(--accent)",
                          color: "var(--ink-on-accent)",
                          fontSize: 9,
                          padding: "3px 8px",
                          borderRadius: 999,
                          letterSpacing: "-0.01em",
                        }}
                      >
                        {o.save}
                      </span>
                    )}
                    <div
                      className="font-extrabold"
                      style={{ fontSize: 22, color: "var(--ink)", letterSpacing: "-0.03em" }}
                    >
                      {o.count}
                      <span style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-mid)", marginLeft: 2 }}>장</span>
                    </div>
                    <div
                      className="font-bold mt-0.5"
                      style={{
                        fontSize: 13,
                        color: "var(--accent)",
                        letterSpacing: "-0.01em",
                      }}
                    >
                      ₩{o.price.toLocaleString()}
                    </div>
                    {!canAfford && (
                      <p className="mt-1" style={{ fontSize: 10, color: "var(--danger)" }}>잔액 부족</p>
                    )}
                  </button>
                );
              })}
            </div>
            {balance < 2_000 && (
              <button
                onClick={() => router.push("/me/wallet")}
                className="mt-3 w-full py-2.5 text-sm font-medium"
                style={{
                  background: "var(--surface-muted)",
                  color: "var(--ink-mid)",
                  borderRadius: "var(--radius-md)",
                }}
              >
                잔액 충전하러 가기 →
              </button>
            )}

            {/* 이력 */}
            <h3
              className="mt-6 mb-3 font-semibold"
              style={{
                fontSize: 13,
                color: "var(--ink-mid)",
                letterSpacing: "-0.01em",
              }}
            >
              이력
            </h3>
            {txs.length === 0 ? (
              <p className="text-sm text-center py-6" style={{ color: "var(--ink-soft)" }}>
                이력이 없습니다
              </p>
            ) : (
              <div className="space-y-2">
                {txs.map((t) => {
                  const positive = t.amount > 0;
                  return (
                    <div
                      key={t.id}
                      className="flex items-center justify-between px-4 py-3"
                      style={{
                        background: "var(--surface)",
                        border: "1px solid var(--border)",
                        borderRadius: "var(--radius-md)",
                      }}
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-bold" style={{ color: "var(--ink)" }}>
                          {TX_TYPE_LABEL[t.tx_type] ?? t.tx_type}
                        </p>
                        {t.note && (
                          <p className="text-xs truncate" style={{ color: "var(--ink-soft)", marginTop: 1 }}>
                            {t.note}
                          </p>
                        )}
                      </div>
                      <div className="text-right shrink-0 ml-3">
                        <p
                          className="font-extrabold"
                          style={{
                            fontSize: 14,
                            color: positive ? "var(--accent)" : "var(--ink-mid)",
                            letterSpacing: "-0.01em",
                          }}
                        >
                          {positive ? "+" : ""}{t.amount}
                        </p>
                        <p className="text-xs" style={{ color: "var(--ink-soft)", marginTop: 1 }}>
                          잔여 {t.tickets_after}장
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
