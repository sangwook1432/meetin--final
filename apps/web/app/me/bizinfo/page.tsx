"use client";

import { AppShell } from "@/components/ui/AppShell";
import Link from "next/link";

export default function BizInfoPage() {
  return (
    <AppShell>
      <div className="mx-auto max-w-lg px-5 py-6">
        <h1 className="mb-6 text-lg font-black text-gray-900">사업자 정보</h1>

        <div className="space-y-3 rounded-2xl bg-white p-5 shadow-sm border border-gray-100 text-sm text-gray-700">
          <div className="flex flex-col gap-0.5">
            <span className="text-xs font-semibold text-gray-400">상호명</span>
            <span>MEETIN.</span>
          </div>
          <div className="h-px bg-gray-100" />
          <div className="flex flex-col gap-0.5">
            <span className="text-xs font-semibold text-gray-400">대표자</span>
            <span>전상욱</span>
          </div>
          <div className="h-px bg-gray-100" />
          <div className="flex flex-col gap-0.5">
            <span className="text-xs font-semibold text-gray-400">사업자등록번호</span>
            <span>420-05-03754 (간이과세자)</span>
          </div>
          <div className="h-px bg-gray-100" />
          <div className="flex flex-col gap-0.5">
            <span className="text-xs font-semibold text-gray-400">사업장 주소</span>
            <span>경기도 고양시 일산서구 대산로 106, 109동 1401호 (주엽동, 강선마을)</span>
          </div>
          <div className="h-px bg-gray-100" />
          <div className="flex flex-col gap-0.5">
            <span className="text-xs font-semibold text-gray-400">통신판매업신고번호</span>
            <span>신고 진행 중</span>
          </div>
          <div className="h-px bg-gray-100" />
          <div className="flex flex-col gap-0.5">
            <span className="text-xs font-semibold text-gray-400">유선번호</span>
            <span>010-4544-7834</span>
          </div>
          <div className="h-px bg-gray-100" />
          <div className="flex flex-col gap-0.5">
            <span className="text-xs font-semibold text-gray-400">이메일</span>
            <span>adamjeon2003@gmail.com</span>
          </div>
        </div>

        <p className="mt-4 text-xs leading-relaxed text-gray-400">
          본 서비스는 통신판매중개자로서 통신판매의 당사자가 아니며, 서비스 내 거래의 책임은 각 이용자에게 있습니다.
        </p>

        <div className="mt-3 flex gap-3">
          <Link
            href="/terms"
            className="flex-1 rounded-xl border border-gray-200 py-3 text-center text-sm font-semibold text-gray-700 hover:bg-gray-50 active:bg-gray-100"
          >
            이용약관
          </Link>
          <Link
            href="/privacy"
            className="flex-1 rounded-xl border border-gray-200 py-3 text-center text-sm font-semibold text-gray-700 hover:bg-gray-50 active:bg-gray-100"
          >
            개인정보처리방침
          </Link>
        </div>
      </div>
    </AppShell>
  );
}
