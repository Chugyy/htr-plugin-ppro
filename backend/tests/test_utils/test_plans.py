import pytest
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock

from app.core.utils.plans import (
    get_plan_limits,
    get_access_level,
    get_all_plans,
    resolve_plan_from_price,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_settings(**overrides):
    s = MagicMock()
    s.stripe_price_starter_monthly = "price_starter_m"
    s.stripe_price_starter_annual = "price_starter_a"
    s.stripe_price_pro_monthly = "price_pro_m"
    s.stripe_price_pro_annual = "price_pro_a"
    s.stripe_price_agency_monthly = "price_agency_m"
    for k, v in overrides.items():
        setattr(s, k, v)
    return s


def _now(**delta):
    return datetime.now(tz=timezone.utc) - timedelta(**delta)


# ---------------------------------------------------------------------------
# get_plan_limits
# ---------------------------------------------------------------------------

class TestGetPlanLimits:
    def test_trial(self):
        limits = get_plan_limits("trial")
        assert limits == {"transcriptions": 10, "corrections": 10, "derushages": 10, "normalizations": 10}

    def test_starter(self):
        limits = get_plan_limits("starter")
        assert limits == {"transcriptions": 15, "corrections": 15, "derushages": 15, "normalizations": 15}

    def test_pro(self):
        limits = get_plan_limits("pro")
        assert limits == {"transcriptions": 60, "corrections": 60, "derushages": 60, "normalizations": 60}

    def test_agency_single_seat(self):
        limits = get_plan_limits("agency", seat_count=1)
        assert limits == {"transcriptions": 60, "corrections": 60, "derushages": 60, "normalizations": 60}

    def test_agency_multi_seats(self):
        limits = get_plan_limits("agency", seat_count=3)
        assert limits == {"transcriptions": 180, "corrections": 180, "derushages": 180, "normalizations": 180}

    def test_agency_default_seat_count(self):
        assert get_plan_limits("agency") == get_plan_limits("agency", seat_count=1)

    def test_unknown_plan_returns_zeros(self):
        limits = get_plan_limits("enterprise")
        assert limits == {"transcriptions": 0, "corrections": 0, "derushages": 0, "normalizations": 0}

    def test_returns_copy_not_reference(self):
        a = get_plan_limits("starter")
        b = get_plan_limits("starter")
        a["transcriptions"] = 999
        assert b["transcriptions"] == 15


# ---------------------------------------------------------------------------
# get_access_level
# ---------------------------------------------------------------------------

class TestGetAccessLevel:
    def test_active(self):
        assert get_access_level("active", None) == "full"

    def test_trialing(self):
        assert get_access_level("trialing", None) == "full"

    def test_past_due_no_failed_at(self):
        assert get_access_level("past_due", None) == "full"

    def test_past_due_within_grace(self):
        # 3 days ago — still within 7-day grace
        assert get_access_level("past_due", _now(days=3)) == "full"

    def test_past_due_exactly_grace_boundary(self):
        # 6 days ago → still "full" (< 7)
        assert get_access_level("past_due", _now(days=6)) == "full"

    def test_past_due_grace_expired(self):
        # 7 days ago → limited
        assert get_access_level("past_due", _now(days=7)) == "limited"

    def test_past_due_long_overdue(self):
        assert get_access_level("past_due", _now(days=30)) == "limited"

    def test_past_due_naive_datetime(self):
        # Naive datetime should be treated as UTC, not raise
        naive = datetime.utcnow() - timedelta(days=10)
        assert get_access_level("past_due", naive) == "limited"

    def test_cancelled(self):
        assert get_access_level("cancelled", None) == "blocked"

    def test_none_status(self):
        assert get_access_level(None, None) == "blocked"

    def test_unknown_status(self):
        assert get_access_level("paused", None) == "blocked"


# ---------------------------------------------------------------------------
# get_all_plans
# ---------------------------------------------------------------------------

class TestGetAllPlans:
    def setup_method(self):
        self.settings = _make_settings()
        self.plans = get_all_plans(self.settings)

    def test_returns_three_plans(self):
        assert len(self.plans) == 3

    def test_plan_ids(self):
        ids = [p["id"] for p in self.plans]
        assert ids == ["starter", "pro", "agency"]

    def test_starter_structure(self):
        starter = next(p for p in self.plans if p["id"] == "starter")
        assert starter["highlighted"] is False
        assert starter["min_seats"] is None
        assert starter["trial_days"] == 14
        assert starter["limits"] == {"transcriptions": 15, "corrections": 15, "derushages": 15, "normalizations": 15}
        assert "monthly" in starter["prices"]
        assert "annual" in starter["prices"]

    def test_pro_highlighted(self):
        pro = next(p for p in self.plans if p["id"] == "pro")
        assert pro["highlighted"] is True

    def test_agency_per_seat_and_min_seats(self):
        agency = next(p for p in self.plans if p["id"] == "agency")
        assert agency["min_seats"] == 3
        assert agency["prices"]["monthly"]["per_seat"] is True
        assert "annual" not in agency["prices"]
        assert agency["limits_note"] == "par siege"

    def test_stripe_price_ids_injected(self):
        starter = next(p for p in self.plans if p["id"] == "starter")
        assert starter["prices"]["monthly"]["stripe_price_id"] == "price_starter_m"
        assert starter["prices"]["annual"]["stripe_price_id"] == "price_starter_a"

        pro = next(p for p in self.plans if p["id"] == "pro")
        assert pro["prices"]["monthly"]["stripe_price_id"] == "price_pro_m"
        assert pro["prices"]["annual"]["stripe_price_id"] == "price_pro_a"

        agency = next(p for p in self.plans if p["id"] == "agency")
        assert agency["prices"]["monthly"]["stripe_price_id"] == "price_agency_m"

    def test_required_keys_present(self):
        for plan in self.plans:
            for key in ("id", "name", "description", "prices", "limits", "features", "highlighted", "min_seats", "trial_days"):
                assert key in plan, f"Missing key '{key}' in plan '{plan['id']}'"


# ---------------------------------------------------------------------------
# resolve_plan_from_price
# ---------------------------------------------------------------------------

class TestResolvePlanFromPrice:
    def setup_method(self):
        self.settings = _make_settings()

    def test_starter_monthly(self):
        assert resolve_plan_from_price("price_starter_m", self.settings) == "starter"

    def test_starter_annual(self):
        assert resolve_plan_from_price("price_starter_a", self.settings) == "starter"

    def test_pro_monthly(self):
        assert resolve_plan_from_price("price_pro_m", self.settings) == "pro"

    def test_pro_annual(self):
        assert resolve_plan_from_price("price_pro_a", self.settings) == "pro"

    def test_agency_monthly(self):
        assert resolve_plan_from_price("price_agency_m", self.settings) == "agency"

    def test_unknown_price_returns_free(self):
        assert resolve_plan_from_price("price_unknown_xyz", self.settings) == "free"

    def test_empty_string_returns_free(self):
        assert resolve_plan_from_price("", self.settings) == "free"
