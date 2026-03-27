# MEETIN — 대학 팀 미팅 매칭 플랫폼

> 실명 인증 기반의 그룹 소개팅 플랫폼. 2:2 / 3:3 팀 미팅, 보증금 노쇼 방지, 인증된 대학생만 참여.

---

## 📁 프로젝트 구조

```
meetin/
├── apps/
│   ├── api/          # FastAPI 백엔드
│   └── web/          # Next.js 프론트엔드
```

---

## 🚀 빠른 시작 (로컬 개발)

### 사전 요구사항

| 항목 | 버전 |
|------|------|
| Python | 3.11+ |
| Node.js | 20+ |
| PostgreSQL | 15+ |

---

### 1️⃣ 저장소 클론

```bash
git clone https://github.com/sangwook1432/meetin.git
cd meetin
```

---

### 2️⃣ 백엔드 설정 (FastAPI)

#### 2-1. 가상환경 생성 및 패키지 설치

```bash
cd apps/api

# 가상환경 생성 (권장)
python -m venv .venv
source .venv/bin/activate      # macOS/Linux
# .venv\Scripts\activate       # Windows

# 패키지 설치
pip install -r requirements.txt
```

#### 2-2. 환경 변수 설정

```bash
cp .env.example .env
# .env 파일을 열어 아래 값들을 반드시 수정하세요:
```

**필수 환경 변수:**

```env
# DB 연결 (PostgreSQL)
DATABASE_URL=postgresql+psycopg://postgres:password@localhost:5432/meetin

# JWT 비밀 키 (32자 이상 무작위 문자열)
JWT_SECRET=your-very-long-random-secret-here

# 전화번호 HMAC 해시 키 (JWT_SECRET과 다르게 설정)
PHONE_HMAC_SECRET=another-random-secret-here

# 관리자 이메일 (쉼표로 구분)
ADMIN_EMAILS=admin@meetinapp.com
```

**선택 환경 변수 (없으면 mock 모드로 동작):**

```env
# Toss 결제 (없으면 mock 결제)
TOSS_SECRET_KEY=test_sk_...
TOSS_CLIENT_KEY=test_ck_...

# 카카오 알림톡 (없으면 콘솔 로그)
KAKAO_API_KEY=
KAKAO_SENDER_KEY=

# Sentry 에러 모니터링 (없으면 비활성화)
SENTRY_DSN=
```

#### 2-3. PostgreSQL DB 생성

```bash
psql -U postgres
CREATE DATABASE meetin;
\q
```

#### 2-4. DB 마이그레이션

```bash
# apps/api 디렉토리에서 실행
alembic upgrade head
```

마이그레이션 히스토리:
- `9b571b11` — 초기 스키마 (users, meetings, meeting_slots)
- `7a41ae56` — 결제/확인 테이블 추가 (deposits, confirmations)
- `e30f40bf` — meeting_slots.confirmed 컬럼 추가
- `cf195490` — meetings.preferred_universities 컬럼 추가
- `cb3e8402` — 유니크 제약조건 추가 (deposits, chat_rooms)
- `a7c097f1` — replacement_requests 테이블 추가
- `8a04a294` — chat_messages 테이블 추가
- `a1b2c3d4` — users.phone_e164 컬럼 추가
- `f1a2b3c4` — deposit_status_enum에 REFUND_PENDING 추가
- `b2c3d4e5` — deposit_status_enum에 FAILED_REFUND 추가

#### 2-5. 백엔드 서버 실행

```bash
# apps/api 디렉토리에서
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

서버 시작 후 확인:
- API 문서: http://localhost:8000/docs
- 헬스체크: http://localhost:8000/health

---

### 3️⃣ 프론트엔드 설정 (Next.js)

#### 3-1. 패키지 설치

```bash
cd apps/web
npm install
```

#### 3-2. 환경 변수 설정

```bash
cp .env.local.example .env.local
# .env.local 수정
```

```env
# 백엔드 API 주소
NEXT_PUBLIC_API_URL=http://localhost:8000

# Toss 클라이언트 키 (없으면 mock 결제)
NEXT_PUBLIC_TOSS_CLIENT_KEY=
```

#### 3-3. 개발 서버 실행

```bash
npm run dev
```

프론트엔드: http://localhost:3000

---

## 📡 API 엔드포인트 요약

### 인증 (`/auth`)
| 메서드 | 경로 | 설명 |
|--------|------|------|
| POST | `/auth/register` | 회원가입 (이메일, 비밀번호, 전화번호) |
| POST | `/auth/login` | 로그인 → JWT 발급 |
| POST | `/auth/refresh` | 리프레시 토큰으로 액세스 토큰 갱신 |

### 내 정보 (`/me`)
| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/me` | 내 프로필 조회 |
| PATCH | `/me/profile` | 프로필 수정 |
| POST | `/me/docs` | 인증 서류 업로드 (재학증명서/학생증) |

### 미팅 (`/meetings`) — 인증 필요
| 메서드 | 경로 | 설명 |
|--------|------|------|
| POST | `/meetings` | 미팅 생성 |
| GET | `/meetings/discover` | 이성 미팅 탐색 |
| GET | `/meetings/vacancies` | 동성 미팅 탐색 |
| GET | `/meetings/{id}` | 미팅 상세 |
| POST | `/meetings/{id}/join` | 참가 (Rate: 30/min) |
| POST | `/meetings/{id}/leave` | 나가기 |
| POST | `/meetings/{id}/confirm` | 확정 (보증금 없이 직접 확정, deprecated) |

### 결제 (`/payments`) — 인증 필요
| 메서드 | 경로 | 설명 |
|--------|------|------|
| POST | `/payments/deposits/prepare` | Toss 주문 생성 (Rate: 20/min) |
| POST | `/payments/toss/confirm` | Toss 결제 서버 검증 (Rate: 20/min) |
| GET | `/payments/deposits/me` | 내 보증금 목록 |
| POST | `/payments/deposits/{id}/refund` | 보증금 환불 요청 |

### 채팅 (`/chats`) — 인증 필요
| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/chats` | 참가 중인 채팅방 목록 |
| GET | `/chats/{room_id}` | 메시지 조회 (페이지네이션) |
| POST | `/chats/{room_id}/messages` | 메시지 전송 |

### 관리자 (`/admin`) — 관리자 인증 필요
| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/admin/verifications` | 인증 대기 목록 |
| GET | `/admin/verifications/stats` | 인증 통계 |
| GET | `/admin/verifications/{id}/docs` | 서류 조회 |
| POST | `/admin/verifications/{id}/approve` | 인증 승인 |
| POST | `/admin/verifications/{id}/reject` | 인증 거부 |

---

## 💳 Toss 결제 연동

### 테스트 키 발급
1. [Toss 개발자센터](https://developers.tosspayments.com/) 가입
2. 대시보드 → 테스트 API 키 발급
3. `.env`에 설정:
   ```env
   TOSS_SECRET_KEY=test_sk_...   # 서버 키 (백엔드)
   TOSS_CLIENT_KEY=test_ck_...   # 클라이언트 키 (프론트엔드)
   ```

### 결제 흐름
```
1. 미팅 WAITING_CONFIRM 상태
2. 멤버가 [보증금 결제] 클릭
3. 백엔드 POST /payments/deposits/prepare → orderId 발급
4. Toss 위젯 팝업 (TOSS_CLIENT_KEY 있는 경우)
   없는 경우: mock 결제 자동 진행
5. 결제 성공 → Toss가 successUrl로 리다이렉트
   successUrl = /meetings/{id}?orderId=...&paymentKey=...
6. 페이지 로드 시 서버 검증 (POST /payments/toss/confirm)
7. 모든 멤버 결제 완료 → meeting.status = CONFIRMED + ChatRoom 생성
8. /chats/{room_id} 로 자동 이동
```

### 환불 흐름
- **자동 환불**: WAITING_CONFIRM에서 leave → REFUND_PENDING → 배치(5분)에서 Toss 취소 API 호출 → REFUNDED
- **수동 환불**: POST /payments/deposits/{id}/refund

---

## 🔧 주요 기술 스택

### 백엔드
- **FastAPI** 0.115.6 — 비동기 웹 프레임워크
- **SQLAlchemy** 2.0.36 — ORM (mapped_column, select, with_for_update)
- **Alembic** 1.14.0 — DB 마이그레이션
- **psycopg** 3.2.13 — PostgreSQL 드라이버
- **APScheduler** 3.10.4 — 환불 배치 (5분 주기)
- **httpx** 0.28.1 — Toss/카카오 API 호출
- **slowapi** 0.1.9 — Rate Limiting
- **sentry-sdk** 2.21.0 — 에러 모니터링 (선택)

### 프론트엔드
- **Next.js** 16.1.6 — React 프레임워크
- **TypeScript** 5.x
- **Tailwind CSS** 4.x
- **Toss Payments JS SDK** (CDN) — 결제 위젯

---

## 🗄️ 데이터 모델

### 핵심 테이블
```
users               — 사용자 (이메일, 전화번호 해시, 성별, 대학교, 인증상태)
meetings            — 미팅 (타입, 상태, 호스트, 선호 대학교)
meeting_slots       — 슬롯 (팀, 인덱스, 참가자, confirmed)
deposits            — 보증금 (상태: PENDING → HELD → REFUNDED/FORFEITED)
chat_rooms          — 채팅방 (미팅당 1개, CONFIRMED 시 자동 생성)
chat_messages       — 채팅 메시지
replacement_requests — 대타 요청 (CONFIRMED 미팅)
verification_docs   — 인증 서류
```

### DepositStatus 흐름
```
REQUIRED → PENDING → HELD → REFUND_PENDING → REFUNDED
                         └→ FORFEITED (노쇼)
                         └→ REFUND_PENDING → FAILED_REFUND (배치 최대 재시도 초과)
              └→ CANCELED (결제 안하고 취소)
```

### MeetingStatus 흐름
```
RECRUITING → WAITING_CONFIRM → CONFIRMED
           ↑_________________↓ (누군가 leave 시 슬롯 비면 RECRUITING 복귀)
```

---

## 🛡️ 보안 설계

| 항목 | 구현 |
|------|------|
| 전화번호 저장 | HMAC-SHA256 해시만 저장 (원문은 phone_e164에 저장, 암호화 권장) |
| JWT | Access(60분) + Refresh(14일) 분리 |
| 동시성 제어 | SELECT ... FOR UPDATE (슬롯 참가/나가기/결제) |
| Rate Limiting | join 30/min, payments 20/min, 전체 200/min |
| 에러 응답 | 통일 포맷: `{"error": {"status": 4xx, "detail": "...", "request_id": "..."}}` |
| 요청 추적 | X-Request-ID 헤더 + JSON 구조화 로그 |

---

## 🔍 에러 응답 포맷

```json
{
  "error": {
    "status": 400,
    "detail": "결제는 WAITING_CONFIRM 상태에서만 가능합니다.",
    "request_id": "a3f8b21c"
  }
}
```

---

## 🧑‍💻 개발 팁

### DB 마이그레이션 새로 만들기
```bash
cd apps/api
alembic revision --autogenerate -m "add_new_column"
alembic upgrade head
```

### 관리자 계정 만들기
`.env`의 `ADMIN_EMAILS`에 이메일 추가 후, 해당 이메일로 회원가입.

### API 문서 접속
개발 서버 실행 후 http://localhost:8000/docs (Swagger UI)

### 로그 확인
JSON 구조화 로그로 출력됩니다:
```json
{"ts":"2026-03-06T12:00:00","level":"INFO","logger":"meetin.http","msg":"POST /meetings/1/join 200","request_id":"a3f8b21c","duration_ms":45.2}
```

---

## 📋 Week 2-3 완료 기능

### Week 2 (안정화)
- ✅ 결제-확정 플로우 단일화 (`slot.confirmed` 단일 소스)
- ✅ 환불 로직 구현 (leave 시 자동 REFUND_PENDING)
- ✅ 카카오 알림톡 연동 (mock 포함)
- ✅ 관리자 UI (인증 서류 승인/거부)
- ✅ hot.py 버그 수정 (gender None 처리)
- ✅ 프론트 토큰 refresh 로직 검증
- ✅ slowapi 기본 Rate Limiting (200/min)
- ✅ Sentry 에러 모니터링 연동
- ✅ JSON 구조화 로깅 (request_id, duration_ms)

### Week 3 (품질)
- ✅ DB 커넥션 풀 튜닝 (pool_size=10, max_overflow=20, slow query 감지)
- ✅ `User.phone_e164` 컬럼 추가 (알림 발송용)
- ✅ Toss 결제 서버 검증 활성화 (`_toss_confirm_sync`)
- ✅ REFUND_PENDING 배치 (APScheduler, 5분 주기) — `services/scheduler.py`
- ✅ `DepositStatus.FAILED_REFUND` 추가 (MAX_RETRY 초과 시 수동 처리 대상)
- ✅ Lifespan으로 스케줄러 통합 (`main.py`)
- ✅ 글로벌 에러 핸들러 + 통일된 에러 응답 포맷
- ✅ 엔드포인트별 Rate Limiting (join 30/min, payments 20/min)
- ✅ Toss 결제 위젯 UI (WAITING_CONFIRM 페이지, mock 포함)
- ✅ 프론트엔드 결제 API (`prepareDeposit`, `confirmTossPayment`, `getMyDeposits`)

---

## 🗓️ 다음 단계 (Week 4 추천)

- [ ] 얼굴 인증 플로우 (셀피 + Vision API 매칭)
- [ ] 매칭 추천 랭킹 알고리즘 (대학교 선호도, 나이 필터)
- [ ] 노쇼 처리 (보증금 몰수: `FORFEITED`)
- [ ] WebSocket 실시간 채팅 (현재 polling 방식)
- [ ] 관리자 보증금 현황 대시보드
- [ ] CI/CD 파이프라인 구축 (GitHub Actions)
- [ ] 스테이징/운영 환경 분리 배포

---

## 📞 문의

- GitHub: https://github.com/sangwook1432/meetin
- Branch: master
