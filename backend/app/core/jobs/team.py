import secrets
import hashlib
from datetime import datetime, timezone, timedelta
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

import aiosmtplib
import stripe

from app.database.crud.team import (
    get_team_with_member_count,
    get_pending_invites,
    create_team_invite,
    get_team_invite_by_token,
    mark_invite_used,
    add_team_member,
    get_team_member,
    remove_team_member as delete_team_member,
    deactivate_user_api_keys,
    update_team_seat_count,
    get_team_by_owner,
)
from app.database.crud.user import insert_user, get_user_by_id
from app.database.crud.api_key import create_api_key
from app.core.utils.auth import hash_password, hash_token, generate_api_key, generate_jwt
from config.config import settings


# ---------------------------------------------------------------------------
# Custom errors
# ---------------------------------------------------------------------------

class TeamNotFoundError(Exception):
    """Team does not exist."""

class ForbiddenError(Exception):
    """Caller is not the team owner."""

class SeatsExhaustedError(Exception):
    """All seats are occupied."""

class InviteAlreadyPendingError(Exception):
    """A pending invite for this email already exists."""

class InviteNotFoundError(Exception):
    """No invite matches the provided token."""

class InviteAlreadyUsedError(Exception):
    """Invite has already been consumed."""

class InviteExpiredError(Exception):
    """Invite has expired."""

class CannotRemoveOwnerError(Exception):
    """The owner cannot be removed from their own team."""

class MemberNotFoundError(Exception):
    """Target user is not a member of the team."""

class SubscriptionNotFoundError(Exception):
    """Owner has no active Stripe subscription."""


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _generate_invite_token() -> tuple[str, str]:
    """Return (raw_token, token_hash)."""
    raw = secrets.token_urlsafe(32)
    return raw, hashlib.sha256(raw.encode()).hexdigest()


async def _get_team_as_owner(team_id: int, owner_id: int) -> dict:
    """Fetch team and assert owner_id matches. Raises TeamNotFoundError or ForbiddenError."""
    team = await get_team_with_member_count(team_id)
    if team is None:
        raise TeamNotFoundError(f"Team {team_id} not found.")
    if team["owner_id"] != owner_id:
        raise ForbiddenError("Caller is not the team owner.")
    return team


async def _send_invite_email(to_email: str, raw_token: str) -> None:
    """Send invitation email via SMTP (aiosmtplib)."""
    invite_link = f"{settings.dashboard_url}/register?invite_token={raw_token}"

    msg = MIMEMultipart("alternative")
    msg["Subject"] = "Vous avez ete invite a rejoindre une equipe"
    msg["From"] = f"{settings.smtp_from_name} <{settings.smtp_from_email}>"
    msg["To"] = to_email

    html = f"""
    <p>Vous avez ete invite a rejoindre une equipe sur HTR Edit.</p>
    <p>Ce lien est valable 24h :</p>
    <p><a href="{invite_link}">{invite_link}</a></p>
    """
    msg.attach(MIMEText(html, "html"))

    await aiosmtplib.send(
        msg,
        hostname=settings.smtp_host,
        port=settings.smtp_port,
        username=settings.smtp_user,
        password=settings.smtp_password,
        start_tls=True,
    )


# ---------------------------------------------------------------------------
# Jobs
# ---------------------------------------------------------------------------

async def invite_team_member(owner_id: int, team_id: int, email: str) -> dict:
    """
    Invite a user to join a team.

    Workflow:
    1. Verify ownership + fetch team
    2. Check seat availability
    3. Check no pending invite for this email
    4. Generate invite token
    5. [TX] Insert team_invite
    6. Send invitation email
    """
    team = await _get_team_as_owner(team_id, owner_id)

    if team["member_count"] >= team["seat_count"]:
        raise SeatsExhaustedError("No seats available. Add more seats before inviting.")

    pending = await get_pending_invites(team_id)
    if any(inv["email"] == email for inv in pending):
        raise InviteAlreadyPendingError(f"A pending invite for {email} already exists.")

    raw_token, token_hash = _generate_invite_token()
    expires_at = datetime.now(timezone.utc) + timedelta(hours=24)

    from app.database.db import get_db_pool
    pool = await get_db_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            invite = await conn.fetchrow(
                """
                INSERT INTO team_invites (team_id, email, token_hash, expires_at)
                VALUES ($1, $2, $3, $4)
                RETURNING id, team_id, email, expires_at, created_at
                """,
                team_id, email, token_hash, expires_at,
            )
    invite = dict(invite)

    await _send_invite_email(email, raw_token)

    return {"invite_id": invite["id"], "email": invite["email"], "expires_at": invite["expires_at"]}


async def accept_team_invite(raw_token: str, email: str, password: str, name: str) -> dict:
    """
    Accept a team invite and create the user account.

    Workflow:
    1. Hash token → look up invite
    2. Validate invite (not used, not expired)
    3. Hash password
    4. [TX] insert_user → add_team_member → create_api_key → mark_invite_used
    5. Generate JWT
    """
    token_hash = hash_token(raw_token)

    # Fetch invite without the used/expired filters to give precise error messages
    from app.database.db import get_db_pool
    pool = await get_db_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT id, team_id, email, expires_at, used_at FROM team_invites WHERE token_hash = $1",
            token_hash,
        )

    if row is None:
        raise InviteNotFoundError("Invite token not found.")

    invite = dict(row)

    if invite["used_at"] is not None:
        raise InviteAlreadyUsedError("This invite has already been used.")

    now = datetime.now(timezone.utc)
    expires_at = invite["expires_at"]
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < now:
        raise InviteExpiredError("This invite has expired.")

    password_hash = hash_password(password)
    raw_api_key = generate_api_key()

    async with pool.acquire() as conn:
        async with conn.transaction():
            user_row = await conn.fetchrow(
                """
                INSERT INTO users (email, password_hash, name, stripe_customer_id, plan, subscription_status, created_at, updated_at)
                VALUES ($1, $2, $3, '', 'free', 'active', NOW(), NOW())
                RETURNING id, email, name, plan, created_at
                """,
                invite["email"], password_hash, name,
            )
            user = dict(user_row)

            await conn.fetchrow(
                """
                INSERT INTO team_members (team_id, user_id, role)
                VALUES ($1, $2, 'member')
                RETURNING id
                """,
                invite["team_id"], user["id"],
            )

            api_key_row = await conn.fetchrow(
                """
                INSERT INTO api_keys (user_id, name, key)
                VALUES ($1, $2, $3)
                RETURNING id, name, key, is_active, created_at, last_used_at
                """,
                user["id"], "Default", raw_api_key,
            )

            await conn.execute(
                "UPDATE team_invites SET used_at = NOW() WHERE id = $1",
                invite["id"],
            )

    jwt_token = generate_jwt(user["id"], user["email"], user["plan"])

    return {"user_id": user["id"], "api_key": raw_api_key, "jwt_token": jwt_token}


async def remove_team_member(owner_id: int, team_id: int, user_id: int) -> None:
    """
    Remove a member from a team and deactivate their API keys.

    Workflow:
    1. Verify ownership
    2. Guard: cannot remove the owner
    3. Verify the target is a member
    4. [TX] delete_team_member + deactivate_user_api_keys
    """
    await _get_team_as_owner(team_id, owner_id)

    if user_id == owner_id:
        raise CannotRemoveOwnerError("The owner cannot be removed from their own team.")

    member = await get_team_member(team_id, user_id)
    if member is None:
        raise MemberNotFoundError(f"User {user_id} is not a member of team {team_id}.")

    from app.database.db import get_db_pool
    pool = await get_db_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            await conn.execute(
                "DELETE FROM team_members WHERE team_id = $1 AND user_id = $2",
                team_id, user_id,
            )
            await conn.execute(
                "UPDATE api_keys SET is_active = FALSE WHERE user_id = $1 AND is_active = TRUE",
                user_id,
            )


async def add_team_seats(owner_id: int, team_id: int, quantity_to_add: int) -> dict:
    """
    Add seats to a team by modifying the Stripe subscription quantity.

    Workflow:
    1. Verify ownership
    2. Fetch owner's Stripe subscription
    3. Modify Stripe subscription quantity (with proration)
    4. [TX] Update seat_count in DB
    """
    team = await _get_team_as_owner(team_id, owner_id)

    owner = await get_user_by_id(owner_id)
    if not owner or not owner.get("stripe_subscription_id"):
        raise SubscriptionNotFoundError("No active Stripe subscription found for this owner.")

    stripe_subscription_item_id = owner.get("stripe_subscription_item_id")
    if not stripe_subscription_item_id:
        raise SubscriptionNotFoundError("No Stripe subscription item found.")

    new_quantity = team["seat_count"] + quantity_to_add

    stripe.api_key = settings.stripe_secret_key
    stripe.SubscriptionItem.modify(
        stripe_subscription_item_id,
        quantity=new_quantity,
        proration_behavior="create_prorations",
    )

    from app.database.db import get_db_pool
    pool = await get_db_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            await conn.execute(
                "UPDATE teams SET seat_count = $2 WHERE id = $1",
                team_id, new_quantity,
            )

    return {
        "team_id": team_id,
        "new_seat_count": new_quantity,
        "stripe_subscription_item_id": stripe_subscription_item_id,
    }
