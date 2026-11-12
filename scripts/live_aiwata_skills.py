"""Adapt the native skill catalog and management operations to one local Profile."""

import asyncio
import contextlib
import hashlib
import json
from pathlib import Path
import sys

from fastapi import HTTPException
from hermes_cli.web_models import SkillContentUpdate, SkillCreate, SkillLock, SkillToggle
from hermes_cli.web_routers import skills
from hermes_cli.web_server_profiles import _profile_scope
from hermes_constants import get_hermes_home


def local_catalog(root):
    from tools.skills_tool import _skill_catalog

    return {row["load_name"]: row["path"].resolve()
            for row in _skill_catalog(skip_disabled=True)
            if row["load_name"] and row["path"].resolve().is_relative_to(root)}


def require_matching_skill(name, path):
    from tools.skill_manager_tool import _find_skill

    found = _find_skill(name)
    if not found or (found["path"] / "SKILL.md").resolve() != path:
        raise ValueError("无法确认要管理的技能文件。")


def content_revision(content):
    return hashlib.sha256(content.encode("utf-8")).hexdigest()


async def handle(request):
    action, profile = request["action"], request["profile"]
    name = request.get("id")
    home = Path(request["profileHome"])
    root = home / "skills"
    with _profile_scope(profile):
        if (Path(get_hermes_home()).resolve() != home or root.resolve() != root
                or not (home / "config.yaml").resolve().is_relative_to(home)):
            raise ValueError("当前 Profile 的技能目录无法验证。")
        for path in (".hub", ".hub/lock.json", ".hub/quarantine", ".hub/scan-cache", ".usage.json"):
            if not (root / path).resolve().is_relative_to(root):
                raise ValueError("当前 Profile 的技能状态目录无法验证。")

    if action in {"catalog", "install"}:
        catalog = (await skills.list_official_skills(profile))["skills"]
        if action == "catalog":
            return [{key: row.get(key) for key in ("identifier", "name", "description", "category", "installed")}
                    for row in catalog]
        row = next((row for row in catalog if row["identifier"] == name), None)
        if not row:
            raise ValueError("这个技能不在当前版本的官方目录中。")
        if not row["installed"]:
            target = root.joinpath(*name.split("/")[1:])
            if target.exists() or target.is_symlink():
                raise ValueError("目标位置已有技能文件，请先在 AIWATA 中处理同名内容。")
            from hermes_cli.skills_hub import do_install

            with _profile_scope(profile):
                installed = do_install(name, skip_confirm=True, source_id="official")
            if not installed:
                raise ValueError("AIWATA 未安装该技能。请检查是否有同名技能或原生安装校验失败。")
        return {"ok": True}

    if action == "create":
        from agent.skill_utils import get_skill_create_dir

        with _profile_scope(profile):
            configured = get_skill_create_dir()
            if configured and not configured.resolve().is_relative_to(root):
                raise ValueError("请先将技能创建目录设为当前 Profile 的技能目录。")
        await skills.create_skill(SkillCreate(name=name, content=request["content"]), profile)
        return {"ok": True}

    with _profile_scope(profile):
        paths = local_catalog(root)
    records = [row for row in await skills.get_skills(profile) if row["name"] in paths]
    if action == "list":
        return records

    record = next((row for row in records if row["name"] == name), None)
    if record is None:
        raise ValueError("当前 Profile 没有此技能。")
    path = paths[name]
    if action == "toggle":
        return await skills.toggle_skill(SkillToggle(name=name, enabled=request["value"]), profile)

    if action == "content":
        content = path.read_text(encoding="utf-8-sig")
        return {"content": content, "revision": content_revision(content)}

    with _profile_scope(profile):
        require_matching_skill(name, path)
    if action == "lock":
        return await skills.lock_skill(SkillLock(name=name, locked=request["value"]), profile)
    if action == "edit":
        if record["provenance"] != "agent":
            raise ValueError("此来源的技能内容在工作台中只读。")
        if request["revision"] != content_revision(path.read_text(encoding="utf-8-sig")):
            raise ValueError("技能已在别处修改，请关闭后重新打开。")
        await skills.update_skill_content(SkillContentUpdate(name=name, content=request["content"]), profile)
        return {"ok": True}
    if action == "remove":
        if record["locked"]:
            raise ValueError("请先解除技能锁定。")
        with _profile_scope(profile):
            if record["provenance"] == "hub":
                from tools.skills_hub import HubLockFile
                from tools.skills_hub_install import _resolve_lock_install_path
                from hermes_cli.skills_hub import do_uninstall

                entry = HubLockFile().get_installed(path.parent.name)
                if not entry or _resolve_lock_install_path(entry["install_path"], path.parent.name) != path.parent:
                    raise ValueError("无法验证此技能的安装记录。")
                if not do_uninstall(path.parent.name, skip_confirm=True):
                    raise ValueError("AIWATA 未卸载此技能。")
            elif record["provenance"] == "agent":
                from tools.skill_manager_tool import _delete_skill

                result = _delete_skill(name)
                if not result.get("success"):
                    raise ValueError(result["error"])
                skills._clear_skills_prompt_cache()
            else:
                raise ValueError("此来源的技能由 AIWATA 管理。")
        return {"ok": True}
    raise ValueError("无法识别技能操作。")


if __name__ == "__main__":
    try:
        with contextlib.redirect_stdout(sys.stderr):
            result = asyncio.run(handle(json.load(sys.stdin)))
        payload = {"result": result}
    except HTTPException as exc:
        payload = {"error": exc.detail if isinstance(exc.detail, str) else "AIWATA 无法完成此技能操作。"}
    except (ValueError, OSError) as exc:
        payload = {"error": str(exc)}
    print(json.dumps(payload, ensure_ascii=False))
