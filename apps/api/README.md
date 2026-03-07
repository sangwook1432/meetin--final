# MEETIN API (Step 1)

## 1) 준비
- Postgres 실행
- DB 생성: meetin

## 2) 설치 (Windows PowerShell)
```powershell
cd meetin/apps/api
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
```

## 3) Alembic 마이그레이션
```powershell
alembic upgrade head
```

## 4) 실행
```powershell
uvicorn app.main:app --reload --port 8000
```

## 5) Swagger
http://localhost:8000/docs
