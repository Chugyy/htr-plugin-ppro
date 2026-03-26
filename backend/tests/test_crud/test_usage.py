# tests/test_crud/test_usage.py

import uuid
import pytest

from app.database.crud.usage import (
    track_usage,
    get_current_usage,
    count_feature_usage,
    record_stripe_event,
    check_stripe_event_processed,
)

FEATURES = ("transcription", "correction", "derushing", "normalization")


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
async def user_and_key(pool):
    """Create a user + api_key, return (user_id: UUID, api_key_id: int)."""
    async with pool.acquire() as conn:
        user_id = await conn.fetchval(
            """
            INSERT INTO users (email, password_hash, name)
            VALUES ($1, 'hash', 'Test User')
            RETURNING id
            """,
            f"test-usage-{uuid.uuid4()}@example.com",
        )
        api_key_id = await conn.fetchval(
            """
            INSERT INTO api_keys (user_id, name, key)
            VALUES ($1, 'Test Key', $2)
            RETURNING id
            """,
            user_id,
            f"dk_{uuid.uuid4().hex}",
        )
    return user_id, api_key_id


# ---------------------------------------------------------------------------
# track_usage
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_track_usage_inserts_row(pool, user_and_key):
    user_id, api_key_id = user_and_key
    await track_usage(user_id, api_key_id, "transcription")

    async with pool.acquire() as conn:
        count = await conn.fetchval(
            "SELECT COUNT(*) FROM usage WHERE user_id = $1 AND feature = $2",
            user_id, "transcription",
        )
    assert count == 1


@pytest.mark.asyncio
async def test_track_usage_returns_none(pool, user_and_key):
    user_id, api_key_id = user_and_key
    result = await track_usage(user_id, api_key_id, "correction")
    assert result is None


@pytest.mark.asyncio
async def test_track_usage_multiple_features(pool, user_and_key):
    user_id, api_key_id = user_and_key
    for feature in FEATURES:
        await track_usage(user_id, api_key_id, feature)

    async with pool.acquire() as conn:
        count = await conn.fetchval(
            "SELECT COUNT(*) FROM usage WHERE user_id = $1",
            user_id,
        )
    assert count == 4


# ---------------------------------------------------------------------------
# get_current_usage
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_get_current_usage_zero_when_empty(pool, user_and_key):
    user_id, _ = user_and_key
    result = await get_current_usage(user_id)

    assert set(result.keys()) == set(FEATURES)
    assert all(v == 0 for v in result.values())


@pytest.mark.asyncio
async def test_get_current_usage_counts_correctly(pool, user_and_key):
    user_id, api_key_id = user_and_key
    await track_usage(user_id, api_key_id, "transcription")
    await track_usage(user_id, api_key_id, "transcription")
    await track_usage(user_id, api_key_id, "correction")

    result = await get_current_usage(user_id)

    assert result["transcription"] == 2
    assert result["correction"] == 1
    assert result["derushing"] == 0
    assert result["normalization"] == 0


@pytest.mark.asyncio
async def test_get_current_usage_all_four_features_present(pool, user_and_key):
    user_id, _ = user_and_key
    result = await get_current_usage(user_id)
    assert len(result) == 4
    for feature in FEATURES:
        assert feature in result


@pytest.mark.asyncio
async def test_get_current_usage_filter_by_api_key(pool, user_and_key):
    user_id, api_key_id = user_and_key

    # Second api key for same user
    async with pool.acquire() as conn:
        other_key_id = await conn.fetchval(
            "INSERT INTO api_keys (user_id, name, key) VALUES ($1, 'Other', $2) RETURNING id",
            user_id,
            f"dk_{uuid.uuid4().hex}",
        )

    await track_usage(user_id, api_key_id, "transcription")
    await track_usage(user_id, other_key_id, "transcription")

    result_all = await get_current_usage(user_id)
    result_filtered = await get_current_usage(user_id, api_key_id=api_key_id)

    assert result_all["transcription"] == 2
    assert result_filtered["transcription"] == 1


# ---------------------------------------------------------------------------
# count_feature_usage
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_count_feature_usage_zero_when_empty(pool, user_and_key):
    user_id, _ = user_and_key
    count = await count_feature_usage(user_id, "transcription")
    assert count == 0


@pytest.mark.asyncio
async def test_count_feature_usage_returns_correct_count(pool, user_and_key):
    user_id, api_key_id = user_and_key
    await track_usage(user_id, api_key_id, "derushing")
    await track_usage(user_id, api_key_id, "derushing")
    await track_usage(user_id, api_key_id, "correction")

    count = await count_feature_usage(user_id, "derushing")
    assert count == 2


@pytest.mark.asyncio
async def test_count_feature_usage_returns_int(pool, user_and_key):
    user_id, _ = user_and_key
    count = await count_feature_usage(user_id, "normalization")
    assert isinstance(count, int)


# ---------------------------------------------------------------------------
# record_stripe_event
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_record_stripe_event_returns_true_on_first_insert(pool):
    event_id = f"evt_{uuid.uuid4().hex}"
    result = await record_stripe_event(event_id, "invoice.paid")
    assert result is True


@pytest.mark.asyncio
async def test_record_stripe_event_returns_false_on_duplicate(pool):
    event_id = f"evt_{uuid.uuid4().hex}"
    first = await record_stripe_event(event_id, "invoice.paid")
    second = await record_stripe_event(event_id, "invoice.paid")
    assert first is True
    assert second is False


@pytest.mark.asyncio
async def test_record_stripe_event_inserts_row(pool):
    event_id = f"evt_{uuid.uuid4().hex}"
    await record_stripe_event(event_id, "customer.subscription.updated")

    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT event_id FROM stripe_events WHERE event_id = $1", event_id
        )
    assert row is not None
    assert row["event_id"] == event_id


# ---------------------------------------------------------------------------
# check_stripe_event_processed
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_check_stripe_event_processed_false_when_not_recorded(pool):
    event_id = f"evt_{uuid.uuid4().hex}"
    result = await check_stripe_event_processed(event_id)
    assert result is False


@pytest.mark.asyncio
async def test_check_stripe_event_processed_true_after_record(pool):
    event_id = f"evt_{uuid.uuid4().hex}"
    await record_stripe_event(event_id, "invoice.paid")
    result = await check_stripe_event_processed(event_id)
    assert result is True
