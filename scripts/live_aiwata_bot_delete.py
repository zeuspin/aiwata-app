"""Delete an isolated Bot Profile through AIWATA's desktop deletion path."""

import asyncio
import contextlib
import json
from pathlib import Path
import sys

from fastapi import HTTPException
from hermes_cli import profiles
from hermes_cli.web_routers.profiles import delete_profile_endpoint
from hermes_constants import get_hermes_home, reset_hermes_home_override, set_hermes_home_override


def check_host_bindings(profile, home):
    if profiles._find_our_wrapper(profile) is not None or profiles._s6_runtime_manager() is not None:
        raise ValueError("此名称关联本机共享入口，请在 AIWATA 中管理该档案。")
    token = set_hermes_home_override(home)
    try:
        from hermes_cli import gateway

        if sys.platform == "darwin":
            service_paths = [gateway.get_launchd_plist_path()]
        elif sys.platform == "win32":
            from hermes_cli import gateway_windows as windows

            if windows.is_task_registered():
                raise ValueError("此名称关联系统网关任务，请在 AIWATA 中管理该档案。")
            service_paths = [windows.get_startup_entry_path(), windows._legacy_startup_entry_path()]
        else:
            service = f"{gateway.get_service_name()}.service"
            service_paths = [gateway.user_systemd_unit_dir() / service, gateway._SYSTEM_UNIT_DIR / service]
        if any(path.exists() or path.is_symlink() for path in map(Path, service_paths)):
            raise ValueError("此名称关联系统网关服务，请在 AIWATA 中管理该档案。")
    finally:
        reset_hermes_home_override(token)

    pids = profiles._profile_bound_backend_pids(profile, home)
    if pids:
        import psutil

        for pid in pids:
            try:
                bound = psutil.Process(pid).environ().get("HERMES_HOME")
            except psutil.NoSuchProcess:
                continue
            except psutil.AccessDenied:
                bound = None
            if not bound or Path(bound).resolve() != home:
                raise ValueError("有同名网关进程的归属无法确认，删除已停止。")


def check_active_work(home, account, profile):
    from cron.jobs import list_jobs, use_cron_store
    from hermes_cli.gateway_lifecycle_guards import live_work
    from hermes_cli.gateway_runtime import control_home_for, discover_gateway_endpoint

    verdict = discover_gateway_endpoint(home)
    if verdict.state != "absent":
        if verdict.state != "ready" or not verdict.endpoint:
            raise ValueError("此 Bot 的网关状态正在变化，请稍后再试。")
        owner = control_home_for(home, verdict.endpoint).resolve()
        if owner not in {home, account} or verdict.endpoint.profile_id != str(home):
            raise ValueError("无法确认此 Bot 的网关归属。")
        work = live_work(owner, profile if owner != home else None)
        if work is None or work.get("active_agents") or work.get("active_work"):
            raise ValueError("此 Bot 有任务或会话正在运行，或网关未能确认空闲。")
    with use_cron_store(home):
        if any(job.get("live_execution") for job in list_jobs(include_disabled=True)):
            raise ValueError("此 Bot 有定时任务正在运行，请先停止。")


def cleanup_room_registration(profile, home):
    from hermes_cli.config import load_config, unset_config_value

    try:
        configured = (load_config().get("hosted_rooms") or {}).get("profiles") or {}
        if configured.get(profile) == str(home):
            unset_config_value(f"hosted_rooms.profiles.{profile}")
            updated = (load_config().get("hosted_rooms") or {}).get("profiles") or {}
            return profile not in updated
    except (Exception, SystemExit):
        return False
    return True


async def handle(request):
    profile = request["profile"]
    home = Path(request["path"])
    account = Path(get_hermes_home()).resolve()
    if (profiles.normalize_profile_name(profile) != profile or profile == "default" or
            profiles.get_profile_dir(profile) != home or home.resolve() != home or home.parent != account / "profiles"):
        raise ValueError("无法验证此 Bot 属于当前账号。")
    for path in (account / "config.yaml", home / "gateway.pid", home / "gateway_state.json"):
        if path.resolve() != path:
            raise ValueError("档案配置或网关状态指向其他位置，无法删除。")
    pid_path = home / "gateway.pid"
    if pid_path.exists():
        pid_record = json.loads(pid_path.read_text(encoding="utf-8-sig"))
        if not isinstance(pid_record, dict) or pid_record.get("hermes_home") != str(home):
            raise ValueError("无法验证此 Bot 的网关进程。")
    check_host_bindings(profile, home)
    check_active_work(home, account, profile)
    target = home.stat()
    if str(target.st_dev) != request["device"] or str(target.st_ino) != request["inode"]:
        raise ValueError("Bot 档案已变化，请刷新后再删除。")
    result = await delete_profile_endpoint(profile)
    if home.exists() or home.is_symlink():
        raise ValueError("AIWATA 尚未完成档案清理，请刷新状态后再试。")
    return {"ok": bool(result["ok"]), "settlementPending": bool(result.get("settlement_pending")),
            "registrationPending": not cleanup_room_registration(profile, home)}


if __name__ == "__main__":
    try:
        with contextlib.redirect_stdout(sys.stderr):
            result = asyncio.run(handle(json.load(sys.stdin)))
        payload = {"result": result}
    except HTTPException as exc:
        payload = {"error": exc.detail if isinstance(exc.detail, str) else "AIWATA 无法删除此 Bot。"}
    except (ValueError, OSError, RuntimeError) as exc:
        payload = {"error": str(exc)}
    print(json.dumps(payload, ensure_ascii=False))
