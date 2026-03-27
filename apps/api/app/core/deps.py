from datetime import datetime, timezone

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.core.security import decode_token
from app.models.user import User, VerificationStatus

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_current_user(db: Session = Depends(get_db), token: str = Depends(oauth2_scheme)) -> User:
    try:
        payload = decode_token(token)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    if payload.get("type") != "access":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not an access token")

    user_id = payload.get("sub")
    if not user_id or not str(user_id).isdigit():
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token subject")

    user = db.get(User, int(user_id))
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    return user


def require_admin(user: User = Depends(get_current_user)) -> User:
    if not user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin only")
    return user


def require_verified_financial(user: User = Depends(get_current_user)) -> User:
    """잔액 조회/출금 전용 — 재학 인증은 필요하지만 밴/정지 중에도 허용."""
    if user.verification_status == VerificationStatus.PENDING:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="관리자 승인 대기 중입니다. 승인 완료 후 이용 가능합니다.",
        )
    if user.verification_status == VerificationStatus.REJECTED:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="재학 인증이 거절되었습니다. 서류를 다시 제출해주세요.",
        )
    if user.verification_status != VerificationStatus.VERIFIED:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="재학 인증이 필요합니다.",
        )
    return user


def require_verified(user: User = Depends(get_current_user)) -> User:
    if user.verification_status == VerificationStatus.PENDING:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="관리자 승인 대기 중입니다. 승인 완료 후 이용 가능합니다.",
        )
    if user.verification_status == VerificationStatus.REJECTED:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="재학 인증이 거절되었습니다. 서류를 다시 제출해주세요.",
        )
    if user.verification_status != VerificationStatus.VERIFIED:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="재학 인증이 필요합니다.",
        )

    if user.is_banned:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="이용이 영구 정지된 계정입니다.",
        )

    if user.suspended_until:
        now = datetime.now(timezone.utc)
        if user.suspended_until.tzinfo is None:
            from datetime import timezone as _tz
            suspended = user.suspended_until.replace(tzinfo=_tz.utc)
        else:
            suspended = user.suspended_until
        if suspended > now:
            until_str = suspended.astimezone().strftime("%Y년 %m월 %d일 %H:%M")
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"서비스 이용이 정지된 계정입니다. {until_str}까지 이용 제한됩니다.",
            )

    return user
