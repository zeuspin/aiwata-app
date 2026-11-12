"""One-shot local adapter for the AIWATA dashboard's cron handlers."""

import asyncio
import contextlib
import json
from pathlib import Path
import re
import sys

from fastapi import HTTPException
from gateway.hosted_rooms import probe_hosted_room
from gateway.session_hosted_service import probe_native_room_owner
from hermes_constants import get_default_hermes_root
from hermes_cli.web_models import CronJobCreate, CronJobUpdate
from hermes_cli.web_routers import cron, sessions

JOB_FIELDS = (
    "id", "name", "prompt", "schedule", "schedule_display", "timezone", "repeat", "deliver",
    "workdir", "enabled", "state", "next_run_at", "last_run_at", "last_status", "last_error", "last_delivery_error",
    "scheduler_heartbeat_age_s", "latest_execution", "live_execution",
)
ROOM_DELIVERY = re.compile(r"room:([A-Za-z0-9][A-Za-z0-9._:-]{0,127})@default")
PLATFORM_DELIVERY = re.compile(r"[a-z][a-z0-9_-]{0,63}")


def external_platform(value):
    return (isinstance(value, str) and value not in {"local", "all", "origin"}
            and PLATFORM_DELIVERY.fullmatch(value) is not None)


async def delivery_targets(profile):
    result = await cron.get_cron_delivery_targets(profile=profile)
    return [{"id": target["id"], "name": target["name"], "configured": target.get("home_target_set") is True}
            for target in result["targets"] if external_platform(target.get("id"))]


async def validate_delivery(delivery, profile, *, require_target=True):
    if delivery == "local":
        return
    target = ROOM_DELIVERY.fullmatch(delivery) if isinstance(delivery, str) else None
    if target is not None and require_target:
        room_id = target[1]
        store = get_default_hermes_root() / "state.db"
        if not (probe_hosted_room(store, room_id=room_id)
                and probe_native_room_owner(store, room_id=room_id)):
            raise ValueError("投递群聊已移除或不属于当前账号，请重新选择。")
    if target is not None:
        return
    if not external_platform(delivery):
        raise ValueError("请选择一个可用的投递目标。")
    if require_target and not any(row["id"] == delivery and row["configured"] for row in await delivery_targets(profile)):
        raise ValueError("当前 Profile 未配置此平台的默认投递频道。")


def project_job(job, profile):
    result = {key: job.get(key) for key in JOB_FIELDS}
    for key in ("latest_execution", "live_execution"):
        if execution := result[key]:
            result[key] = {field: execution.get(field)
                           for field in ("id", "status", "scheduled_instant", "delivery_outcome")}
    return {**result, "profile": profile, "delivery_unverified": bool(job.get("last_delivery_unverified"))}


async def history(job_id, profile):
    history = await cron.list_cron_job_runs(job_id, profile=profile)
    rows = []
    for row in history["runs"]:
        status = "running" if row.get("scheduler_owned") else row.get("end_reason")
        text = row.get("preview") if row.get("source") == "cron_output" else None
        if row.get("source") == "cron" and row.get("ended_at"):
            try:
                result = await sessions.get_session_messages(
                    row["id"], profile=profile, limit=40, offset=0, order="latest",
                    include_compacted=False, inline_images=False)
            except HTTPException as exc:
                if exc.status_code != 404:
                    raise
            else:
                for message in reversed(result["messages"]):
                    content = message.get("display_content", message.get("content"))
                    if message.get("role") == "assistant" and isinstance(content, str) and content.strip():
                        text = content.strip()
                        break
        title = row.get("title") or ""
        if title.startswith("CANCELLED ·"):
            status = "cancelled"
        elif title.startswith(("FAILED ·", "MISSED ·")):
            status = "failed"
        rows.append({"id": row["id"], "started_at": row["started_at"], "title": title,
                     "status": status, "result": text[:2400] if text else None})
    return {"runs": rows}


async def handle(request):
    action = request["action"]
    if action == "list":
        jobs = []
        for profile in request["profiles"]:
            jobs.extend(project_job(job, profile) for job in await cron.list_cron_jobs(profile=profile))
        return jobs

    profile = request["profile"]
    if action == "targets":
        return await delivery_targets(profile)
    job_id = request.get("id")
    job = None
    if job_id:
        # Dashboard routes can fall back to another Profile when a hint misses.
        jobs = await cron.list_cron_jobs(profile=profile)
        job = next((row for row in jobs if row.get("id") == job_id), None)
        if job is None:
            raise ValueError("当前 Profile 下没有此定时任务。")
    if job and action in {"save", "resume", "run"}:
        workspace = Path(request["workspace"])
        workdir = Path(job["workdir"]).resolve() if job.get("workdir") else None
        if (job.get("failure_deliver") or job.get("script") or job.get("no_agent") or
                job.get("monitor_script") or job.get("monitor_url") or
                not workdir or not workdir.is_dir()):
            raise ValueError("此任务需在 AIWATA 中管理。工作台仅直接运行已有目录中的 Agent 任务。")
        await validate_delivery(job.get("deliver"), profile, require_target=action != "save")
    if action == "save":
        data = request["data"]
        await validate_delivery(data["deliver"], profile)
        if job_id:
            # Preserve the original schedule when editing the other fields of a completed one-shot.
            if job["schedule"].get("run_at", job["schedule_display"]) == data["schedule"]:
                data.pop("schedule")
            if job.get("timezone") == data["timezone"]:
                data.pop("timezone")
            if (job.get("repeat") or {}).get("times") == data["repeat"]:
                data.pop("repeat")
            updated = await cron.update_cron_job(job_id, CronJobUpdate(updates=data), profile=profile)
        else:
            updated = await cron.create_cron_job(CronJobCreate(**data), profile=profile)
        return project_job(updated, profile)
    if action == "history":
        return await history(job_id, profile)
    handlers = {
        "pause": cron.pause_cron_job,
        "resume": cron.resume_cron_job,
        "run": cron.trigger_cron_job,
        "stop": cron.cancel_cron_job,
        "remove": cron.delete_cron_job,
    }
    result = await handlers[action](job_id, profile=profile)
    return project_job(result, profile) if action in {"pause", "resume", "run"} else result


if __name__ == "__main__":
    try:
        with contextlib.redirect_stdout(sys.stderr):
            result = asyncio.run(handle(json.load(sys.stdin)))
        payload = {"result": result}
    except HTTPException as exc:
        detail = exc.detail
        payload = {"error": detail if isinstance(detail, str) else "AIWATA 无法完成此定时任务操作。"}
    except ValueError as exc:
        payload = {"error": str(exc)}
    print(json.dumps(payload, ensure_ascii=False))
