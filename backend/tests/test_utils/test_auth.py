import hashlib
import time

import pytest

from app.core.utils.auth import (
    decode_jwt,
    generate_api_key,
    generate_jwt,
    generate_reset_token,
    hash_password,
    hash_token,
    validate_register_inputs,
    verify_password,
)


# ---------------------------------------------------------------------------
# hash_password / verify_password
# ---------------------------------------------------------------------------

def test_hash_password_returns_string():
    result = hash_password("secret123")
    assert isinstance(result, str)
    assert result.startswith("$2b$")


def test_hash_password_uses_cost_12():
    result = hash_password("secret123")
    assert result.startswith("$2b$12$")


def test_hash_password_different_salts():
    h1 = hash_password("secret123")
    h2 = hash_password("secret123")
    assert h1 != h2


def test_verify_password_correct():
    pw = "my_password_99"
    assert verify_password(pw, hash_password(pw)) is True


def test_verify_password_wrong():
    assert verify_password("wrong", hash_password("correct")) is False


def test_verify_password_empty_against_hash():
    assert verify_password("", hash_password("something")) is False


# ---------------------------------------------------------------------------
# generate_jwt / decode_jwt
# ---------------------------------------------------------------------------

def test_generate_jwt_returns_string():
    token = generate_jwt(1, "user@example.com", "free")
    assert isinstance(token, str)
    assert len(token) > 0


def test_decode_jwt_valid_payload():
    token = generate_jwt(42, "test@test.com", "pro")
    payload = decode_jwt(token)
    assert payload is not None
    assert payload["sub"] == 42
    assert payload["email"] == "test@test.com"
    assert payload["plan"] == "pro"


def test_decode_jwt_contains_iat_and_exp():
    token = generate_jwt(1, "a@b.com")
    payload = decode_jwt(token)
    assert "iat" in payload
    assert "exp" in payload
    assert payload["exp"] > payload["iat"]


def test_decode_jwt_invalid_token_returns_none():
    assert decode_jwt("not.a.valid.token") is None


def test_decode_jwt_tampered_token_returns_none():
    token = generate_jwt(1, "a@b.com")
    tampered = token[:-4] + "XXXX"
    assert decode_jwt(tampered) is None


def test_decode_jwt_empty_string_returns_none():
    assert decode_jwt("") is None


# ---------------------------------------------------------------------------
# generate_api_key
# ---------------------------------------------------------------------------

def test_generate_api_key_prefix():
    key = generate_api_key()
    assert key.startswith("dk_")


def test_generate_api_key_length():
    key = generate_api_key()
    # "dk_" + token_urlsafe(32) — base64url of 32 bytes = 43 chars
    assert len(key) > 10


def test_generate_api_key_unique():
    keys = {generate_api_key() for _ in range(100)}
    assert len(keys) == 100


# ---------------------------------------------------------------------------
# generate_reset_token / hash_token
# ---------------------------------------------------------------------------

def test_generate_reset_token_returns_tuple():
    result = generate_reset_token()
    assert isinstance(result, tuple)
    assert len(result) == 2


def test_generate_reset_token_raw_is_string():
    raw, _ = generate_reset_token()
    assert isinstance(raw, str)
    assert len(raw) > 0


def test_generate_reset_token_hash_matches_raw():
    raw, token_hash = generate_reset_token()
    assert token_hash == hashlib.sha256(raw.encode()).hexdigest()


def test_generate_reset_token_unique():
    tokens = {generate_reset_token()[0] for _ in range(100)}
    assert len(tokens) == 100


def test_hash_token_sha256():
    raw = "abc123"
    expected = hashlib.sha256(b"abc123").hexdigest()
    assert hash_token(raw) == expected


def test_hash_token_deterministic():
    assert hash_token("same") == hash_token("same")


def test_hash_token_different_inputs():
    assert hash_token("a") != hash_token("b")


# ---------------------------------------------------------------------------
# validate_register_inputs
# ---------------------------------------------------------------------------

def test_validate_register_inputs_valid():
    errors = validate_register_inputs("User@Example.COM", "password123", "Alice")
    assert errors == []


def test_validate_register_inputs_invalid_email_no_at():
    errors = validate_register_inputs("notanemail", "password123", "Alice")
    assert any("email" in e for e in errors)


def test_validate_register_inputs_invalid_email_no_tld():
    errors = validate_register_inputs("user@nodomain", "password123", "Alice")
    assert any("email" in e for e in errors)


def test_validate_register_inputs_password_too_short():
    errors = validate_register_inputs("a@b.com", "short", "Alice")
    assert any("password" in e for e in errors)


def test_validate_register_inputs_password_exactly_8():
    errors = validate_register_inputs("a@b.com", "12345678", "Alice")
    assert errors == []


def test_validate_register_inputs_empty_name():
    errors = validate_register_inputs("a@b.com", "password123", "")
    assert any("name" in e for e in errors)


def test_validate_register_inputs_whitespace_name():
    errors = validate_register_inputs("a@b.com", "password123", "   ")
    assert any("name" in e for e in errors)


def test_validate_register_inputs_multiple_errors():
    errors = validate_register_inputs("bad", "123", "")
    assert len(errors) == 3


def test_validate_register_inputs_returns_list():
    result = validate_register_inputs("a@b.com", "password123", "Bob")
    assert isinstance(result, list)
