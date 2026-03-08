"use client";

/**
 * /settings — 설정 메뉴 (내 프로필 / 잔액 충전 / 잔액 반환 / 로그아웃)
 */

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { AppShell } from "@/components/ui/AppShell";
import { useEffect } from "react";

interface MenuItemProps {
  icon: string;
  label: string;
  description?: string;
  href?: string;
  onClick?: () => void;
  variant?: "default" | "danger";
  badge?: string;
}

function MenuItem({ icon, label, description, href, onClick, variant = "default", badge }: MenuItemProps) {
  const base =
    "flex w-full items-center gap-4 rounded-2xl bg-white px-4 py-4 text-left shadow-sm hover:shadow-md active:scale-[0.98] transition-all border border-gray-100";
  const textColor = variant === "danger" ? "text-red-600" : "text-gray-800";

  const inner = (
    <>
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gray-50 text-xl">
        {icon}
      </span>
      <div className="flex-1">
        <p className={`text-sm font-semibold ${textColor}`}>{label}</p>
        {description && (
          <p className="mt-0.5 text-xs text-gray-400">{description}</p>
        )}
      </div>
      {badge && (
        <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-700">
          {badge}
        </span>
      )}
      <span className="text-gray-300">›</span>
    </>
  );

  if (href) {
    return (
      <Link href={href} className={base}>
        {inner}
      </Link>
    );
  }

  return (
    <button onClick={onClick} className={base}>
      {inner}
    </button>
  );
}

export default function SettingsPage() {
  const { user, loading, logout } = useAuth();
  const router = useRouter();

  useEffect(() => {
      if (!loading && !user) {
        router.replace("/login");
      }
    }, [user, loading, router]);

    if (loading) {
      return (
        <div className="flex min-h-screen items-center justify-center text-sm text-gray-400">
          로딩 중...
        </div>
      );
    }

    // 유저가 없으면 일단 아무것도 그리지 않고 위 useEffect가 실행되길 기다림
    if (!user) return null; 

    const balanceLabel = `${(user.balance ?? 0).toLocaleString()}원`;

  return (
    <AppShell>
      <div className="mx-auto max-w-md px-4 py-5">
        {/* 헤더 */}
        <div className="mb-6">
          <h1 className="text-xl font-black text-gray-900">설정</h1>
        </div>

        {/* 유저 정보 카드 */}
        <div className="mb-6 rounded-2xl bg-gradient-to-br from-blue-600 to-blue-700 p-5 text-white shadow-lg shadow-blue-200">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/20 text-2xl">
              {user.gender === "MALE" ? "👨" : user.gender === "FEMALE" ? "👩" : "👤"}
            </div>
            <div>
              <p className="text-base font-bold">
                {user.nickname ?? user.email.split("@")[0]}
              </p>
              <p className="text-xs text-blue-200">
                {user.university ?? "학교 미설정"} · {user.major ?? "전공 미설정"}
              </p>
            </div>
            {user.verification_status === "VERIFIED" && (
              <span className="ml-auto rounded-full bg-white/20 px-2.5 py-0.5 text-xs font-semibold">
                ✓ 인증
              </span>
            )}
          </div>

          {/* 잔액 표시 */}
          <div className="mt-4 flex items-center justify-between rounded-xl bg-white/10 px-4 py-3">
            <span className="text-sm text-blue-100">현재 잔액</span>
            <span className="text-lg font-black">💰 {balanceLabel}</span>
          </div>
        </div>

        {/* 계정 메뉴 */}
        <section className="mb-5">
          <p className="mb-2.5 px-1 text-xs font-semibold uppercase tracking-wide text-gray-400">
            계정
          </p>
          <div className="flex flex-col gap-2.5">
            <MenuItem
              icon="👤"
              label="내 프로필"
              description="프로필 정보 수정 및 학교 인증"
              href="/me/profile"
            />
          </div>
        </section>

        {/* 지갑 메뉴 */}
        <section className="mb-5">
          <p className="mb-2.5 px-1 text-xs font-semibold uppercase tracking-wide text-gray-400">
            지갑
          </p>
          <div className="flex flex-col gap-2.5">
            <MenuItem
              icon="💳"
              label="잔액 충전하기"
              description="토스 결제로 잔액을 충전합니다"
              href="/settings/wallet/charge"
              badge={balanceLabel}
            />
            <MenuItem
              icon="🏦"
              label="잔액 반환하기"
              description="잔액을 계좌로 반환합니다"
              href="/settings/wallet/withdraw"
            />
          </div>
        </section>

        {/* 기타 메뉴 */}
        <section className="mb-5">
          <p className="mb-2.5 px-1 text-xs font-semibold uppercase tracking-wide text-gray-400">
            기타
          </p>
          <div className="flex flex-col gap-2.5">
            {user.is_admin && (
              <MenuItem
                icon="🛡️"
                label="관리자 페이지"
                description="인증 서류 심사 및 관리"
                href="/admin"
              />
            )}
            <MenuItem
              icon="🚪"
              label="로그아웃"
              description="현재 계정에서 로그아웃합니다"
              onClick={logout}
              variant="danger"
            />
          </div>
        </section>

        {/* 버전 정보 */}
        <p className="mt-6 text-center text-xs text-gray-300">MEETIN v1.0.0</p>
      </div>
    </AppShell>
  );
}
