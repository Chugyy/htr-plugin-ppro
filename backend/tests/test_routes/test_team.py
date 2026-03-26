#!/usr/bin/env python3
# tests/test_routes/test_team.py

"""
Endpoint tests for /api/team routes.

All job and CRUD functions are mocked — these tests validate the HTTP contract:
status codes, response shape, auth guards, and error mapping.

Fixtures expected from conftest.py (session scope):
- client: httpx.AsyncClient pointed at the FastAPI app
"""

import pytest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from httpx import AsyncClient

from app.api.routes.team import require_team_owner
from app.core.jobs.team import (
    SeatsExhaustedError,
    InviteAlreadyPendingError,
    CannotRemoveOwnerError,
    MemberNotFoundError,
    SubscriptionNotFoundError,
)

# ---------------------------------------------------------------------------
# Shared test data
# ---------------------------------------------------------------------------

OWNER_CTX = SimpleNamespace(
    user_id="00000000-0000-0000-0000-000000000001",
    team_id=1,
    seat_count=5,
)

MOCK_MEMBERS = [
    {
        "user_id": "00000000-0000-0000-0000-000000000001",
        "name": "Alice Owner",
        "email": "alice@example.com",
        "role": "owner",
        "joined_at": "2026-01-01T00:00:00+00:00",
        "usage_this_month": 10,
    },
    {
        "user_id": "00000000-0000-0000-0000-000000000002",
        "name": "Bob Member",
        "email": "bob@example.com",
        "role": "member",
        "joined_at": "2026-02-01T00:00:00+00:00",
        "usage_this_month": 3,
    },
]

MOCK_INVITE = {
    "invite_id": 42,
    "email": "newmember@example.com",
    "expires_at": "2026-03-25T12:00:00+00:00",
}

MOCK_SEATS = {
    "team_id": 1,
    "new_seat_count": 7,
    "stripe_subscription_item_id": "si_test123",
}

MEMBER_ID = "00000000-0000-0000-0000-000000000002"


def _override_auth(ctx: SimpleNamespace = OWNER_CTX):
    """Return a dependency override that injects ctx directly."""
    async def _dep():
        return ctx
    return _dep


# ---------------------------------------------------------------------------
# GET /api/team/members
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_list_members_success(client: AsyncClient):
    with patch("app.api.routes.team.list_team_members", new=AsyncMock(return_value=MOCK_MEMBERS)):
        from app.main import app
        app.dependency_overrides[require_team_owner] = _override_auth()
        response = await client.get("/api/team/members")
        app.dependency_overrides.clear()

    assert response.status_code == 200
    data = response.json()
    assert "data" in data
    assert len(data["data"]) == 2
    assert data["seatCount"] == 5
    assert data["memberCount"] == 2


@pytest.mark.asyncio
async def test_list_members_with_month_filter(client: AsyncClient):
    with patch("app.api.routes.team.list_team_members", new=AsyncMock(return_value=MOCK_MEMBERS)):
        from app.main import app
        app.dependency_overrides[require_team_owner] = _override_auth()
        response = await client.get("/api/team/members?month=2026-03-01")
        app.dependency_overrides.clear()

    assert response.status_code == 200


@pytest.mark.asyncio
async def test_list_members_unauthenticated(client: AsyncClient):
    response = await client.get("/api/team/members")
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_list_members_not_agency(client: AsyncClient):
    from app.api.routes.team import require_team_owner
    from fastapi import HTTPException

    async def _dep():
        raise HTTPException(status_code=403, detail="Agency plan required")

    from app.main import app
    app.dependency_overrides[require_team_owner] = _dep
    response = await client.get("/api/team/members")
    app.dependency_overrides.clear()

    assert response.status_code == 403


# ---------------------------------------------------------------------------
# POST /api/team/invite
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_invite_member_success(client: AsyncClient):
    with patch("app.api.routes.team.invite_team_member", new=AsyncMock(return_value=MOCK_INVITE)):
        from app.main import app
        app.dependency_overrides[require_team_owner] = _override_auth()
        response = await client.post("/api/team/invite", json={"email": "newmember@example.com"})
        app.dependency_overrides.clear()

    assert response.status_code == 201
    data = response.json()
    assert data["inviteId"] == 42
    assert data["email"] == "newmember@example.com"
    assert "expiresAt" in data


@pytest.mark.asyncio
async def test_invite_member_seats_exhausted(client: AsyncClient):
    with patch(
        "app.api.routes.team.invite_team_member",
        new=AsyncMock(side_effect=SeatsExhaustedError("No seats available")),
    ):
        from app.main import app
        app.dependency_overrides[require_team_owner] = _override_auth()
        response = await client.post("/api/team/invite", json={"email": "x@example.com"})
        app.dependency_overrides.clear()

    assert response.status_code == 409
    assert "seats" in response.json()["detail"].lower()


@pytest.mark.asyncio
async def test_invite_member_already_pending(client: AsyncClient):
    with patch(
        "app.api.routes.team.invite_team_member",
        new=AsyncMock(side_effect=InviteAlreadyPendingError("Invite already pending")),
    ):
        from app.main import app
        app.dependency_overrides[require_team_owner] = _override_auth()
        response = await client.post("/api/team/invite", json={"email": "x@example.com"})
        app.dependency_overrides.clear()

    assert response.status_code == 409


@pytest.mark.asyncio
async def test_invite_member_invalid_email(client: AsyncClient):
    from app.main import app
    app.dependency_overrides[require_team_owner] = _override_auth()
    response = await client.post("/api/team/invite", json={"email": "not-an-email"})
    app.dependency_overrides.clear()

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_invite_member_unauthenticated(client: AsyncClient):
    response = await client.post("/api/team/invite", json={"email": "x@example.com"})
    assert response.status_code == 401


# ---------------------------------------------------------------------------
# DELETE /api/team/members/{user_id}
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_remove_member_success(client: AsyncClient):
    with patch("app.api.routes.team.remove_team_member", new=AsyncMock(return_value=None)):
        from app.main import app
        app.dependency_overrides[require_team_owner] = _override_auth()
        response = await client.delete(f"/api/team/members/{MEMBER_ID}")
        app.dependency_overrides.clear()

    assert response.status_code == 204


@pytest.mark.asyncio
async def test_remove_member_cannot_remove_owner(client: AsyncClient):
    with patch(
        "app.api.routes.team.remove_team_member",
        new=AsyncMock(side_effect=CannotRemoveOwnerError("Owner cannot be removed")),
    ):
        from app.main import app
        app.dependency_overrides[require_team_owner] = _override_auth()
        response = await client.delete(f"/api/team/members/{MEMBER_ID}")
        app.dependency_overrides.clear()

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_remove_member_not_found(client: AsyncClient):
    with patch(
        "app.api.routes.team.remove_team_member",
        new=AsyncMock(side_effect=MemberNotFoundError("Member not found")),
    ):
        from app.main import app
        app.dependency_overrides[require_team_owner] = _override_auth()
        response = await client.delete(f"/api/team/members/{MEMBER_ID}")
        app.dependency_overrides.clear()

    assert response.status_code == 404


@pytest.mark.asyncio
async def test_remove_member_unauthenticated(client: AsyncClient):
    response = await client.delete(f"/api/team/members/{MEMBER_ID}")
    assert response.status_code == 401


# ---------------------------------------------------------------------------
# POST /api/team/seats
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_add_seats_success(client: AsyncClient):
    with patch("app.api.routes.team.add_team_seats", new=AsyncMock(return_value=MOCK_SEATS)):
        from app.main import app
        app.dependency_overrides[require_team_owner] = _override_auth()
        response = await client.post("/api/team/seats", json={"quantity": 2})
        app.dependency_overrides.clear()

    assert response.status_code == 200
    data = response.json()
    assert data["teamId"] == 1
    assert data["newSeatCount"] == 7
    assert data["stripeSubscriptionItemId"] == "si_test123"


@pytest.mark.asyncio
async def test_add_seats_subscription_not_found(client: AsyncClient):
    with patch(
        "app.api.routes.team.add_team_seats",
        new=AsyncMock(side_effect=SubscriptionNotFoundError("No subscription")),
    ):
        from app.main import app
        app.dependency_overrides[require_team_owner] = _override_auth()
        response = await client.post("/api/team/seats", json={"quantity": 1})
        app.dependency_overrides.clear()

    assert response.status_code == 404


@pytest.mark.asyncio
async def test_add_seats_invalid_quantity(client: AsyncClient):
    from app.main import app
    app.dependency_overrides[require_team_owner] = _override_auth()
    response = await client.post("/api/team/seats", json={"quantity": 0})
    app.dependency_overrides.clear()

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_add_seats_missing_body(client: AsyncClient):
    from app.main import app
    app.dependency_overrides[require_team_owner] = _override_auth()
    response = await client.post("/api/team/seats", json={})
    app.dependency_overrides.clear()

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_add_seats_unauthenticated(client: AsyncClient):
    response = await client.post("/api/team/seats", json={"quantity": 1})
    assert response.status_code == 401
