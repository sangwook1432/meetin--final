/**
 * ErrorBanner
 * - 재학인증 관련 메시지(403) → 주황색 안내 박스
 * - 일반 에러 → 빨간 박스
 */

const SOFT_KEYWORDS = [
  "대기 중",
  "승인 완료",
  "거절되었습니다",
  "재학 인증이 필요",
  "재학 인증",
];

function isSoftError(msg: string) {
  return SOFT_KEYWORDS.some((k) => msg.includes(k));
}

export default function ErrorBanner({ message }: { message: string | null }) {
  if (!message) return null;

  if (isSoftError(message)) {
    return (
      <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
        {message}
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-600">
      {message}
    </div>
  );
}
