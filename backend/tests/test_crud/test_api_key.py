# tests/test_crud/test_api_key.py

import secrets

import pytest

from app.database.crud.api_key import (
    create_api_key,
    delete_api_key,
    get_active_api_key_count,
    get_api_key_by_key,
    list_api_keys,
)


def _make_key() -> str:
    return "dk_" + secrets.token_urlsafe(32)


# ---------------------------------------------------------------------------
# create_api_key
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_create_api_key(test_user):
    key = _make_key()
    result = await create_api_key(user_id=test_user, name="Plugin PPro", key=key)

    assert result["id"] is not None
    assert result["name"] == "Plugin PPro"
    assert result["key"] == key
    assert result["is_active"] is True
    assert result["last_used_at"] is None
    assert result["created_at"] is not None


# ---------------------------------------------------------------------------
# list_api_keys
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_list_api_keys_returns_active_only(test_user):
    key1 = _make_key()
    key2 = _make_key()
    k1 = await create_api_key(user_id=test_user, name="Key A", key=key1)
    k2 = await create_api_key(user_id=test_user, name="Key B", key=key2)

    # Soft-delete one
    await delete_api_key(api_key_id=k1["id"], user_id=test_user)

    result = await list_api_keys(user_id=test_user)
    ids = [r["id"] for r in result]

    assert k2["id"] in ids
    assert k1["id"] not in ids


@pytest.mark.asyncio
async def test_list_api_keys_ordered_desc(test_user):
    k1 = await create_api_key(user_id=test_user, name="First", key=_make_key())
    k2 = await create_api_key(user_id=test_user, name="Second", key=_make_key())

    result = await list_api_keys(user_id=test_user)
    ids = [r["id"] for r in result]

    assert ids.index(k2["id"]) < ids.index(k1["id"])


@pytest.mark.asyncio
async def test_list_api_keys_empty(test_user):
    result = await list_api_keys(user_id=test_user)
    assert result == []


# ---------------------------------------------------------------------------
# delete_api_key (soft delete)
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_delete_api_key_success(test_user):
    k = await create_api_key(user_id=test_user, name="ToDelete", key=_make_key())
    deleted = await delete_api_key(api_key_id=k["id"], user_id=test_user)
    assert deleted is True

    # Must no longer appear in active list
    keys = await list_api_keys(user_id=test_user)
    assert all(r["id"] != k["id"] for r in keys)


@pytest.mark.asyncio
async def test_delete_api_key_wrong_owner(test_user):
    import uuid
    k = await create_api_key(user_id=test_user, name="Mine", key=_make_key())
    other_user = uuid.uuid4()
    deleted = await delete_api_key(api_key_id=k["id"], user_id=other_user)
    assert deleted is False


@pytest.mark.asyncio
async def test_delete_api_key_nonexistent(test_user):
    deleted = await delete_api_key(api_key_id=999999999, user_id=test_user)
    assert deleted is False


@pytest.mark.asyncio
async def test_delete_api_key_already_deleted(test_user):
    k = await create_api_key(user_id=test_user, name="Once", key=_make_key())
    await delete_api_key(api_key_id=k["id"], user_id=test_user)
    second = await delete_api_key(api_key_id=k["id"], user_id=test_user)
    assert second is False


# ---------------------------------------------------------------------------
# get_api_key_by_key
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_get_api_key_by_key_found(test_user):
    key = _make_key()
    await create_api_key(user_id=test_user, name="Lookup", key=key)

    result = await get_api_key_by_key(key=key)

    assert result is not None
    assert result["key"] == key
    assert result["last_used_at"] is not None  # updated by the query


@pytest.mark.asyncio
async def test_get_api_key_by_key_not_found():
    result = await get_api_key_by_key(key="dk_nonexistent_key_xxxxx")
    assert result is None


@pytest.mark.asyncio
async def test_get_api_key_by_key_inactive(test_user):
    key = _make_key()
    k = await create_api_key(user_id=test_user, name="Inactive", key=key)
    await delete_api_key(api_key_id=k["id"], user_id=test_user)

    result = await get_api_key_by_key(key=key)
    assert result is None


# ---------------------------------------------------------------------------
# get_active_api_key_count
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_get_active_api_key_count(test_user):
    assert await get_active_api_key_count(user_id=test_user) == 0

    k1 = await create_api_key(user_id=test_user, name="K1", key=_make_key())
    k2 = await create_api_key(user_id=test_user, name="K2", key=_make_key())
    assert await get_active_api_key_count(user_id=test_user) == 2

    await delete_api_key(api_key_id=k1["id"], user_id=test_user)
    assert await get_active_api_key_count(user_id=test_user) == 1
