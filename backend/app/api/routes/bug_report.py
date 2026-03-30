#!/usr/bin/env python3
# app/api/routes/bug_report.py

import uuid as _uuid
from fastapi import APIRouter, Depends, HTTPException
from config.logger import logger
from app.api.middleware.auth import verify_api_key
from app.api.models.bug_report import BugReportCreate, BugReportResponse, BugReportDetail
from app.database.crud.bug_report import insert_bug_report, get_bug_report
from app.core.services.telegram import send_bug_report_notification

router = APIRouter(prefix="/bug-reports", tags=["bug-reports"])


@router.post("", response_model=BugReportResponse)
async def create_bug_report(body: BugReportCreate, auth=Depends(verify_api_key())):
    report_id = await insert_bug_report(
        user_id=_uuid.UUID(auth.user_id),
        feature=body.feature,
        error_message=body.error_message,
        error_stack=body.error_stack,
        frontend_logs=body.frontend_logs,
        project_state=body.project_state,
        system_info=body.system_info,
        request_ids=body.request_ids,
    )
    logger.info(f"[BUG_REPORT] #{report_id} from user {auth.user_id} — {body.feature}: {body.error_message[:100]}")

    send_bug_report_notification(
        report_id=report_id,
        feature=body.feature,
        error_message=body.error_message,
        system_info=body.system_info,
        project_state=body.project_state,
    )

    return BugReportResponse(id=report_id)


@router.get("/{report_id}", response_model=BugReportDetail)
async def get_bug_report_detail(report_id: int, auth=Depends(verify_api_key())):
    row = await get_bug_report(report_id)
    if not row:
        raise HTTPException(status_code=404, detail="Bug report not found")
    return BugReportDetail.model_validate(dict(row))
