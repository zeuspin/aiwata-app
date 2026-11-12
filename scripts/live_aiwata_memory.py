"""Use AIWATA's Profile-scoped memory store, learning records and Curator."""

import asyncio
import contextlib
import hashlib
import json
from pathlib import Path
import re
import sys

from fastapi import HTTPException
from hermes_cli.web_models import ConfigUpdate, CuratorPause, LearningNodeEdit, LearningNodeRef
from hermes_cli.web_routers import config_env, status
from hermes_cli.web_server_profiles import _profile_scope
from hermes_constants import get_hermes_home
from tools import memory_tool, write_approval

SETTINGS = {
    "memoryEnabled": "memory_enabled",
    "userProfileEnabled": "user_profile_enabled",
    "writeApproval": "write_approval",
}


def digest(text):
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def verify_home(home):
    if Path(get_hermes_home()).resolve() != home:
        raise ValueError("无法验证当前 Profile。")
    paths = ("config.yaml", "memories", "memories/MEMORY.md", "memories/USER.md",
             "memories/MEMORY.md.lock", "memories/USER.md.lock", "pending/memory",
             "skills", "skills/.usage.json", "skills/.archive", "skills/.locks",
             "skills/.curator_state", "logs/curator")
    if any(not (home / path).resolve().is_relative_to(home) for path in paths):
        raise ValueError("当前 Profile 的记忆或技能目录指向其他位置。")


def learned_skill(id, home):
    from tools.skill_manager_tool import _find_skill

    found = _find_skill(id)
    path = (found["path"] / "SKILL.md").resolve() if found else None
    return path is not None and path.is_relative_to(home / "skills")


def graph_nodes(graph, home, profile):
    with _profile_scope(profile):
        return [{
            "id": row["id"], "title": row.get("label") or row["id"],
            "type": ("skill" if row["kind"] == "skill" else
                     "user" if row.get("memorySource") == "profile" else "memory"),
            "pinned": bool(row.get("pinned")),
        } for row in graph["nodes"] if row["kind"] == "memory" or learned_skill(row["id"], home)]


def pending_records(home):
    from tools.write_approval import MEMORY, _pending_files, get_pending

    for path in sorted(_pending_files(MEMORY)):
        if path.parent != home / "pending" / "memory" or path.resolve() != path or not re.fullmatch(r"[0-9a-f]{8}", path.stem):
            continue
        record = get_pending(MEMORY, path.stem)
        if record and record.get("id") == path.stem and isinstance(record.get("payload"), dict):
            yield record


def pending_revision(record):
    return digest(json.dumps(record, sort_keys=True, ensure_ascii=False))


def project_pending(record):
    payload = record["payload"]
    ops = payload.get("operations") if payload.get("action") == "batch" else [payload]
    return {
        "id": record["id"], "summary": record.get("summary"), "target": payload.get("target"),
        "createdAt": record.get("created_at"), "revision": pending_revision(record),
        "operations": [{key: op.get(key) for key in ("action", "content", "old_text", "matched_entry")}
                       for op in (ops or []) if isinstance(op, dict)],
    }


def review_pending(request, home):
    id = request["id"]
    record = next((entry for entry in pending_records(home) if entry["id"] == id), None)
    if not record or pending_revision(record) != request["revision"]:
        raise ValueError("待审批的写入已变化，请刷新后再处理。")
    if request["action"] == "approve":
        result = memory_tool.apply_memory_pending(record["payload"], memory_tool.load_on_disk_store())
        if not result.get("success"):
            raise ValueError(result.get("error") or "AIWATA 未应用此次记忆写入。")
    if not write_approval.discard_pending(write_approval.MEMORY, id):
        raise ValueError("无法确认待审批记录已移除，请刷新查看当前状态。")
    return {"ok": True}


def curator_review(preview):
    from agent import curator

    if not preview and not curator.is_enabled():
        raise ValueError("当前 Profile 的技能整理已禁用。")
    if not curator._claim_run():
        raise ValueError("当前 Profile 正在整理技能，请稍后再试。")
    try:
        return curator.run_curator_review(
            synchronous=True, dry_run=preview, consolidate=False if preview else None)
    finally:
        curator._release_run_claim()


async def handle(request):
    action, profile = request["action"], request["profile"]
    home = Path(request["profileHome"])
    with _profile_scope(profile):
        verify_home(home)
        if action == "read":
            memory, user = memory_tool.get_builtin_memory_store_flags()
            settings = {"memoryEnabled": memory, "userProfileEnabled": user,
                        "writeApproval": write_approval.write_approval_enabled(write_approval.MEMORY)}
            pending = sorted((project_pending(entry) for entry in pending_records(home)),
                             key=lambda row: row["createdAt"] or 0)
        elif action == "add":
            result = memory_tool.load_on_disk_store().add(request["target"], request["content"])
            if not result.get("success"):
                raise ValueError(result.get("error") or "AIWATA 未添加此记忆。")
            return {"ok": True}
        elif action in {"approve", "reject"}:
            return review_pending(request, home)
        elif action == "review":
            return curator_review(request["preview"])

    if action == "read":
        graph = await status.get_learning_graph(profile)
        return {"settings": settings, "nodes": graph_nodes(graph, home, profile),
                "pending": pending, "curator": await status.get_curator_status(profile)}
    if action == "setting":
        return await config_env.update_config(
            ConfigUpdate(config={"memory": {SETTINGS[request["key"]]: request["value"]}}), profile)
    if action == "pause":
        return await status.set_curator_paused(CuratorPause(paused=request["value"]), profile)

    id = request["id"]
    if not id.startswith("memory:"):
        graph = await status.get_learning_graph(profile)
        if not any(row["id"] == id for row in graph_nodes(graph, home, profile)):
            raise ValueError("当前 Profile 没有此学习技能。")
    detail = await status.get_learning_node(id, profile)
    revision = digest(detail["content"])
    if action == "detail":
        return {"content": detail["content"], "revision": revision}
    if revision != request["revision"]:
        raise ValueError("记录已在别处修改，请重新打开。")
    if action == "edit":
        await status.update_learning_node(LearningNodeEdit(id=id, content=request["content"]), profile)
    else:
        await status.delete_learning_node(LearningNodeRef(id=id), profile)
    return {"ok": True}


if __name__ == "__main__":
    try:
        with contextlib.redirect_stdout(sys.stderr):
            result = asyncio.run(handle(json.load(sys.stdin)))
        payload = {"result": result}
    except HTTPException as exc:
        payload = {"error": exc.detail if isinstance(exc.detail, str) else "AIWATA 无法完成此记忆操作。"}
    except (ValueError, OSError) as exc:
        payload = {"error": str(exc)}
    print(json.dumps(payload, ensure_ascii=False))
