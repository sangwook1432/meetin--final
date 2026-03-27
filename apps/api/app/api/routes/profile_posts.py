"""
profile_posts.py — 인스타그램 스타일 프로필 게시물 (사진)

GET    /me/profile-posts          — 내 게시물 목록
POST   /me/profile-posts/upload   — 사진 업로드
PATCH  /me/profile-posts/{id}     — 캡션 수정
DELETE /me/profile-posts/{id}     — 삭제
"""
import uuid
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.deps import get_db, get_current_user, require_verified
from app.core.storage import upload_file, delete_file, compress_image
from app.models.profile_post import ProfilePost
from app.models.user import User

router = APIRouter()

_MAGIC: dict[str, bytes] = {
    "jpg":  b"\xff\xd8\xff",
    "jpeg": b"\xff\xd8\xff",
    "png":  b"\x89PNG",
}

MAX_POSTS = 30  # 유저당 최대 게시물 수


def _check_magic(content: bytes, ext: str) -> bool:
    sig = _MAGIC.get(ext)
    return sig is None or content[:len(sig)] == sig


@router.get("/me/profile-posts")
def get_my_profile_posts(
    db: Session = Depends(get_db),
    user=Depends(require_verified),
):
    posts = db.execute(
        select(ProfilePost)
        .where(ProfilePost.user_id == user.id)
        .order_by(ProfilePost.created_at.desc())
    ).scalars().all()

    return {
        "posts": [
            {
                "id": p.id,
                "photo_url": p.photo_url,
                "caption": p.caption,
                "created_at": p.created_at.isoformat(),
            }
            for p in posts
        ]
    }


@router.post("/me/profile-posts/upload")
async def upload_profile_post(
    file: UploadFile = File(...),
    caption: str | None = Form(None),
    db: Session = Depends(get_db),
    user=Depends(require_verified),
):
    count = db.execute(
        select(ProfilePost).where(ProfilePost.user_id == user.id)
    ).scalars().all()
    if len(count) >= MAX_POSTS:
        raise HTTPException(400, f"게시물은 최대 {MAX_POSTS}개까지 업로드할 수 있습니다.")

    filename = file.filename or ""
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext not in ("jpg", "jpeg", "png"):
        raise HTTPException(400, "JPG, PNG 파일만 업로드 가능합니다.")

    content = await file.read()
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(400, "파일 크기는 10MB를 초과할 수 없습니다.")

    if not _check_magic(content, ext):
        raise HTTPException(400, "파일 내용이 선택한 형식과 일치하지 않습니다.")

    content, ext = compress_image(content, max_px=1200)
    save_name = f"pp_{user.id}_{uuid.uuid4().hex[:12]}.{ext}"
    photo_url = upload_file(content, save_name, ext)

    post = ProfilePost(
        user_id=user.id,
        photo_url=photo_url,
        caption=caption[:100] if caption else None,
    )
    db.add(post)
    db.commit()
    db.refresh(post)

    return {
        "id": post.id,
        "photo_url": post.photo_url,
        "caption": post.caption,
        "created_at": post.created_at.isoformat(),
    }


class CaptionUpdate(BaseModel):
    caption: str | None = None


@router.patch("/me/profile-posts/{post_id}")
def update_profile_post_caption(
    post_id: int,
    body: CaptionUpdate,
    db: Session = Depends(get_db),
    user=Depends(require_verified),
):
    post = db.execute(
        select(ProfilePost).where(
            ProfilePost.id == post_id,
            ProfilePost.user_id == user.id,
        )
    ).scalar_one_or_none()
    if not post:
        raise HTTPException(404, "게시물을 찾을 수 없습니다.")

    post.caption = body.caption[:100] if body.caption else None
    db.commit()
    return {"status": "ok"}


@router.delete("/me/profile-posts/{post_id}")
def delete_profile_post(
    post_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_verified),
):
    post = db.execute(
        select(ProfilePost).where(
            ProfilePost.id == post_id,
            ProfilePost.user_id == user.id,
        )
    ).scalar_one_or_none()
    if not post:
        raise HTTPException(404, "게시물을 찾을 수 없습니다.")

    # R2에서도 삭제
    key = post.photo_url.rsplit("/", 1)[-1]
    delete_file(key)

    db.delete(post)
    db.commit()
    return {"status": "ok"}


# ─── 공개 프로필 조회 ─────────────────────────────────────────────

@router.get("/users/{user_id}/profile")
def get_user_profile(
    user_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_verified),
):
    """다른 유저의 공개 프로필 조회."""
    user = db.get(User, user_id)
    if not user or user.is_banned:
        raise HTTPException(404, "유저를 찾을 수 없습니다.")

    posts = db.execute(
        select(ProfilePost)
        .where(ProfilePost.user_id == user_id)
        .order_by(ProfilePost.created_at.desc())
    ).scalars().all()

    entry_label = None
    if user.entry_year:
        y = user.entry_year % 100 if user.entry_year >= 100 else user.entry_year
        entry_label = f"{y:02d}학번"

    return {
        "user_id": user.id,
        "nickname": user.nickname,
        "university": user.university,
        "major": user.major,
        "entry_label": entry_label,
        "age": user.age,
        "bio_short": user.bio_short,
        "photo_url_1": user.photo_url_1,
        "cover_url": user.cover_url,
        "qa_answers": user.qa_answers,
        "posts": [
            {
                "id": p.id,
                "photo_url": p.photo_url,
                "caption": p.caption,
            }
            for p in posts
        ],
    }
