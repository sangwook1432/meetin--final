"use client";

import { useState } from "react";
import { AppShell } from "@/components/ui/AppShell";

const KAKAO_CHANNEL_URL = "https://pf.kakao.com/_xxxxxx";

interface FaqItem {
  question: string;
  answer: string;
}

const FAQ_ITEMS: FaqItem[] = [
  {
    question: "미팅은 어떻게 신청하나요?",
    answer:
      "둘러보기 탭에서 원하는 미팅을 찾아 '참가 신청' 버튼을 눌러 주세요. 모든 슬롯이 채워지면 매칭권 1개가 소모되고 매칭이 확정됩니다.",
  },
  {
    question: "매칭권은 어디서 구매하나요?",
    answer:
      "더보기 → [결제] 탭에서 잔액을 충전한 뒤, [매칭권] 탭에서 구매하실 수 있습니다.",
  },
  {
    question: "미팅 상대방 프로필은 언제 공개되나요?",
    answer:
      "참가 인원의 학교·학번·학과·나이는 매칭 확정 후 공개됩니다. 상대방으로부터 애프터 신청을 받으시면 전화번호도 추가로 확인하실 수 있습니다.",
  },
  {
    question: "미팅이 취소되면 매칭권은 환급되나요?",
    answer:
      "네, 아래 세 가지 경우 매칭권이 자동으로 환급됩니다.\n① 참여 인원 전원이 취소에 동의한 경우\n② 채팅방 내 부적절한 행위가 적발된 경우\n③ 사용자가 환급 포기 후 채팅방을 나간 경우\n거래 내역은 더보기 → [결제]에서 확인하실 수 있습니다.",
  },
  {
    question: "미팅에 참가했는데 상대방이 노쇼했어요.",
    answer:
      "미팅 당일 상대방이 나타나지 않았다면 카카오톡 고객센터로 문의해 주세요. 사실 확인 후 매칭권 환급 여부를 검토해 드립니다. 고의적인 노쇼가 확인된 사용자에게는 이용 제한 조치가 부여됩니다.",
  },
  {
    question: "지갑 잔액은 어떻게 충전하나요?",
    answer:
      "더보기 → [결제] 탭에서 토스페이먼츠를 통해 충전하실 수 있습니다. 충전된 잔액은 매칭권 구매에 사용됩니다.",
  },
  {
    question: "대학교 인증은 어떻게 하나요?",
    answer:
      "우측상단 '인증 필요->' 누르고 재학증명서 혹은 학생증을 업로드하시면 됩니다. 관리자 검토 후 1~2 영업일 내 인증이 완료되며, 완료 전까지 일부 기능이 제한될 수 있습니다.",
  },
  {
    question: "친구를 미팅에 초대할 수 있나요?",
    answer:
      "네, 미팅 개설 또는 참가 후 친구 초대 기능을 통해 같은 팀으로 참가할 수 있습니다. 먼저 더보기 → [친구] 탭에서 친구를 등록해 두세요.",
  },
  {
    question: "채팅 상대방을 신고하고 싶어요.",
    answer:
      "신고할 채팅 메시지 옆의 깃발 아이콘을 눌러 '신고하기'를 선택해 주세요. 접수 후 관리자가 검토하며, 규정 위반이 확인되면 경고 조치가 부여됩니다. 누적 경고 횟수에 따라 이용이 제한될 수 있습니다.",
  },
  {
    question: "탈퇴는 어떻게 하나요?",
    answer:
      "더보기 → [내 프로필] → [설정] 맨 하단에서 회원 탈퇴를 진행하실 수 있습니다. 탈퇴 전 남은 지갑 잔액을 반드시 확인해 주세요.",
  },
];

export default function SupportPage() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const toggle = (index: number) => {
    setOpenIndex((prev) => (prev === index ? null : index));
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-lg px-4 pt-8 pb-6">
        {/* 헤더 */}
        <div className="mb-6">
          <h1 className="text-2xl font-black text-gray-900">무엇을 도와드릴까요?</h1>
          <p className="mt-1 text-sm text-gray-400">궁금하신 점이 있으면 언제든지 문의해 주세요.</p>
        </div>

        {/* 카카오톡 1:1 문의 버튼 */}
        <button
          onClick={() => window.open(KAKAO_CHANNEL_URL, "_blank")}
          className="flex w-full items-center justify-center gap-2.5 rounded-2xl py-4 text-base font-bold shadow-sm active:opacity-80 transition-opacity"
          style={{ backgroundColor: "#FEE500", color: "#191600" }}
        >
          <KakaoIcon />
          카카오톡으로 1:1 문의하기
        </button>
        <p className="mt-2 text-center text-xs text-gray-400">
          평일 10:00 – 18:00 운영 (공휴일 제외)
        </p>

        {/* FAQ */}
        <div className="mt-8">
          <h2 className="mb-3 text-base font-extrabold text-gray-800">자주 묻는 질문</h2>
          <div className="divide-y divide-gray-100 rounded-2xl border border-gray-100 bg-white overflow-hidden">
            {FAQ_ITEMS.map((item, index) => {
              const isOpen = openIndex === index;
              return (
                <div key={index}>
                  <button
                    onClick={() => toggle(index)}
                    className="flex w-full items-center justify-between px-4 py-4 text-left transition-colors hover:bg-gray-50 active:bg-gray-100"
                  >
                    <span className="pr-3 text-sm font-semibold text-gray-800 leading-snug">
                      Q. {item.question}
                    </span>
                    <ChevronIcon open={isOpen} />
                  </button>

                  {/* 아코디언 본문 */}
                  <div
                    className="overflow-hidden transition-all duration-300 ease-in-out"
                    style={{ maxHeight: isOpen ? "300px" : "0px" }}
                  >
                    <p className="px-4 pb-4 pt-1 text-sm leading-relaxed text-gray-500">
                      A. {item.answer}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 앱 버전 */}
        <p className="mt-8 text-center text-xs text-gray-300">MEETIN. v1.0.0</p>
      </div>
    </AppShell>
  );
}

function KakaoIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="#191600"
      aria-hidden="true"
    >
      <path d="M12 3C6.477 3 2 6.477 2 10.8c0 2.717 1.69 5.1 4.267 6.533L5.2 20.4a.3.3 0 0 0 .43.34l4.27-2.85A11.6 11.6 0 0 0 12 18c5.523 0 10-3.477 10-7.8S17.523 3 12 3z" />
    </svg>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      className={`h-4 w-4 shrink-0 text-gray-400 transition-transform duration-300 ${open ? "rotate-180" : ""}`}
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.168l3.71-3.938a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06z"
        clipRule="evenodd"
      />
    </svg>
  );
}
