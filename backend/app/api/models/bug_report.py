#!/usr/bin/env python3
# app/api/models/bug_report.py

from datetime import datetime
from typing import Optional
from pydantic import Field
from app.api.models.common import BaseSchema


class BugReportCreate(BaseSchema):
    feature: str = Field(..., description="Plugin tab where the error occurred")
    error_message: str = Field(..., max_length=2000)
    error_stack: Optional[str] = Field(None, max_length=10000)
    frontend_logs: Optional[str] = Field(None, max_length=500000)
    project_state: Optional[dict] = None
    system_info: Optional[dict] = None
    request_ids: Optional[list[str]] = None


class BugReportResponse(BaseSchema):
    id: int


class BugReportDetail(BaseSchema):
    id: int
    user_id: Optional[str] = None
    feature: str
    error_message: str
    error_stack: Optional[str] = None
    frontend_logs: Optional[str] = None
    project_state: Optional[dict] = None
    system_info: Optional[dict] = None
    request_ids: Optional[list[str]] = None
    created_at: datetime
