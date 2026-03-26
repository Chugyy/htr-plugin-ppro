#!/usr/bin/env python3
# app/api/routes/team.py

from types import SimpleNamespace
from typing import Optional
from datetime import date

from fastapi import APIRouter, Cookie, Depends, HTTPException, Query
from fastapi.responses import Response

from app.api.models.team import (
    InviteTeamMemberRequest,
    InviteTeamMemberResponse,
    AddTeamSeatsRequest,
    AddTeamSeatsResponse,
    TeamMembersListResponse,
    TeamMemberResponse,
)
from app.core.jobs.team import (
    invite_team_member,
    remove_team_member,
    add_team_seats,
    SeatsExhaustedError,
    InviteAlreadyPendingError,
    CannotRemoveOwnerError,
    MemberNotFoundError,
    SubscriptionNotFoundError,
    TeamNotFoundError,
    ForbiddenError,
)
from app.database.crud.team import get_team_by_owner, list_team_members
from app.core.utils.auth import decode_jwt

router = APIRouter(prefix="/api/team", tags=["team"])


# ---------------------------------------------------------------------------
# Dependency: require agency owner + resolve team
# ---------------------------------------------------------------------------

async def require_team_owner(access_token: Optional[str] = Cookie(None)) -> SimpleNamespace:
    """
    Chain:
    1. Decode JWT from httpOnly cookie
    2. Verify user.plan == 'agency'
    3. Resolve team by owner_id
    4. Return SimpleNamespace(user_id, team_id, seat_count)
    """
    if not access_token:
        raise HTTPException(status_code=401, detail="Authentication required")

    payload = decode_jwt(access_token)
    if payload is None:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    if payload.get("plan") != "agency":
        raise HTTPException(status_code=403, detail="Agency plan required")

    user_id: str = payload["sub"]
    team = await get_team_by_owner(user_id)
    if team is None:
        raise HTTPException(status_code=403, detail="No team found for this owner")

    return SimpleNamespace(user_id=user_id, team_id=team["id"], seat_count=team["seat_count"])


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/members", response_model=TeamMembersListResponse)
async def list_members_endpoint(
    month: Optional[date] = Query(None),
    ctx: SimpleNamespace = Depends(require_team_owner),
):
    from datetime import datetime
    month_dt = datetime(month.year, month.month, 1) if month else None
    members = await list_team_members(ctx.team_id, month=month_dt)
    return TeamMembersListResponse(
        data=[TeamMemberResponse(**m) for m in members],
        seat_count=ctx.seat_count,
        member_count=len(members),
    )


@router.post("/invite", response_model=InviteTeamMemberResponse, status_code=201)
async def invite_member_endpoint(
    data: InviteTeamMemberRequest,
    ctx: SimpleNamespace = Depends(require_team_owner),
):
    try:
        result = await invite_team_member(
            owner_id=ctx.user_id,
            team_id=ctx.team_id,
            email=data.email,
        )
    except SeatsExhaustedError as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    except InviteAlreadyPendingError as exc:
        raise HTTPException(status_code=409, detail=str(exc))

    return InviteTeamMemberResponse(**result)


@router.delete("/members/{user_id}", status_code=204)
async def remove_member_endpoint(
    user_id: str,
    ctx: SimpleNamespace = Depends(require_team_owner),
):
    try:
        await remove_team_member(
            owner_id=ctx.user_id,
            team_id=ctx.team_id,
            user_id=user_id,
        )
    except CannotRemoveOwnerError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except MemberNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))

    return Response(status_code=204)


@router.post("/seats", response_model=AddTeamSeatsResponse)
async def add_seats_endpoint(
    data: AddTeamSeatsRequest,
    ctx: SimpleNamespace = Depends(require_team_owner),
):
    try:
        result = await add_team_seats(
            owner_id=ctx.user_id,
            team_id=ctx.team_id,
            quantity_to_add=data.quantity,
        )
    except SubscriptionNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))

    return AddTeamSeatsResponse(**result)
