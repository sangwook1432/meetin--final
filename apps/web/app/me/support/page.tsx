"use client";

import { useState } from "react";
import { AppShell } from "@/components/ui/AppShell";
import { T, Icon, MoreNavBar } from "@/components/me/MoreAtoms";

const KAKAO_CHANNEL_ID = "_VBhxbX";
const KAKAO_CHAT_URL = `http://pf.kakao.com/${KAKAO_CHANNEL_ID}/chat`;
const KAKAO_DEEPLINK = `kakaoplus://plusfriend/chat/${KAKAO_CHANNEL_ID}`;

function openKakaoChat() {
  // Capacitor WebView에서는 kakaoplus:// 딥링크로 카카오톡 앱 직접 실행
  const isApp = !!(window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.();
  if (isApp) {
    window.location.href = KAKAO_DEEPLINK;
  } else {
    window.open(KAKAO_CHAT_URL, "_blank");
  }
}

interface FaqItem {
  question: string;
  answer: string;
}

const FAQ_ITEMS: FaqItem[] = [
  {
    question: "미팅은 어떻게 신청하나요?",
    answer:
      "둘러보기 / 빈자리 탭에서 원하는 미팅의 [참가 신청]을 눌러 주세요. 정원이 다 차면 매칭권 1장이 사용되고 매칭이 확정됩니다.",
  },
  {
    question: "매칭권은 어디서 구매하나요?",
    answer:
      "더보기 → 지갑에서 잔액을 충전한 뒤, 매칭권 탭에서 구매할 수 있어요.",
  },
  {
    question: "미팅이 취소되면 매칭권은 환급되나요?",
    answer:
      "다음 세 가지 경우에 자동으로 환급됩니다.\n① 참여자 전원이 취소에 동의한 경우\n② 채팅방 내 부적절한 행위가 적발된 경우\n③ 환급 포기 후 채팅방을 나간 경우\n거래 내역은 더보기 → 지갑에서 확인할 수 있어요.",
  },
  {
    question: "미팅 당일 상대가 노쇼했어요.",
    answer:
      "카카오톡 고객센터로 문의해 주세요. 사실 확인 후 매칭권 환급을 검토해 드리며, 노쇼한 사용자에게는 이용 제한 조치가 적용됩니다.",
  },
  {
    question: "지갑 잔액은 어떻게 충전하나요?",
    answer:
      "더보기 → 지갑에서 충전할 수 있어요. 충전된 잔액은 매칭권 구매에 사용됩니다.",
  },
  {
    question: "대학교 인증은 어떻게 하나요?",
    answer:
      "더보기 → 재학 인증에서 학생증 또는 재학증명서를 업로드해 주세요. 보통 24시간 이내 검토가 완료되며, 완료 전까지 일부 기능이 제한될 수 있어요.",
  },
  {
    question: "친구를 미팅에 초대할 수 있나요?",
    answer:
      "네, 미팅 개설 또는 참가 후 친구 초대 기능을 통해 같은 팀으로 참가할 수 있어요. 먼저 더보기 → 친구에서 친구를 등록해 두세요.",
  },
  {
    question: "채팅 상대를 신고하고 싶어요.",
    answer:
      "채팅 메시지 옆의 깃발 아이콘을 눌러 신고할 수 있어요. 누적 경고 횟수에 따라 이용이 제한될 수 있습니다.",
  },
  {
    question: "탈퇴는 어떻게 하나요?",
    answer:
      "더보기 → 내 프로필 → 설정 맨 하단에서 회원 탈퇴를 진행할 수 있어요. 탈퇴 전 남은 지갑 잔액을 반드시 확인해 주세요.",
  },
];

export default function SupportPage() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <AppShell>
      <div style={{ background: T.bg, minHeight: "100%", fontFamily: T.fontSans, paddingBottom: 40 }}>
        <MoreNavBar title="고객지원" fallbackHref="/me" />

        <div style={{ padding: "18px 16px" }}>
          <div style={{
            fontSize: 22, fontWeight: 800, color: T.ink,
            letterSpacing: "-0.025em", lineHeight: 1.25,
          }}>
            무엇을 도와드릴까요?
          </div>
          <div style={{ marginTop: 4, fontSize: 13, color: T.inkSoft }}>
            평일 10:00 – 18:00 (공휴일 제외)
          </div>

          {/* 카카오 1:1 문의 */}
          <button
            onClick={openKakaoChat}
            style={{
              marginTop: 14, width: "100%",
              background: "#FEE500", border: 0, borderRadius: T.radiusLg,
              padding: "16px 18px", cursor: "pointer", fontFamily: "inherit",
              display: "flex", alignItems: "center", gap: 12,
            }}
          >
            <div style={{
              width: 38, height: 38, borderRadius: 999,
              background: "#191600",
              display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
            }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="#FEE500" aria-hidden="true">
                <path d="M12 4C6.48 4 2 7.5 2 11.8c0 2.7 1.7 5.1 4.3 6.5l-1.1 3.5L9.5 19.5c.8.1 1.7.2 2.5.2 5.5 0 10-3.5 10-7.9S17.5 4 12 4z" />
              </svg>
            </div>
            <div style={{ textAlign: "left", flex: 1 }}>
              <div style={{
                fontSize: 14, fontWeight: 800, color: "#191600", letterSpacing: "-0.01em",
              }}>
                카카오톡으로 문의하기
              </div>
              <div style={{ fontSize: 11, color: "rgba(25,22,0,0.6)", marginTop: 2 }}>
                1:1 채팅으로 빠르게 답변드려요
              </div>
            </div>
            <Icon name="chevron" size={16} stroke="#191600" />
          </button>

          {/* FAQ */}
          <div style={{
            marginTop: 24, fontSize: 13, fontWeight: 800,
            color: T.ink, letterSpacing: "-0.01em",
          }}>
            자주 묻는 질문
          </div>

          <div style={{
            marginTop: 8, background: T.surface,
            border: `1px solid ${T.border}`,
            borderRadius: T.radiusLg, overflow: "hidden",
          }}>
            {FAQ_ITEMS.map((item, i) => {
              const isOpen = openIndex === i;
              return (
                <div key={i} style={{ borderTop: i === 0 ? "none" : `1px solid ${T.border}` }}>
                  <button
                    onClick={() => setOpenIndex(isOpen ? null : i)}
                    style={{
                      width: "100%", padding: "14px 14px",
                      display: "flex", alignItems: "center", gap: 8,
                      background: "transparent", border: 0, cursor: "pointer",
                      textAlign: "left", fontFamily: "inherit",
                    }}
                  >
                    <div style={{
                      width: 22, height: 22, borderRadius: 6, flexShrink: 0,
                      background: T.accentSoft, color: T.accentInk,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 11, fontWeight: 800,
                    }}>Q</div>
                    <div style={{
                      flex: 1, fontSize: 13, fontWeight: 700,
                      color: T.ink, lineHeight: 1.4, letterSpacing: "-0.01em",
                    }}>
                      {item.question}
                    </div>
                    <div style={{
                      transform: isOpen ? "rotate(90deg)" : "rotate(0)",
                      transition: "transform 0.18s",
                      color: T.inkSoft, flexShrink: 0,
                    }}>
                      <Icon name="chevron" size={14} />
                    </div>
                  </button>
                  {isOpen && (
                    <div style={{
                      padding: "0 14px 14px 44px",
                      fontSize: 12.5, color: T.inkMid,
                      lineHeight: 1.65, letterSpacing: "-0.005em",
                      whiteSpace: "pre-line",
                    }}>
                      {item.answer}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div style={{
            marginTop: 18, textAlign: "center", fontSize: 11,
            color: T.inkSoft, fontFamily: T.fontMono, letterSpacing: "0.08em",
          }}>
            MEETIN. v1.0.0
          </div>
        </div>
      </div>
    </AppShell>
  );
}
