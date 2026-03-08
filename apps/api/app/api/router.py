from fastapi import APIRouter
from app.api.routes import auth, me, admin_verifications, payments, replacement, chats, hot, wallet, friends, notifications

router = APIRouter()

router.include_router(payments.router, tags=["payments"])
router.include_router(auth.router, prefix="/auth", tags=["auth"])
router.include_router(me.router, tags=["me"])
router.include_router(admin_verifications.router, prefix="/admin", tags=["admin"])
router.include_router(replacement.router, tags=["replacement"])
router.include_router(chats.router, tags=["chats"])
router.include_router(hot.router, tags=["hot"])
router.include_router(wallet.router, tags=["wallet"])
router.include_router(friends.router, tags=["friends"])
router.include_router(notifications.router, tags=["notifications"])

from app.api.routes import meetings
router.include_router(meetings.router, tags=['meetings'])
