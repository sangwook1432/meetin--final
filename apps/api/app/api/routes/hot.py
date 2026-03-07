from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import select, func

from app.core.deps import get_db, require_verified
from app.models.user import User
from app.models.meeting import Team  # Team.MALE/FEMALE 재사용

router = APIRouter()

def _user_team_from_gender(user) -> Team | None:
    if not getattr(user, "gender", None):
        return None
    if getattr(user.gender, "name", None) == "MALE" or user.gender == Team.MALE:
        return Team.MALE
    return Team.FEMALE


def _opposite_team(team: Team) -> Team:
    return Team.FEMALE if team == Team.MALE else Team.MALE


@router.get("/hot/universities")
def hot_universities(
    gender: str = Query("opposite", pattern="^(opposite|male|female)$"),
    limit: int = Query(10, ge=1, le=50),
    db: Session = Depends(get_db),
    user=Depends(require_verified),
):
    """
    HOT universities:
      - gender=opposite(default): 내 반대 성별 VERIFIED 유저 수 TOP N
      - gender=male/female: 명시 성별로 계산
    """
    my_team = _user_team_from_gender(user)

    # ✅ gender=opposite인데 내 성별이 없으면 400 반환 (None.value 500 방지)
    if gender == "opposite":
        if my_team is None:
            from fastapi import HTTPException
            raise HTTPException(status_code=400, detail="Profile gender required for opposite filter")
        target_team = _opposite_team(my_team)
    elif gender == "male":
        target_team = Team.MALE
    else:
        target_team = Team.FEMALE

    q = (
        select(
            User.university,
            func.count(User.id).label("verified_count"),
        )
        .where(
            User.verification_status == "VERIFIED",
            User.gender == target_team,
            User.university.is_not(None),
            User.university != "",
        )
        .group_by(User.university)
        .order_by(func.count(User.id).desc(), User.university.asc())
        .limit(limit)
    )

    rows = db.execute(q).all()

    return {
        "target_gender": target_team.value if hasattr(target_team, "value") else str(target_team),
        "universities": [
            {"university": uni, "verified_count": int(cnt)}
            for (uni, cnt) in rows
        ],
    }