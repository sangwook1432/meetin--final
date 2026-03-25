export const metadata = {
  title: "이용약관 — MEETIN.",
};

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-white px-5 py-10">
      <div className="mx-auto max-w-2xl">
        <h1 className="mb-1 text-2xl font-black text-gray-900">
          MEETIN<span className="text-blue-600">.</span> 이용약관
        </h1>
        <p className="mb-10 text-sm text-gray-400">시행일: 2026년 4월 1일</p>

        <section className="space-y-8 text-sm leading-relaxed text-gray-700">

          <div>
            <h2 className="mb-3 text-base font-bold text-gray-900">제1조 (목적)</h2>
            <p>
              이 약관은 전상욱(이하 &quot;운영자&quot;)이 제공하는 MEETIN.(이하 &quot;서비스&quot;)의
              이용과 관련하여 운영자와 이용자의 권리·의무 및 책임사항을 규정함을 목적으로 합니다.
            </p>
          </div>

          <div>
            <h2 className="mb-3 text-base font-bold text-gray-900">제2조 (정의)</h2>
            <ul className="space-y-2 list-none">
              <li>① &quot;서비스&quot;란 운영자가 제공하는 대학생 팀 미팅 매칭 플랫폼 MEETIN. 및 관련 부가 서비스를 의미합니다.</li>
              <li>② &quot;이용자&quot;란 이 약관에 동의하고 서비스에 가입한 자를 말합니다.</li>
              <li>③ &quot;매칭권&quot;이란 서비스 내 미팅 생성·참여·확정에 사용되는 디지털 이용권을 말합니다.</li>
              <li>④ &quot;지갑&quot;이란 서비스 내 충전 및 결제에 사용되는 가상 잔액을 말합니다.</li>
            </ul>
          </div>

          <div>
            <h2 className="mb-3 text-base font-bold text-gray-900">제3조 (약관의 효력 및 변경)</h2>
            <ul className="space-y-2 list-none">
              <li>① 이 약관은 서비스 내 화면에 게시하거나 이용자에게 공지함으로써 효력이 발생합니다.</li>
              <li>② 운영자는 관련 법령을 위반하지 않는 범위에서 약관을 변경할 수 있으며, 변경 시 시행 7일 전에 공지합니다.</li>
              <li>③ 이용자가 변경 약관에 동의하지 않을 경우 서비스 이용을 중단하고 탈퇴할 수 있습니다.</li>
            </ul>
          </div>

          <div>
            <h2 className="mb-3 text-base font-bold text-gray-900">제4조 (이용 자격)</h2>
            <ul className="space-y-2 list-none">
              <li>① 서비스는 대한민국 대학교에 재학 중인 만 18세 이상의 성인을 대상으로 합니다.</li>
              <li>② 운영자는 재학 인증(재학증명서 또는 학생증)을 요구할 수 있으며, 인증이 완료되지 않은 경우 일부 기능을 제한할 수 있습니다. 졸업생의 경우 가입이 제한되거나 별도의 절차를 따를 수 있습니다.</li>
            </ul>
          </div>

          <div>
            <h2 className="mb-3 text-base font-bold text-gray-900">제5조 (회원가입 및 계정)</h2>
            <ul className="space-y-2 list-none">
              <li>① 이용자는 이메일, 휴대폰 번호 인증을 통해 가입할 수 있습니다.</li>
              <li>② 이용자는 타인의 정보를 도용하거나 허위 정보를 기재해서는 안 됩니다.</li>
              <li>③ 계정 관리 책임은 이용자 본인에게 있으며, 타인에게 양도하거나 공유할 수 없습니다.</li>
              <li>④ 이용자는 계정이 무단으로 사용되는 것을 인지한 경우 즉시 운영자에게 통보하여야 합니다.</li>
            </ul>
          </div>

          <div>
            <h2 className="mb-3 text-base font-bold text-gray-900">제6조 (서비스 이용)</h2>
            <ul className="space-y-2 list-none">
              <li>① 서비스는 연중무휴 24시간 제공함을 원칙으로 하나, 시스템 점검 등으로 일시 중단될 수 있습니다.</li>
              <li>② 미팅 확정 시 매칭권이 차감되며, 일방적 취소나 노쇼(No-Show) 시 차감된 매칭권은 반환되지 않습니다.</li>
            </ul>
          </div>

          <div>
            <h2 className="mb-3 text-base font-bold text-gray-900">제7조 (유료 서비스 및 환불)</h2>
            <p className="mb-4 font-semibold text-gray-800">📜 MEETIN 지갑 충전 및 재화 환불 규정</p>

            <div className="space-y-5">
              <div>
                <h3 className="mb-2 font-semibold text-gray-800">제1조 (목적 및 정의)</h3>
                <ul className="space-y-1.5 list-none">
                  <li>① 본 규정은 회원이 'MEETIN(이하 "회사")'에서 제공하는 결제 서비스를 통해 지갑 잔액을 충전하고 이를 이용함에 있어, 회사와 회원 간의 권리, 의무 및 환불에 관한 제반 사항을 규정함을 목적으로 합니다.</li>
                  <li>② 본 규정에서 사용하는 용어의 정의는 다음과 같습니다.
                    <ul className="mt-1.5 ml-4 space-y-1 list-none">
                      <li>- <strong>&quot;지갑 잔액&quot;</strong>이라 함은 회원이 결제 대행사를 통해 현금을 결제하여 충전한 선불전자지급수단을 의미합니다.</li>
                      <li>- <strong>&quot;매칭권(티켓)&quot;</strong>이라 함은 회원이 &quot;지갑 잔액&quot;을 사용하여 앱 내에서 미팅 방 개설, 확정 등의 서비스를 이용하기 위해 구매하는 디지털 재화를 의미합니다.</li>
                      <li>- <strong>&quot;무상 재화&quot;</strong>라 함은 회사가 이벤트, 프로모션, 신규 가입 보상(웰컴 보너스) 등을 통해 회원에게 무료로 지급한 지갑 잔액 또는 매칭권을 의미합니다.</li>
                    </ul>
                  </li>
                </ul>
              </div>

              <div>
                <h3 className="mb-2 font-semibold text-gray-800">제2조 (지갑 충전 및 매칭권의 이용)</h3>
                <ul className="space-y-1.5 list-none">
                  <li>① 회원은 회사가 제공하는 결제 수단(신용카드, 계좌이체 등)을 통하여 지갑 잔액을 충전할 수 있습니다.</li>
                  <li>② 충전된 지갑 잔액은 매칭권(티켓) 구매에 사용되며, 매칭권은 미팅 매칭 및 채팅방 확정 시 정해진 수량만큼 차감됩니다.</li>
                </ul>
              </div>

              <div>
                <h3 className="mb-2 font-semibold text-gray-800">제3조 (청약철회)</h3>
                <ul className="space-y-1.5 list-none">
                  <li>① 회원은 지갑 충전일로부터 7일 이내에 충전한 잔액을 전혀 사용하지 않은 경우(매칭권 미구매 상태), 청약철회를 요청하여 충전 금액의 100%를 원래 결제 수단으로 결제 취소받을 수 있습니다.</li>
                </ul>
              </div>

              <div>
                <h3 className="mb-2 font-semibold text-gray-800">제4조 (일반 환불 및 환불 수수료)</h3>
                <ul className="space-y-1.5 list-none">
                  <li>① 충전일로부터 7일이 경과하였거나, 충전 금액의 일부를 사용하여 매칭권을 구매한 후 남은 &quot;지갑 잔액&quot;에 대하여 환불을 요청하는 경우, 이는 일반 환불로 처리됩니다.</li>
                  <li>② 일반 환불 시, 회사는 결제 대행 수수료, 송금 비용 및 시스템 운영비 등을 보전하기 위하여 <strong>환불 대상 금액의 10% (최소 공제 수수료 1,000원)</strong>를 환불 수수료로 공제한 후, 회원이 지정한 본인 명의의 계좌로 입금합니다.</li>
                  <li>③ 제2항에 따른 환불 수수료 공제 후 남은 환불 대상 금액이 0원 이하인 경우(남은 지갑 잔액이 1,000원 이하인 경우)에는 환불이 불가합니다.</li>
                </ul>
              </div>

              <div>
                <h3 className="mb-2 font-semibold text-gray-800">제5조 (환불 및 원복 불가 사유)</h3>
                <p className="mb-1.5">다음 각 호에 해당하는 경우 환불 및 원복이 불가합니다.</p>
                <ul className="space-y-1.5 list-none">
                  <li>① 지갑 잔액으로 구매가 완료된 &quot;매칭권&quot;은 원칙적으로 지갑 잔액으로 다시 원복하거나 현금으로 환불할 수 없습니다.</li>
                  <li>② 회사가 회원에게 무상으로 지급한 &quot;무상 재화(웰컴 보너스 등)&quot;는 어떠한 경우에도 현금으로 환불되거나 교환되지 않습니다.</li>
                  <li>③ 회원이 본 서비스의 이용약관을 위반하여 계정 이용 정지, 강제 탈퇴 등의 제재 조치를 받은 경우, 해당 회원이 보유한 지갑 잔액 및 매칭권은 제재 즉시 소멸하며 환불 대상에서 제외됩니다.</li>
                  <li>④ 미팅 확정 후 회원의 귀책사유(노쇼, 일방적 취소 등)로 인하여 매칭권이 차감되거나 몰수된 경우, 해당 매칭권은 복구 및 환불되지 않습니다.</li>
                </ul>
              </div>

              <div>
                <h3 className="mb-2 font-semibold text-gray-800">제6조 (소멸 시효)</h3>
                <p>회원이 유상으로 충전한 지갑 잔액 및 구매한 매칭권은 마지막 이용일(충전일 또는 사용일)로부터 5년이 경과하면 상법상의 상사소멸시효에 의해 자동으로 소멸합니다. 단, 무상 재화의 경우 회사가 사전에 공지한 별도의 유효기간이 적용될 수 있습니다.</p>
              </div>
            </div>
          </div>

          <div>
            <h2 className="mb-3 text-base font-bold text-gray-900">제8조 (금지 행위)</h2>
            <p className="mb-2">이용자는 다음 행위를 해서는 안 됩니다.</p>
            <ul className="space-y-1 list-none">
              <li>① 타인의 개인정보 도용 또는 허위 정보 기재</li>
              <li>② 타 이용자에 대한 욕설, 비하, 성희롱, 스토킹 등 불법·부적절한 행위</li>
              <li>③ 서비스를 영리 목적의 광고·홍보에 무단 이용하는 행위</li>
              <li>④ 서비스의 정상적인 운영을 방해하는 행위 (해킹, 악성 코드 배포 등)</li>
              <li>⑤ 관련 법령에 위반되는 일체의 행위</li>
              <li>⑥ 미팅 불참, 무단 취소 등 서비스 신뢰를 훼손하는 반복적 행위</li>
              <li>⑦ 본인의 계정 및 재학 인증 정보를 타인에게 양도, 대여, 판매하는 행위</li>
            </ul>
            <p className="mt-2">위 행위 적발 시 운영자는 사전 통보 없이 계정을 정지 또는 영구 탈퇴 처리할 수 있습니다.</p>
          </div>

          <div>
            <h2 className="mb-3 text-base font-bold text-gray-900">제9조 (회원 탈퇴)</h2>
            <ul className="space-y-2 list-none">
              <li>① 이용자는 언제든지 서비스 내 탈퇴 기능을 통해 탈퇴를 신청할 수 있습니다.</li>
              <li>② 탈퇴 시 지갑 잔액이 남아있는 경우, 탈퇴 전 환불 신청을 완료하여야 합니다.</li>
              <li>③ 탈퇴 후 개인정보는 개인정보처리방침에 따라 처리됩니다.</li>
            </ul>
          </div>

          <div>
            <h2 className="mb-3 text-base font-bold text-gray-900">제10조 (면책 조항)</h2>
            <ul className="space-y-2 list-none">
              <li>① 운영자는 천재지변, 전쟁, 기간통신사업자의 서비스 중단 등 불가항력으로 인한 서비스 장애에 대해 책임을 지지 않습니다.</li>
              <li>② 운영자는 이용자 간의 미팅에서 발생하는 분쟁, 사고에 대해 직접적인 책임을 지지 않습니다. 단, 서비스 내 신고 기능을 통해 적극적으로 중재합니다.</li>
              <li>③ 운영자는 이용자가 서비스를 통해 기대하는 수익이나 결과를 보장하지 않습니다.</li>
            </ul>
          </div>

          <div>
            <h2 className="mb-3 text-base font-bold text-gray-900">제11조 (분쟁 해결)</h2>
            <ul className="space-y-2 list-none">
              <li>① 서비스 이용과 관련한 분쟁은 운영자와 이용자 간 상호 협의하여 해결합니다.</li>
              <li>② 협의가 이루어지지 않는 경우, 관할 법원은 민사소송법에 따른 법원으로 합니다.</li>
              <li>③ 이 약관과 관련된 소송의 준거법은 대한민국 법으로 합니다.</li>
            </ul>
          </div>

          <div className="rounded-xl bg-gray-50 p-4 text-xs text-gray-500">
            <p>운영자: 전상욱</p>
            <p>서비스 도메인: [도메인]</p>
            <p>사업자등록번호: [사업자번호]</p>
            <p>문의: [이메일]</p>
          </div>

        </section>
      </div>
    </div>
  );
}
