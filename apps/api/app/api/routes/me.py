import os
import uuid
from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException
from sqlalchemy.orm import Session

from app.core.deps import get_db, get_current_user
from app.models.user import User
from app.models.verification_doc import VerificationDoc, DocType
from app.schemas.user import UserPublic, ProfileUpdateRequest
from app.schemas.verification import DocUploadRequest, VerificationDocOut

router = APIRouter()

UPLOAD_DIR = "/app/uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)


@router.get("/me", response_model=UserPublic)
def me(user: User = Depends(get_current_user)):
    return user


@router.patch("/me/profile", response_model=UserPublic)
def update_profile(
    payload: ProfileUpdateRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    data = payload.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(user, k, v)

    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.post("/me/photos/upload")
async def upload_photo(
    slot: int = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """프로필 사진 업로드. slot=1 또는 2."""
    if slot not in (1, 2):
        raise HTTPException(400, "slot은 1 또는 2여야 합니다.")

    filename = file.filename or ""
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext not in ("jpg", "jpeg", "png"):
        raise HTTPException(400, "JPG, PNG 파일만 업로드 가능합니다.")

    content = await file.read()
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(400, "파일 크기는 5MB를 초과할 수 없습니다.")

    save_name = f"photo_{user.id}_{slot}_{uuid.uuid4().hex[:8]}.{ext}"
    save_path = os.path.join(UPLOAD_DIR, save_name)
    with open(save_path, "wb") as f_out:
        f_out.write(content)

    photo_url = f"/uploads/{save_name}"
    if slot == 1:
        user.photo_url_1 = photo_url
    else:
        user.photo_url_2 = photo_url
    db.add(user)
    db.commit()

    return {"photo_url": photo_url}


@router.post("/me/docs", response_model=VerificationDocOut)
def upload_doc(
    payload: DocUploadRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """레거시: URL 방식 (하위 호환)"""
    doc = VerificationDoc(
        user_id=user.id,
        doc_type=payload.doc_type,
        file_url=payload.file_url,
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)
    return doc


@router.post("/me/docs/upload", response_model=VerificationDocOut)
async def upload_doc_file(
    doc_type: str = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    JPG/PNG 파일 업로드 방식으로 재학증명서 제출.
    실제 배포 시 S3/R2 등 외부 스토리지로 변경 권장.
    MVP: /tmp/uploads 에 저장 후 상대 경로를 file_url 로 기록.
    """
    # doc_type 검증
    try:
        doc_type_enum = DocType(doc_type)
    except ValueError:
        raise HTTPException(400, f"doc_type은 {[e.value for e in DocType]} 중 하나여야 합니다.")

    # 파일 형식 검증
    filename = file.filename or ""
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext not in ("jpg", "jpeg", "png", "pdf"):
        raise HTTPException(400, "JPG, PNG, PDF 파일만 업로드 가능합니다.")

    # 파일 저장
    save_name = f"{user.id}_{uuid.uuid4().hex[:8]}.{ext}"
    save_path = os.path.join(UPLOAD_DIR, save_name)
    content = await file.read()
    if len(content) > 10 * 1024 * 1024:  # 10MB 제한
        raise HTTPException(400, "파일 크기는 10MB를 초과할 수 없습니다.")

    with open(save_path, "wb") as f_out:
        f_out.write(content)

    file_url = f"/uploads/{save_name}"

    doc = VerificationDoc(
        user_id=user.id,
        doc_type=doc_type_enum,
        file_url=file_url,
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)
    return doc
