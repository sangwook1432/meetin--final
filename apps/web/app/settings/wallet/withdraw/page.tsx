"use client";

/**
 * /settings/wallet/withdraw — 잔액 반환 신청 페이지
 *
 * 플로우:
 *  1. 반환 금액 + 계좌 정보 입력
 *  2. POST /wallet/withdraw 호출
 *  3. 성공 시 잔액 갱신 + 완료 UI
 *
 * 정책:
 *  - 최소 신청 금액: 1,000원
 *  - 잔액 이상 신청 불가
 *  - 실제 이체는 영업일 1~3일 소요 (운영자 수동 or 배치)
 */

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { requestWithdraw } from "@/lib/api";

const BANKS = [
  "신한은행", "국민은행", "하나은행", "우리은행", "기업은행",
  "농협은행", "카카오뱅크", "토스뱅크", "케이뱅크", "SC제일은행",
  "씨티은행", "대구은행", "부산은행", "경남은행", "광주은행",
  "전북은행", "제주은행", "우체국",
];

export default function WithdrawPage() {
  const { user, refreshUser } = useAuth();
  const router = useRouter();

  const [amount, setAmount] = useState<string>("");
  const [bankName, setBankName] = useState<string>("");
  const [accountNumber, setAccountNumber] = useState<string>("");
  const [accountHolder, setAccountHolder] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ amount: number; balance: number } | null>(null);

  const balance = user?.balance ?? 0;
  const parsedAmount = parseInt(amount.replace(/,/g, ""), 10) || 0;

  const handleWithdraw = useCallback(async () => {
    setError(null);

    if (parsedAmount < 1_000) {
      setError("최소 반환 금액은 1,000원입니다.");
      return;
    }
    if (parsedAmount > balance) {
      setError(`잔액이 부족합니다. (현재 잔액: ${balance.toLocaleString()}원)`);
      return;
    }
    if (!bankName) {
      setError("은행을 선택해주세요.");
      return;
    }
    if (!accountNumber.trim()) {
      setError("계좌번호를 입력해주세요.");
      return;
    }
    if (!accountHolder.trim()) {
      setError("예금주명을 입력해주세요.");
      return;
    }

    setLoading(true);
    try {
      const res = await requestWithdraw({
        amount: parsedAmount,
        bank_name: bankName,
        account_number: accountNumber.trim(),
        account_holder: accountHolder.trim(),
      });
      await refreshUser();
      setSuccess({ amount: parsedAmount, balance: res.balance });
    } catch (e) {
      setError(e instanceof Error ? e.message : "반환 신청 실패");
    } finally {
      setLoading(false);
    }
  }, [parsedAmount, balance, bankName, accountNumber, accountHolder, refreshUser]);

  // ─── 성공 화면 ────────────────────────────────────────────
  if (success) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-sm rounded-3xl bg-white p-8 text-center shadow-xl">
          <div className="mb-4 text-5xl">✅</div>
          <h2 className="mb-2 text-xl font-black text-gray-900">반환 신청 완료</h2>
          <p className="mb-1 text-sm text-gray-500">
            <span className="font-bold text-blue-600">
              {success.amount.toLocaleString()}원
            </span>
            반환 신청이 완료되었습니다.
          </p>
          <p className="mb-1 text-sm text-gray-500">
            현재 잔액:{" "}
            <span className="font-bold text-gray-800">
              {success.balance.toLocaleString()}원
            </span>
          </p>
          <p className="mb-6 text-xs text-gray-400">
            영업일 기준 1~3일 내 입금됩니다.
          </p>
          <button
            onClick={() => router.push("/settings")}
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
        <Link href="/settings" className="text-gray-400 hover:text-gray-600 text-lg">
          ‹
        </Link>
        <h1 className="text-base font-bold text-gray-900">잔액 반환</h1>
      </header>

      <div className="mx-auto w-full max-w-md px-4 py-6">
        {/* 현재 잔액 */}
        <div className="mb-6 rounded-2xl bg-gradient-to-br from-gray-700 to-gray-800 p-5 text-white shadow-lg">
          <p className="text-xs text-gray-400">출금 가능 잔액</p>
          <p className="mt-1 text-3xl font-black">{balance.toLocaleString()}원</p>
        </div>

        <div className="flex flex-col gap-4">
          {/* 반환 금액 */}
          <div>
            <p className="mb-2 text-sm font-semibold text-gray-700">반환 금액</p>
            <div className="flex items-center rounded-2xl border-2 border-gray-200 bg-white px-4 py-3 focus-within:border-blue-400">
              <input
                type="number"
                placeholder="반환할 금액 입력"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="flex-1 text-sm outline-none"
                min={1000}
                max={balance}
              />
              <span className="text-sm text-gray-400">원</span>
            </div>
            <div className="mt-1.5 flex gap-2">
              {[10_000, 30_000, 50_000].map((a) => (
                <button
                  key={a}
                  type="button"
                  onClick={() => setAmount(String(a))}
                  disabled={balance < a}
                  className="rounded-full border border-gray-200 px-3 py-1 text-xs text-gray-500 hover:border-blue-300 hover:text-blue-600 disabled:opacity-30"
                >
                  {(a / 10_000).toLocaleString()}만원
                </button>
              ))}
              <button
                type="button"
                onClick={() => setAmount(String(balance))}
                className="rounded-full border border-gray-200 px-3 py-1 text-xs text-gray-500 hover:border-blue-300 hover:text-blue-600"
              >
                전액
              </button>
            </div>
          </div>

          {/* 은행 선택 */}
          <div>
            <p className="mb-2 text-sm font-semibold text-gray-700">은행</p>
            <select
              value={bankName}
              onChange={(e) => setBankName(e.target.value)}
              className="w-full rounded-2xl border-2 border-gray-200 bg-white px-4 py-3 text-sm text-gray-700 focus:border-blue-400 outline-none"
            >
              <option value="">은행 선택</option>
              {BANKS.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </div>

          {/* 계좌번호 */}
          <div>
            <p className="mb-2 text-sm font-semibold text-gray-700">계좌번호</p>
            <input
              type="text"
              placeholder="계좌번호 (숫자만, 하이픈 제외)"
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value.replace(/[^0-9]/g, ""))}
              className="w-full rounded-2xl border-2 border-gray-200 bg-white px-4 py-3 text-sm focus:border-blue-400 outline-none"
            />
          </div>

          {/* 예금주명 */}
          <div>
            <p className="mb-2 text-sm font-semibold text-gray-700">예금주명</p>
            <input
              type="text"
              placeholder="예금주 이름"
              value={accountHolder}
              onChange={(e) => setAccountHolder(e.target.value)}
              className="w-full rounded-2xl border-2 border-gray-200 bg-white px-4 py-3 text-sm focus:border-blue-400 outline-none"
            />
          </div>

          {/* 안내 */}
          <div className="rounded-2xl border border-yellow-100 bg-yellow-50 px-4 py-3">
            <p className="text-xs font-semibold text-yellow-700">⚠️ 반환 안내</p>
            <ul className="mt-1.5 space-y-0.5 text-xs text-yellow-600">
              <li>• 영업일 기준 1~3일 내 입금됩니다.</li>
              <li>• 신청 후 취소는 고객센터를 통해 진행해주세요.</li>
              <li>• 계좌 정보 오류로 인한 미입금은 책임지지 않습니다.</li>
            </ul>
          </div>

          {/* 에러 */}
          {error && (
            <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
              {error}
            </div>
          )}

          {/* 신청 버튼 */}
          <button
            onClick={handleWithdraw}
            disabled={loading || parsedAmount < 1_000 || parsedAmount > balance}
            className="w-full rounded-xl bg-gray-800 py-4 text-sm font-bold text-white hover:bg-gray-900 disabled:opacity-50 active:scale-95 transition-all"
          >
            {loading
              ? "처리 중..."
              : parsedAmount >= 1_000
              ? `${parsedAmount.toLocaleString()}원 반환 신청`
              : "반환 신청하기"}
          </button>
        </div>
      </div>
    </div>
  );
}
