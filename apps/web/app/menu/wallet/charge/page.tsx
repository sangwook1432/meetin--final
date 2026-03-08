"use client";

/**
 * /settings/wallet/charge — 잔액 충전 페이지
 *
 * 플로우:
 *  1. 금액 선택 (10,000 / 20,000 / 30,000 / 50,000 / 직접 입력)
 *  2. "충전하기" 버튼 → POST /wallet/charge/prepare → orderId 획득
 *  3. Toss 위젯 팝업 (or 리디렉트)
 *  4. 결제 성공 → POST /wallet/charge/confirm → 잔액 반영
 *
 * 개발/Mock 환경:
 *  NEXT_PUBLIC_TOSS_CLIENT_KEY 가 없으면 Toss 위젯을 건너뛰고
 *  바로 confirm API를 호출하여 잔액이 충전된다.
 */

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { prepareCharge, confirmCharge } from "@/lib/api";

const PRESET_AMOUNTS = [10_000, 20_000, 30_000, 50_000, 100_000];

export default function ChargePage() {
  const { user, refreshUser } = useAuth();
  const router = useRouter();

  const [selectedAmount, setSelectedAmount] = useState<number>(10_000);
  const [customAmount, setCustomAmount] = useState<string>("");
  const [useCustom, setUseCustom] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ amount: number; balance: number } | null>(null);

  const finalAmount = useCustom
    ? Math.round(parseInt(customAmount || "0", 10) / 1000) * 1000
    : selectedAmount;

  const handleCharge = useCallback(async () => {
    setError(null);
    if (finalAmount < 10_000) {
      setError("최소 충전 금액은 10,000원입니다.");
      return;
    }
    if (finalAmount > 100_000) {
      setError("최대 충전 금액은 100,000원입니다.");
      return;
    }
    if (finalAmount % 1_000 !== 0) {
      setError("충전 금액은 1,000원 단위여야 합니다.");
      return;
    }

    setLoading(true);
    try {
      // 1. 주문 생성
      const { orderId } = await prepareCharge(finalAmount);

      // 2. Toss 위젯 (클라이언트 키가 있는 경우)
      const tossKey = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY;

      if (tossKey) {
        // ── 실결제: Toss 위젯 동적 로드 ───────────────────────
        // @ts-expect-error Toss SDK global
        const tossPayments = window.TossPayments?.(tossKey);
        if (!tossPayments) {
          // SDK 미로드 시 fallback: mock 처리
          throw new Error("Toss SDK를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.");
        }
        await tossPayments.requestPayment("카드", {
          amount: finalAmount,
          orderId,
          orderName: `MEETIN 잔액 충전 ${finalAmount.toLocaleString()}원`,
          successUrl: `${window.location.origin}/menu/wallet/charge/success?orderId=${orderId}`,
          failUrl:    `${window.location.origin}/settings/wallet/charge?error=fail`,
        });
        // successUrl로 이동됨 — 이 아래는 실행되지 않음
        return;
      }

      // ── Mock(개발): 바로 confirm 호출 ────────────────────────
      const result = await confirmCharge({ order_id: orderId, payment_key: "mock_key" });
      await refreshUser(); // AuthContext 잔액 갱신
      setSuccess({ amount: finalAmount, balance: result.balance });

    } catch (e) {
      setError(e instanceof Error ? e.message : "충전 실패");
    } finally {
      setLoading(false);
    }
  }, [finalAmount, refreshUser]);

  // ─── 성공 화면 ────────────────────────────────────────────
  if (success) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-sm rounded-3xl bg-white p-8 text-center shadow-xl">
          <div className="mb-4 text-5xl">🎉</div>
          <h2 className="mb-2 text-xl font-black text-gray-900">충전 완료!</h2>
          <p className="mb-1 text-sm text-gray-500">
            <span className="font-bold text-blue-600">
              {success.amount.toLocaleString()}원
            </span>
            이 충전되었습니다.
          </p>
          <p className="mb-6 text-sm text-gray-500">
            현재 잔액:{" "}
            <span className="font-bold text-gray-800">
              {success.balance.toLocaleString()}원
            </span>
          </p>
          <button
            onClick={() => router.push("/menu")}
            className="w-full rounded-xl bg-blue-600 py-3 text-sm font-bold text-white hover:bg-blue-700"
          >
            설정으로 돌아가기
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      {/* 헤더 */}
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-gray-100 bg-white px-5 py-4 shadow-sm">
        <Link href="/menu" className="text-gray-400 hover:text-gray-600 text-lg">
          ‹
        </Link>
        <h1 className="text-base font-bold text-gray-900">잔액 충전</h1>
      </header>

      <div className="mx-auto w-full max-w-md px-4 py-6">
        {/* 현재 잔액 */}
        <div className="mb-6 rounded-2xl bg-gradient-to-br from-blue-600 to-blue-700 p-5 text-white shadow-lg shadow-blue-200">
          <p className="text-xs text-blue-200">현재 잔액</p>
          <p className="mt-1 text-3xl font-black">
            {(user?.balance ?? 0).toLocaleString()}원
          </p>
        </div>

        {/* 금액 선택 */}
        <div className="mb-5">
          <p className="mb-3 text-sm font-semibold text-gray-700">충전 금액 선택</p>
          <div className="grid grid-cols-3 gap-2">
            {PRESET_AMOUNTS.map((amt) => (
              <button
                key={amt}
                type="button"
                onClick={() => { setSelectedAmount(amt); setUseCustom(false); }}
                className={`rounded-2xl border-2 py-3 text-sm font-bold transition-all ${
                  !useCustom && selectedAmount === amt
                    ? "border-blue-500 bg-blue-50 text-blue-700"
                    : "border-gray-100 bg-white text-gray-700 hover:border-blue-200"
                }`}
              >
                {(amt / 10_000).toLocaleString()}만원
              </button>
            ))}
            <button
              type="button"
              onClick={() => setUseCustom(true)}
              className={`rounded-2xl border-2 py-3 text-sm font-bold transition-all ${
                useCustom
                  ? "border-blue-500 bg-blue-50 text-blue-700"
                  : "border-gray-100 bg-white text-gray-700 hover:border-blue-200"
              }`}
            >
              직접 입력
            </button>
          </div>

          {/* 직접 입력 */}
          {useCustom && (
            <div className="mt-3">
              <div className="flex items-center rounded-2xl border-2 border-blue-400 bg-white px-4 py-3">
                <input
                  type="number"
                  placeholder="금액 입력 (1,000원 단위)"
                  value={customAmount}
                  onChange={(e) => setCustomAmount(e.target.value)}
                  className="flex-1 text-sm outline-none"
                  min={10000}
                  max={100000}
                  step={1000}
                />
                <span className="text-sm text-gray-400">원</span>
              </div>
              <p className="mt-1.5 text-xs text-gray-400">
                최소 10,000원 · 최대 100,000원 · 1,000원 단위
              </p>
            </div>
          )}
        </div>

        {/* 선택된 금액 확인 */}
        {finalAmount >= 10_000 && (
          <div className="mb-5 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-center">
            <p className="text-xs text-blue-500">충전 예정 금액</p>
            <p className="mt-0.5 text-2xl font-black text-blue-700">
              {finalAmount.toLocaleString()}원
            </p>
          </div>
        )}

        {/* 에러 */}
        {error && (
          <div className="mb-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
            {error}
          </div>
        )}

        {/* 충전 버튼 */}
        <button
          onClick={handleCharge}
          disabled={loading || finalAmount < 10_000}
          className="w-full rounded-xl bg-blue-600 py-4 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50 active:scale-95 transition-all shadow-md shadow-blue-200"
        >
          {loading
            ? "처리 중..."
            : `${finalAmount >= 10_000 ? finalAmount.toLocaleString() + "원 " : ""}충전하기`}
        </button>

        <p className="mt-4 text-center text-xs text-gray-400">
          토스 결제로 안전하게 처리됩니다
        </p>
      </div>
    </div>
  );
}
