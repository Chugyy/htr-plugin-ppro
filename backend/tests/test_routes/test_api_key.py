# tests/test_routes/test_api_key.py

import uuid
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from app.api.routes.api_key import get_current_user, router

# ---------------------------------------------------------------------------
# App fixture (isolated — no DB dependency)
# ---------------------------------------------------------------------------

app = FastAPI(response_model_by_alias=True)
app.include_router(router)

MOCK_USER = SimpleNamespace(user_id=uuid.uuid4(), email="test@example.com")
MOCK_KEY_ROW = {
    "id": 1,
    "name": "My Key",
    "key": "dk_abcdefghijklmnopqrstuvwxyz0123456789012345",
    "is_active": True,
    "created_at": datetime(2026, 1, 1, tzinfo=timezone.utc),
    "last_used_at": None,
}


@pytest.fixture(autouse=True)
def override_auth():
    """Bypass JWT cookie auth — always return MOCK_USER."""
    app.dependency_overrides[get_current_user] = lambda: MOCK_USER
    yield
    app.dependency_overrides.clear()


@pytest.fixture
async def client():
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as c:
        yield c


# ---------------------------------------------------------------------------
# POST /api/api-keys
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_api_key(client: AsyncClient):
    with (
        patch(
            "app.api.routes.api_key.generate_api_key",
            return_value=MOCK_KEY_ROW["key"],
        ),
        patch(
            "app.api.routes.api_key.create_api_key",
            new=AsyncMock(return_value=MOCK_KEY_ROW),
        ),
    ):
        response = await client.post("/api/api-keys", json={"name": "My Key"})

    assert response.status_code == 201
    data = response.json()
    assert data["id"] == 1
    assert data["name"] == "My Key"
    assert data["key"].startswith("dk_")
    assert "createdAt" in data
    assert data["lastUsedAt"] is None


@pytest.mark.asyncio
async def test_create_api_key_missing_name(client: AsyncClient):
    response = await client.post("/api/api-keys", json={})
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_create_api_key_empty_name(client: AsyncClient):
    response = await client.post("/api/api-keys", json={"name": ""})
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_create_api_key_name_too_long(client: AsyncClient):
    response = await client.post("/api/api-keys", json={"name": "x" * 101})
    assert response.status_code == 422


# ---------------------------------------------------------------------------
# GET /api/api-keys
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_list_api_keys(client: AsyncClient):
    with patch(
        "app.api.routes.api_key.list_api_keys",
        new=AsyncMock(return_value=[MOCK_KEY_ROW]),
    ):
        response = await client.get("/api/api-keys")

    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) == 1
    assert data[0]["name"] == "My Key"


@pytest.mark.asyncio
async def test_list_api_keys_empty(client: AsyncClient):
    with patch(
        "app.api.routes.api_key.list_api_keys",
        new=AsyncMock(return_value=[]),
    ):
        response = await client.get("/api/api-keys")

    assert response.status_code == 200
    assert response.json() == []


# ---------------------------------------------------------------------------
# DELETE /api/api-keys/{id}
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_delete_api_key(client: AsyncClient):
    with patch(
        "app.api.routes.api_key.delete_api_key",
        new=AsyncMock(return_value=True),
    ):
        response = await client.delete("/api/api-keys/1")

    assert response.status_code == 204


@pytest.mark.asyncio
async def test_delete_api_key_not_found(client: AsyncClient):
    with patch(
        "app.api.routes.api_key.delete_api_key",
        new=AsyncMock(return_value=False),
    ):
        response = await client.delete("/api/api-keys/99999")

    assert response.status_code == 404


# ---------------------------------------------------------------------------
# Auth guard
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_endpoints_require_auth():
    """Without dependency override, missing cookie → 401."""
    bare_app = FastAPI(response_model_by_alias=True)
    bare_app.include_router(router)

    async with AsyncClient(
        transport=ASGITransport(app=bare_app), base_url="http://test"
    ) as c:
        for method, path, kwargs in [
            ("post", "/api/api-keys", {"json": {"name": "x"}}),
            ("get", "/api/api-keys", {}),
            ("delete", "/api/api-keys/1", {}),
        ]:
            response = await getattr(c, method)(path, **kwargs)
            assert response.status_code == 401, f"{method.upper()} {path} should return 401"
