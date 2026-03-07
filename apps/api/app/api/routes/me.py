from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.deps import get_db, get_current_user
from app.models.user import User
from app.models.verification_doc import VerificationDoc
from app.schemas.user import UserPublic, ProfileUpdateRequest
from app.schemas.verification import DocUploadRequest, VerificationDocOut

router = APIRouter()


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


@router.post("/me/docs", response_model=VerificationDocOut)
def upload_doc(
    payload: DocUploadRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    doc = VerificationDoc(
        user_id=user.id,
        doc_type=payload.doc_type,
        file_url=payload.file_url,
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)
    return doc
