"use client";

/**
 * /settings/wallet/charge/success — Toss 결제 성공 콜백 페이지
 *
 * Toss 위젯 결제 완료 후 successUrl로 리디렉트됨.
 * Query params: orderId, paymentKey, amount (Toss 표준)
 *
 * 역할:
 *  1. URL params 파싱
 *  2. POST /wallet/charge/confirm 호출
 *  3. 성공 → 잔액 갱신 + 완료 UI 표시
 */

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { confirmCharge } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

export default function ChargeSuccessPage() {
  const params = useSearchParams();
  const router = useRouter();
  const { refreshUser } = useAuth();

  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [balance, setBalance] = useState<number>(0);
  const [amount, setAmount] = useState<number>(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    const orderId     = params.get("orderId");
    const paymentKey  = params.get("paymentKey") ?? undefined;

    if (!orderId) {
      setErrorMsg("잘못된 접근입니다.");
      setStatus("error");
      return;
    }

    confirmCharge({ order_id: orderId, payment_key: paymentKey })
      .then(async (res) => {
        setBalance(res.balance);
        // amount는 already_charged일 수도 있으므로 res.amount 없으면 0
        setAmount(res.amount ?? 0);
        await refreshUser();
        setStatus("success");
      })
      .catch((e) => {
        setErrorMsg(e instanceof Error ? e.message : "충전 확인 실패");
        setStatus("error");
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="mb-4 animate-spin text-5xl">💫</div>
          <p className="text-sm text-gray-500">결제 확인 중...</p>
        </div>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-sm rounded-3xl bg-white p-8 text-center shadow-xl">
          <div className="mb-4 text-5xl">❌</div>
          <h2 className="mb-2 text-xl font-black text-gray-900">충전 실패</h2>
          <p className="mb-6 text-sm text-gray-500">{errorMsg}</p>
          <button
            onClick={() => router.push("/settings/wallet/charge")}
            className="w-full rounded-xl bg-blue-600 py-3 text-sm font-bold text-white hover:bg-blue-700"
          >
            다시 시도
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm rounded-3xl bg-white p-8 text-center shadow-xl">
        <div className="mb-4 text-5xl">🎉</div>
        <h2 className="mb-2 text-xl font-black text-gray-900">충전 완료!</h2>
        {amount > 0 && (
          <p className="mb-1 text-sm text-gray-500">
            <span className="font-bold text-blue-600">
              {amount.toLocaleString()}원
            </span>
            이 충전되었습니다.
          </p>
        )}
        <p className="mb-6 text-sm text-gray-500">
          현재 잔액:{" "}
          <span className="font-bold text-gray-800">
            {balance.toLocaleString()}원
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
