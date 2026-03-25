export const metadata = {
  title: "개인정보처리방침 — MEETIN.",
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-white px-5 py-10">
      <div className="mx-auto max-w-2xl">
        <h1 className="mb-1 text-2xl font-black text-gray-900">
          MEETIN<span className="text-blue-600">.</span> 개인정보처리방침
        </h1>
        <p className="mb-10 text-sm text-gray-400">시행일: 2026년 4월 1일</p>

        <section className="space-y-8 text-sm leading-relaxed text-gray-700">

          <p>
            전상욱(이하 &quot;운영자&quot;)은 이용자의 개인정보를 중요하게 생각하며,
            「개인정보 보호법」 및 관련 법령을 준수합니다.
            이 방침은 운영자가 제공하는 MEETIN.(이하 &quot;서비스&quot;)에서 수집하는 개인정보의
            처리 방법을 안내합니다.
          </p>

          <div>
            <h2 className="mb-3 text-base font-bold text-gray-900">제1조 (수집하는 개인정보 항목)</h2>
            <div className="space-y-4">
              <div>
                <p className="font-semibold text-gray-800 mb-1">① 회원가입 시</p>
                <ul className="list-disc pl-5 space-y-1 text-gray-600">
                  <li>이메일 주소</li>
                  <li>휴대폰 번호 (HMAC 암호화 저장, 뒷 4자리만 평문 보관)</li>
                  <li>비밀번호 (단방향 암호화 저장)</li>
                </ul>
              </div>
              <div>
                <p className="font-semibold text-gray-800 mb-1">② 프로필 설정 시</p>
                <ul className="list-disc pl-5 space-y-1 text-gray-600">
                  <li>닉네임, 성별, 나이</li>
                  <li>대학교, 학과, 학번(입학연도)</li>
                  <li>프로필 사진 (최대 2장)</li>
                  <li>자기소개 (선택)</li>
                </ul>
              </div>
              <div>
                <p className="font-semibold text-gray-800 mb-1">③ 재학 인증 시</p>
                <ul className="list-disc pl-5 space-y-1 text-gray-600">
                  <li>재학증명서 또는 학생증 사진</li>
                </ul>
              </div>
              <div>
                <p className="font-semibold text-gray-800 mb-1">④ 결제 시</p>
                <ul className="list-disc pl-5 space-y-1 text-gray-600">
                  <li>결제 수단 정보 (토스페이먼츠를 통해 처리, 운영자 서버에 카드번호 미저장)</li>
                  <li>출금 계좌 정보 (지갑 잔액 환불 요청 시에만 수집: 은행명, 계좌번호, 예금주)</li>
                </ul>
              </div>
              <div>
                <p className="font-semibold text-gray-800 mb-1">⑤ 서비스 이용 과정에서 자동 수집</p>
                <ul className="list-disc pl-5 space-y-1 text-gray-600">
                  <li>서비스 이용 기록, 접속 로그</li>
                  <li>채팅 메시지 내용</li>
                  <li>미팅 참여 및 평가 내역</li>
                </ul>
              </div>
            </div>
          </div>

          <div>
            <h2 className="mb-3 text-base font-bold text-gray-900">제2조 (개인정보 수집 및 이용 목적)</h2>
            <ul className="space-y-2 list-none">
              <li>① 회원 식별 및 본인 인증, 서비스 제공</li>
              <li>② 대학생 자격 확인 (재학 인증)</li>
              <li>③ 미팅 매칭 및 상대방 프로필 제공</li>
              <li>④ 서비스 내 채팅 기능 제공</li>
              <li>⑤ 지갑 잔액 충전 및 매칭권 결제, 환불 처리</li>
              <li>⑥ 고객 문의 처리 및 분쟁 해결</li>
              <li>⑦ 불법·부적절한 이용 방지 및 서비스 안정성 확보</li>
              <li>⑧ 서비스 개선 및 신규 기능 개발 (통계 분석, 익명 처리 후 활용)</li>
            </ul>
          </div>

          <div>
            <h2 className="mb-3 text-base font-bold text-gray-900">제3조 (개인정보 보유 및 이용 기간)</h2>
            <ul className="space-y-2 list-none">
              <li>① 회원 탈퇴 시 즉시 삭제합니다. 단, 아래 항목은 법령에 따라 일정 기간 보관됩니다.</li>
            </ul>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-xs border-collapse border border-gray-200">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="border border-gray-200 px-3 py-2 text-left font-semibold">보관 항목</th>
                    <th className="border border-gray-200 px-3 py-2 text-left font-semibold">보관 기간</th>
                    <th className="border border-gray-200 px-3 py-2 text-left font-semibold">근거 법령</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="border border-gray-200 px-3 py-2">계약·청약 철회 기록</td>
                    <td className="border border-gray-200 px-3 py-2">5년</td>
                    <td className="border border-gray-200 px-3 py-2">전자상거래법</td>
                  </tr>
                  <tr>
                    <td className="border border-gray-200 px-3 py-2">결제 및 대금 기록</td>
                    <td className="border border-gray-200 px-3 py-2">5년</td>
                    <td className="border border-gray-200 px-3 py-2">전자상거래법</td>
                  </tr>
                  <tr>
                    <td className="border border-gray-200 px-3 py-2">접속 로그</td>
                    <td className="border border-gray-200 px-3 py-2">3개월</td>
                    <td className="border border-gray-200 px-3 py-2">통신비밀보호법</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <h2 className="mb-3 text-base font-bold text-gray-900">제4조 (개인정보 제3자 제공)</h2>
            <ul className="space-y-2 list-none">
              <li>① 운영자는 이용자의 개인정보를 원칙적으로 외부에 제공하지 않습니다.</li>
              <li>② 다음의 경우 예외적으로 제공될 수 있습니다.
                <ul className="mt-1 ml-4 space-y-1 list-disc text-gray-600">
                  <li>이용자가 사전에 동의한 경우</li>
                  <li>법령에 의거하거나 수사기관의 적법한 요청이 있는 경우</li>
                </ul>
              </li>
              <li>③ 미팅 매칭이 성사된 경우, 상대방 팀에게 프로필 정보(닉네임, 대학교, 사진 등)가 공개됩니다. 이는 서비스의 본질적 기능으로, 가입 시 동의한 것으로 간주됩니다.</li>
            </ul>
          </div>

          <div>
            <h2 className="mb-3 text-base font-bold text-gray-900">제5조 (개인정보 처리 위탁)</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse border border-gray-200">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="border border-gray-200 px-3 py-2 text-left font-semibold">수탁 업체</th>
                    <th className="border border-gray-200 px-3 py-2 text-left font-semibold">위탁 업무</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="border border-gray-200 px-3 py-2">토스페이먼츠(주)</td>
                    <td className="border border-gray-200 px-3 py-2">결제 처리</td>
                  </tr>
                  <tr>
                    <td className="border border-gray-200 px-3 py-2">Solapi (솔라피)</td>
                    <td className="border border-gray-200 px-3 py-2">SMS 인증 발송</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <h2 className="mb-3 text-base font-bold text-gray-900">제6조 (개인정보 파기)</h2>
            <ul className="space-y-2 list-none">
              <li>① 보유 기간이 경과하거나 처리 목적이 달성된 개인정보는 지체 없이 파기합니다.</li>
              <li>② 전자 파일 형태의 정보는 복구 불가능한 방법으로 영구 삭제합니다.</li>
              <li>③ 종이 문서는 분쇄기로 분쇄하여 파기합니다.</li>
              <li>④ 재학 인증을 위해 수집된 재학증명서 또는 학생증 사진은 관리자의 승인(APPROVE) 또는 거절(REJECT) 처리가 완료되는 즉시 서버에서 영구 삭제됩니다.</li>
            </ul>
          </div>

          <div>
            <h2 className="mb-3 text-base font-bold text-gray-900">제7조 (이용자의 권리)</h2>
            <ul className="space-y-2 list-none">
              <li>① 이용자는 언제든지 자신의 개인정보를 조회, 수정, 삭제 요청할 수 있습니다.</li>
              <li>② 개인정보 처리 정지 또는 동의 철회를 요청할 수 있습니다.</li>
              <li>③ 위 권리 행사는 서비스 내 &apos;내 정보&apos; 메뉴 또는 아래 연락처를 통해 신청할 수 있습니다.</li>
            </ul>
          </div>

          <div>
            <h2 className="mb-3 text-base font-bold text-gray-900">제8조 (개인정보 보호 조치)</h2>
            <ul className="space-y-2 list-none">
              <li>① 휴대폰 번호는 HMAC-SHA256으로 암호화하여 저장하며, 원문은 AES-256으로 암호화 보관합니다.</li>
              <li>② 비밀번호는 bcrypt 단방향 해시로 저장하여 운영자도 원문을 알 수 없습니다.</li>
              <li>③ 서비스와 API 간 통신은 HTTPS(TLS)로 암호화됩니다.</li>
              <li>④ 개인정보에 대한 접근 권한은 최소한의 인원으로 제한합니다.</li>
            </ul>
          </div>

          <div>
            <h2 className="mb-3 text-base font-bold text-gray-900">제9조 (개인정보 보호책임자)</h2>
            <div className="rounded-xl bg-gray-50 p-4 text-xs text-gray-600 space-y-1">
              <p>성명: 전상욱</p>
              <p>이메일: adamjeon2003@gmail.com</p>
              <p className="pt-2 text-gray-400">
                개인정보 처리 관련 불만·피해 구제는 아래 기관에도 신청하실 수 있습니다.
              </p>
              <p>개인정보보호위원회: <span className="text-blue-600">privacy.go.kr</span></p>
              <p>개인정보침해신고센터: 국번없이 118</p>
            </div>
          </div>

          <div>
            <h2 className="mb-3 text-base font-bold text-gray-900">제10조 (방침 변경)</h2>
            <ul className="space-y-2 list-none">
              <li>① 이 방침은 법령·정책 변경 또는 서비스 변경에 따라 수정될 수 있습니다.</li>
              <li>② 변경 시 시행 7일 전 서비스 내 공지를 통해 알립니다.</li>
            </ul>
          </div>

          <div className="rounded-xl bg-gray-50 p-4 text-xs text-gray-500">
            <p>운영자: 전상욱</p>
            <p>서비스 도메인: [도메인]</p>
            <p>사업자등록번호: [사업자번호]</p>
            <p>문의: adamjeon2003@gmail.com</p>
          </div>

        </section>
      </div>
    </div>
  );
}
