import io
import boto3
from botocore.config import Config
from PIL import Image
from app.core.config import settings

_CONTENT_TYPES: dict[str, str] = {
    "jpg":  "image/jpeg",
    "jpeg": "image/jpeg",
    "png":  "image/png",
    "pdf":  "application/pdf",
}


def _client():
    return boto3.client(
        "s3",
        endpoint_url=settings.r2_endpoint_url,
        aws_access_key_id=settings.r2_access_key_id,
        aws_secret_access_key=settings.r2_secret_access_key,
        config=Config(signature_version="s3v4"),
        region_name="auto",
    )


def compress_image(content: bytes, max_px: int = 1200) -> tuple[bytes, str]:
    """이미지를 JPEG 85% 품질로 압축. (bytes, 'jpg') 반환."""
    img = Image.open(io.BytesIO(content))
    # RGBA/P 모드는 JPEG 저장 불가 → RGB 변환
    if img.mode in ("RGBA", "P"):
        img = img.convert("RGB")
    # 긴 변이 max_px 초과하면 비율 유지하며 축소
    if max(img.width, img.height) > max_px:
        img.thumbnail((max_px, max_px), Image.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=85, optimize=True)
    return buf.getvalue(), "jpg"


def upload_file(content: bytes, key: str, ext: str) -> str:
    """R2에 파일 업로드 후 공개 URL 반환."""
    content_type = _CONTENT_TYPES.get(ext, "application/octet-stream")
    _client().put_object(
        Bucket=settings.r2_bucket_name,
        Key=key,
        Body=content,
        ContentType=content_type,
    )
    return f"{settings.r2_public_url.rstrip('/')}/{key}"


def delete_file(key: str) -> None:
    """R2에서 파일 삭제. 실패해도 무시."""
    try:
        _client().delete_object(Bucket=settings.r2_bucket_name, Key=key)
    except Exception:
        pass
