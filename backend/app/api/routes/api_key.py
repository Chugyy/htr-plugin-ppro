#!/usr/bin/env python3
# app/api/routes/api_key.py

from types import SimpleNamespace
from typing import List

from fastapi import APIRouter, Cookie, Depends, HTTPException

from app.api.models.api_key import ApiKeyCreateRequest, ApiKeyResponse
from app.core.utils.auth import decode_jwt, generate_api_key
from app.database.crud.api_key import create_api_key, delete_api_key, list_api_keys

router = APIRouter(prefix="/api/api-keys", tags=["api-keys"])


async def get_current_user(access_token: str = Cookie(None)) -> SimpleNamespace:
    if not access_token:
        raise HTTPException(status_code=401, detail="Missing authentication token")
    payload = decode_jwt(access_token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    return SimpleNamespace(user_id=payload["sub"], email=payload["email"])


@router.post("", response_model=ApiKeyResponse, status_code=201)
async def create_api_key_endpoint(
    data: ApiKeyCreateRequest,
    current_user: SimpleNamespace = Depends(get_current_user),
):
    key = generate_api_key()
    result = await create_api_key(
        user_id=current_user.user_id,
        name=data.name,
        key=key,
    )
    return result


@router.get("", response_model=List[ApiKeyResponse])
async def list_api_keys_endpoint(
    current_user: SimpleNamespace = Depends(get_current_user),
):
    return await list_api_keys(user_id=current_user.user_id)


@router.delete("/{id}", status_code=204)
async def delete_api_key_endpoint(
    id: int,
    current_user: SimpleNamespace = Depends(get_current_user),
):
    deleted = await delete_api_key(api_key_id=id, user_id=current_user.user_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="API key not found")
