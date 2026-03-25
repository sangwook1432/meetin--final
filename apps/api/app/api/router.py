from fastapi import APIRouter
from app.api.routes import auth, me, admin_verifications, chats, hot, friends, wallet, notifications, tickets, review, preregister, admin_reports, profile_posts

router = APIRouter()

router.include_router(auth.router, prefix="/auth", tags=["auth"])
router.include_router(me.router, tags=["me"])
router.include_router(admin_verifications.router, prefix="/admin", tags=["admin"])
router.include_router(chats.router, tags=["chats"])
router.include_router(hot.router, tags=["hot"])
router.include_router(friends.router, tags=["friends"])
router.include_router(wallet.router, tags=["wallet"])
router.include_router(notifications.router, tags=["notifications"])
router.include_router(tickets.router, tags=["tickets"])
router.include_router(review.router, tags=["review"])
router.include_router(preregister.router, tags=["preregister"])
router.include_router(admin_reports.router, prefix="/admin", tags=["admin"])
router.include_router(profile_posts.router, tags=["profile_posts"])

from app.api.routes import meetings
router.include_router(meetings.router, tags=['meetings'])
