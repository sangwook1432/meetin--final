"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Script from "next/script";
import ErrorBanner from "@/components/ui/ErrorBanner";
import {
  getWallet, getWalletTransactions, prepareCharge, confirmCharge,
  requestWithdraw, getWithdrawPreview,
} from "@/lib/api";
import { AppShell } from "@/components/ui/AppShell";
import { T, Icon, MoreNavBar, type IconName } from "@/components/me/MoreAtoms";

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

const TX_META: Record<TxType, { label: string; icon: IconName }> = {
  CHARGE:          { label: "잔액 충전",  icon: "arrowDown" },
  TICKET_PURCHASE: { label: "매칭권 구매", icon: "spark" },
  FORFEIT:         { label: "매칭권 몰수", icon: "flag" },
  WITHDRAW:        { label: "출금 신청",  icon: "arrowUp" },
  WITHDRAW_DONE:   { label: "출금 완료",  icon: "check" },
  ADMIN_ADJUST:    { label: "관리자 조정", icon: "shield" },
};

const CHARGE_OPTIONS = [10000, 20000, 30000, 50000];
const WITHDRAW_OPTIONS = [10000, 30000, 50000, 100000];

function formatDate(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("ko-KR", {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

export default function WalletPage() {
  const router = useRouter();

  const [balance, setBalance] = useState<number | null>(null);
  const [matchingTickets, setMatchingTickets] = useState(0);
  const [, setCanAfford] = useState(false);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [charging, setCharging] = useState(false);
  const [chargeAmount, setChargeAmount] = useState(10000);
  const [showChargeModal, setShowChargeModal] = useState(false);

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

  // 포트원 결제 리다이렉트 처리
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
        const IMP = (window as unknown as { IMP: { init: (k: string) => void; request_pay: (o: unknown, cb: (rsp: { success: boolean; error_msg?: string; imp_uid: string; merchant_uid: string }) => void) => void } }).IMP;
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
          async (rsp) => {
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

      // Mock 모드
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
        <div style={{ background: T.bg, minHeight: "100%", fontFamily: T.fontSans }}>
          <MoreNavBar title="지갑" fallbackHref="/me" />
          <div style={{ display: "flex", justifyContent: "center", padding: "60px 0" }}>
            <div className="h-8 w-8 animate-spin rounded-full" style={{
              border: `4px solid ${T.surfaceMuted}`, borderTopColor: T.accent,
            }} />
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      {IMP_CODE && (
        <Script src="https://cdn.iamport.kr/v1/iamport.js" strategy="afterInteractive" />
      )}
      <div style={{ background: T.bg, minHeight: "100%", fontFamily: T.fontSans, paddingBottom: 40 }}>
        <MoreNavBar title="지갑" fallbackHref="/me" />

        {/* 잔액 카드 */}
        <div style={{ padding: "16px 16px 0" }}>
          <div style={{
            background: T.ink, color: "#FFF",
            borderRadius: T.radiusXl, padding: "20px 20px 18px",
            position: "relative", overflow: "hidden",
          }}>
            <div style={{
              display: "flex", justifyContent: "space-between", alignItems: "flex-start",
            }}>
              <div>
                <div style={{
                  fontSize: 11, fontWeight: 700, letterSpacing: "0.10em",
                  color: "rgba(255,255,255,0.55)",
                }}>
                  현재 잔액
                </div>
                <div style={{
                  marginTop: 6, display: "flex", alignItems: "baseline", gap: 4,
                }}>
                  <span style={{
                    fontSize: 32, fontWeight: 800, letterSpacing: "-0.03em",
                  }}>{balance?.toLocaleString() ?? "—"}</span>
                  <span style={{
                    fontSize: 14, color: "rgba(255,255,255,0.6)", fontWeight: 600,
                  }}>원</span>
                </div>
              </div>
              <div style={{
                fontSize: 11, color: "rgba(255,255,255,0.5)",
                fontFamily: T.fontMono, letterSpacing: "0.10em",
              }}>
                MEETIN.WALLET
              </div>
            </div>

            <div style={{
              marginTop: 16, padding: "10px 12px",
              background: "rgba(255,255,255,0.10)", borderRadius: T.radiusMd,
              display: "flex", alignItems: "center", justifyContent: "space-between",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{
                  width: 26, height: 26, borderRadius: 999,
                  background: T.accent,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <Icon name="spark" size={14} stroke="#FFF" />
                </div>
                <div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.6)" }}>매칭권</div>
                  <div style={{ fontSize: 14, fontWeight: 800, marginTop: -1 }}>
                    {matchingTickets}장 보유 중
                  </div>
                </div>
              </div>
            </div>

            <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
              <button
                onClick={() => setShowChargeModal(true)}
                style={{
                  flex: 1, padding: 11, borderRadius: T.radiusMd,
                  background: "#FFF", color: T.ink, border: 0,
                  fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 5,
                }}
              >
                <Icon name="plus" size={14} stroke={T.ink} />
                충전
              </button>
              <button
                onClick={() => {
                  setShowWithdrawModal(true);
                  fetchWithdrawPreview(withdrawAmount);
                }}
                style={{
                  flex: 1, padding: 11, borderRadius: T.radiusMd,
                  background: "rgba(255,255,255,0.10)", color: "#FFF",
                  border: "1px solid rgba(255,255,255,0.20)",
                  fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 5,
                }}
              >
                <Icon name="arrowUp" size={14} stroke="#FFF" />
                출금
              </button>
            </div>
          </div>
        </div>

        {error && <div style={{ padding: "14px 16px 0" }}><ErrorBanner message={error} /></div>}

        {/* 매칭권 구매 */}
        <div style={{ padding: "20px 16px 0" }}>
          <button
            onClick={() => router.push("/me/tickets")}
            style={{
              width: "100%", padding: "14px 16px", borderRadius: T.radiusLg,
              background: T.surface, border: `1px solid ${T.border}`,
              cursor: "pointer", fontFamily: "inherit",
              display: "flex", alignItems: "center", gap: 12,
            }}
          >
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: T.accentSoft, color: T.accentInk,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <Icon name="spark" size={18} stroke={T.accentInk} />
            </div>
            <div style={{ flex: 1, textAlign: "left" }}>
              <div style={{
                fontSize: 13, fontWeight: 700, color: T.ink, letterSpacing: "-0.01em",
              }}>
                매칭권 구매
              </div>
              <div style={{ fontSize: 11, color: T.inkSoft, marginTop: 2 }}>
                잔액으로 매칭권을 구매할 수 있어요
              </div>
            </div>
            <Icon name="chevron" size={16} stroke={T.inkSoft} />
          </button>
        </div>

        {/* 거래 내역 */}
        <div style={{ padding: "20px 16px 0" }}>
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8,
          }}>
            <div style={{
              fontSize: 13, fontWeight: 800, color: T.ink, letterSpacing: "-0.01em",
            }}>
              거래 내역
            </div>
            {transactions.length > 0 && (
              <span style={{
                fontSize: 11, color: T.inkSoft, fontFamily: T.fontMono,
              }}>
                최근 {transactions.length}건
              </span>
            )}
          </div>

          {transactions.length === 0 ? (
            <div style={{
              background: T.surface, border: `1px solid ${T.border}`,
              borderRadius: T.radiusLg, padding: "32px 20px", textAlign: "center",
            }}>
              <div style={{ fontSize: 13, color: T.inkSoft }}>거래 내역이 없어요</div>
            </div>
          ) : (
            <div style={{
              background: T.surface, border: `1px solid ${T.border}`,
              borderRadius: T.radiusLg, overflow: "hidden",
            }}>
              {transactions.map((tx, idx) => {
                const meta = TX_META[tx.tx_type] ?? { label: tx.tx_type, icon: "info" as IconName };
                const positive = tx.amount > 0;
                return (
                  <div key={tx.id} style={{
                    display: "flex", alignItems: "center", gap: 11, padding: "12px 14px",
                    borderTop: idx === 0 ? "none" : `1px solid ${T.border}`,
                  }}>
                    <div style={{
                      width: 34, height: 34, borderRadius: 10,
                      background: T.surfaceMuted, color: T.ink, flexShrink: 0,
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      <Icon name={meta.icon} size={15} stroke={T.ink} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: 13, fontWeight: 700, color: T.ink, letterSpacing: "-0.01em",
                      }}>
                        {meta.label}
                      </div>
                      <div style={{
                        fontSize: 11, color: T.inkSoft, marginTop: 1,
                        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                      }}>
                        {tx.note ?? "—"} · {formatDate(tx.created_at)}
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{
                        fontSize: 13, fontWeight: 800,
                        color: positive ? T.success : T.ink, letterSpacing: "-0.01em",
                      }}>
                        {positive ? "+" : ""}{tx.amount.toLocaleString()}
                      </div>
                      <div style={{
                        fontSize: 10, color: T.inkSoft, marginTop: 1, fontFamily: T.fontMono,
                      }}>
                        {tx.balance_after.toLocaleString()}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div style={{
            marginTop: 14, padding: "12px 14px",
            background: T.surfaceMuted, border: `1px solid ${T.border}`,
            borderRadius: T.radiusMd,
            fontSize: 11, color: T.inkSoft, lineHeight: 1.6,
          }}>
            <div style={{
              fontWeight: 700, color: T.inkMid, marginBottom: 4, fontSize: 12,
            }}>
              이용 안내
            </div>
            잔액 충전은 1,000원 단위 · 최대 50만 원까지 가능해요. 미사용 잔액은 환불 정책에 따라 출금 신청이 가능합니다.
          </div>
        </div>
      </div>

      {/* 충전 모달 */}
      {showChargeModal && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 50,
          display: "flex", alignItems: "flex-end", justifyContent: "center",
          background: "rgba(0,0,0,0.4)",
        }}>
          <div className="animate-slide-up" style={{
            width: "100%", maxWidth: 448,
            background: T.surface,
            borderTopLeftRadius: T.radiusXl, borderTopRightRadius: T.radiusXl,
            padding: 22, paddingBottom: "calc(22px + env(safe-area-inset-bottom, 0px))",
          }}>
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18,
            }}>
              <div style={{
                fontSize: 16, fontWeight: 800, color: T.ink, letterSpacing: "-0.02em",
              }}>
                잔액 충전
              </div>
              <button
                onClick={() => setShowChargeModal(false)}
                aria-label="닫기"
                style={{
                  width: 36, height: 36, borderRadius: 999,
                  background: "transparent", border: 0, cursor: "pointer",
                  color: T.inkSoft, padding: 0,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >
                <Icon name="x" size={18} />
              </button>
            </div>

            <div style={{
              display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14,
            }}>
              {CHARGE_OPTIONS.map((opt) => {
                const active = chargeAmount === opt;
                return (
                  <button
                    key={opt}
                    onClick={() => setChargeAmount(opt)}
                    style={{
                      padding: "12px 0", borderRadius: T.radiusMd,
                      background: active ? T.accentSoft : T.bg,
                      border: `1.5px solid ${active ? T.accent : T.border}`,
                      color: active ? T.accentInk : T.ink,
                      fontSize: 13, fontWeight: 700, cursor: "pointer",
                      fontFamily: "inherit", letterSpacing: "-0.01em",
                    }}
                  >
                    {opt.toLocaleString()}원
                  </button>
                );
              })}
            </div>

            <div style={{ marginBottom: 18 }}>
              <div style={{
                fontSize: 11, fontWeight: 600, color: T.inkSoft, marginBottom: 6,
              }}>
                직접 입력
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  type="number"
                  value={chargeAmount}
                  onChange={(e) => setChargeAmount(Number(e.target.value))}
                  onFocus={(e) => e.target.select()}
                  min={1000} max={500000} step={1000}
                  style={{
                    flex: 1, padding: "12px 14px", borderRadius: T.radiusMd,
                    border: `1px solid ${T.border}`, background: T.bg,
                    fontSize: 14, color: T.ink, outline: "none", fontFamily: "inherit",
                  }}
                />
                <span style={{ fontSize: 13, color: T.inkSoft }}>원</span>
              </div>
              <div style={{ marginTop: 6, fontSize: 11, color: T.inkSoft }}>
                최소 1,000원 · 최대 500,000원
              </div>
            </div>

            {error && (
              <div style={{
                marginBottom: 12, fontSize: 12, color: "oklch(0.55 0.20 22)",
              }}>
                {error}
              </div>
            )}

            <button
              onClick={handleCharge}
              disabled={charging}
              style={{
                width: "100%", padding: "14px 18px", borderRadius: T.radiusMd,
                background: charging ? T.surfaceMuted : T.accent,
                color: charging ? T.inkSoft : T.inkOnAccent,
                border: 0, fontSize: 14, fontWeight: 700, letterSpacing: "-0.01em",
                cursor: charging ? "default" : "pointer", fontFamily: "inherit",
              }}
            >
              {charging ? "처리 중..." : `${chargeAmount.toLocaleString()}원 충전하기`}
            </button>

            <div style={{
              marginTop: 12, textAlign: "center", fontSize: 11, color: T.inkSoft,
            }}>
              {IMP_CODE ? "KG이니시스 결제창으로 이동합니다" : "개발 환경 — 실제 결제 없이 바로 충전됩니다"}
            </div>
          </div>
        </div>
      )}

      {/* 출금 모달 */}
      {showWithdrawModal && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 50,
          display: "flex", alignItems: "flex-end", justifyContent: "center",
          background: "rgba(0,0,0,0.4)",
        }}>
          <div className="animate-slide-up" style={{
            width: "100%", maxWidth: 448,
            background: T.surface,
            borderTopLeftRadius: T.radiusXl, borderTopRightRadius: T.radiusXl,
            padding: 22, paddingBottom: "calc(22px + env(safe-area-inset-bottom, 0px))",
          }}>
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18,
            }}>
              <div style={{
                fontSize: 16, fontWeight: 800, color: T.ink, letterSpacing: "-0.02em",
              }}>
                잔액 출금
              </div>
              <button
                onClick={() => setShowWithdrawModal(false)}
                aria-label="닫기"
                style={{
                  width: 36, height: 36, borderRadius: 999,
                  background: "transparent", border: 0, cursor: "pointer",
                  color: T.inkSoft, padding: 0,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >
                <Icon name="x" size={18} />
              </button>
            </div>

            <div style={{
              display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14,
            }}>
              {WITHDRAW_OPTIONS.map((opt) => {
                const active = withdrawAmount === opt;
                return (
                  <button
                    key={opt}
                    onClick={() => { setWithdrawAmount(opt); fetchWithdrawPreview(opt); }}
                    style={{
                      padding: "12px 0", borderRadius: T.radiusMd,
                      background: active ? T.accentSoft : T.bg,
                      border: `1.5px solid ${active ? T.accent : T.border}`,
                      color: active ? T.accentInk : T.ink,
                      fontSize: 13, fontWeight: 700, cursor: "pointer",
                      fontFamily: "inherit", letterSpacing: "-0.01em",
                    }}
                  >
                    {opt.toLocaleString()}원
                  </button>
                );
              })}
            </div>

            <div style={{ marginBottom: 14 }}>
              <div style={{
                fontSize: 11, fontWeight: 600, color: T.inkSoft, marginBottom: 6,
              }}>
                직접 입력
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  type="number"
                  value={withdrawAmount}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setWithdrawAmount(v);
                    fetchWithdrawPreview(v);
                  }}
                  onFocus={(e) => e.target.select()}
                  min={1000} max={1000000} step={1000}
                  style={{
                    flex: 1, padding: "12px 14px", borderRadius: T.radiusMd,
                    border: `1px solid ${T.border}`, background: T.bg,
                    fontSize: 14, color: T.ink, outline: "none", fontFamily: "inherit",
                  }}
                />
                <span style={{ fontSize: 13, color: T.inkSoft }}>원</span>
              </div>
              <div style={{ marginTop: 6, fontSize: 11, color: T.inkSoft }}>
                현재 잔액 {balance?.toLocaleString()}원
              </div>
            </div>

            {/* 수수료 미리보기 */}
            {previewLoading ? (
              <div style={{
                marginBottom: 14, height: 90, borderRadius: T.radiusMd,
                background: T.surfaceMuted,
                animation: "meetin-pulse 1.4s ease-in-out infinite",
              }} />
            ) : withdrawPreview ? (
              <div style={{
                marginBottom: 14, padding: "12px 14px", borderRadius: T.radiusMd,
                background: withdrawPreview.refund_type === "청약철회" ? T.successSoft : T.warningSoft,
                border: `1px solid ${withdrawPreview.refund_type === "청약철회" ? T.success : T.warning}40`,
              }}>
                <div style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8,
                }}>
                  <span style={{
                    fontSize: 11, fontWeight: 700, color: T.inkMid, letterSpacing: "0.05em",
                  }}>
                    환불 유형
                  </span>
                  <span style={{
                    fontSize: 11, fontWeight: 800, padding: "3px 9px", borderRadius: 999,
                    background: withdrawPreview.refund_type === "청약철회" ? T.success : T.warning,
                    color: "#FFF",
                  }}>
                    {withdrawPreview.refund_type}
                  </span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12.5 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", color: T.inkMid }}>
                    <span>출금 신청액</span>
                    <span>{withdrawAmount.toLocaleString()}원</span>
                  </div>
                  <div style={{
                    display: "flex", justifyContent: "space-between",
                    fontSize: 11, color: T.inkSoft,
                  }}>
                    <span>수수료 ({withdrawPreview.refund_type === "청약철회" ? "없음" : "10%"})</span>
                    <span>- {withdrawPreview.fee.toLocaleString()}원</span>
                  </div>
                  <div style={{
                    display: "flex", justifyContent: "space-between",
                    fontWeight: 800, color: T.ink,
                    borderTop: `1px solid ${T.border}`, paddingTop: 6, marginTop: 4,
                  }}>
                    <span>실제 환불액</span>
                    <span style={{ color: T.accentInk }}>
                      {withdrawPreview.net_amount.toLocaleString()}원
                    </span>
                  </div>
                </div>
                {!withdrawPreview.eligible && (
                  <div style={{
                    marginTop: 8, fontSize: 11, color: "oklch(0.55 0.20 22)",
                  }}>
                    수수료 차감 후 환불액이 최소 기준 미만입니다.
                  </div>
                )}
              </div>
            ) : null}

            {error && (
              <div style={{
                marginBottom: 12, fontSize: 12, color: "oklch(0.55 0.20 22)",
              }}>
                {error}
              </div>
            )}

            <button
              onClick={handleWithdraw}
              disabled={withdrawing || !withdrawPreview?.eligible}
              style={{
                width: "100%", padding: "14px 18px", borderRadius: T.radiusMd,
                background: withdrawing || !withdrawPreview?.eligible ? T.surfaceMuted : T.accent,
                color: withdrawing || !withdrawPreview?.eligible ? T.inkSoft : T.inkOnAccent,
                border: 0, fontSize: 14, fontWeight: 700, letterSpacing: "-0.01em",
                cursor: withdrawing || !withdrawPreview?.eligible ? "default" : "pointer",
                fontFamily: "inherit",
              }}
            >
              {withdrawing ? "처리 중..." : `${withdrawAmount.toLocaleString()}원 출금 신청`}
            </button>

            <div style={{
              marginTop: 12, textAlign: "center", fontSize: 11, color: T.inkSoft,
            }}>
              신청 후 관리자 확인을 거쳐 원결제 수단으로 환불됩니다
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
