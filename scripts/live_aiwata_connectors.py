"""Profile-scoped connection configuration and checks using the native messaging API."""

import asyncio
import contextlib
from dataclasses import asdict
import json
import os
from pathlib import Path
import re
import sys
import time
from urllib.parse import urlsplit

from fastapi import HTTPException
from hermes_cli.config import load_env
from hermes_cli.gateway_runtime_discovery import query_identify
from hermes_cli.web_models import MessagingPlatformUpdate, PairingApprove, PairingRevoke, TelegramOnboardingStart
from hermes_cli.web_routers import messaging, messaging_relay, ops
from hermes_cli.web_server_profiles import _config_profile_scope, _profile_scope
from hermes_constants import get_hermes_home
from utils import atomic_json_write

PLATFORMS = ("weixin", "telegram", "discord", "slack", "email")
CODE = re.compile(r"[a-z0-9_-]{1,60}")


def safe_code(value):
    return value if isinstance(value, str) and CODE.fullmatch(value) else None


def verify_home(home):
    if Path(get_hermes_home()).resolve() != home:
        raise ValueError("无法验证当前 Profile。")
    paths = [".env", "config.yaml", "gateway.pid", "gateway_state.json", ".aiwata-app"]
    for directory in ("pairing", "platforms/pairing"):
        paths.append(directory)
        paths.extend(f"{directory}/{name}" for name in (".lock", "_rate_limits.json", "_declined.json"))
        paths.extend(str(path.relative_to(home)) for path in (home / directory).glob("*.json"))
    paths += [f".aiwata-app/connector-{platform}.json" for platform in PLATFORMS]
    if any((home / path).resolve() != home / path for path in paths):
        raise ValueError("当前 Profile 的连接器配置或状态文件指向其他位置。")


def project_platform(row):
    return {
        "id": row["id"], "state": safe_code(row["state"]), "errorCode": safe_code(row.get("error_code")),
        "enabled": bool(row["enabled"]), "configured": bool(row["configured"]),
        "running": bool(row["gateway_running"]), "relay": bool(row.get("relay_exclusive")),
        "relayFronted": bool(row.get("relay_fronted")),
        "fields": [{
            "key": field["key"], "label": field["prompt"], "required": bool(field["required"]),
            "isSet": bool(field["is_set"]), "secret": bool(field["is_password"]),
            "value": field.get("value") if field["is_list"] else None,
        } for field in row["env_vars"]],
    }


def project_pairing(row, fields):
    return {key: row.get(key) for key in ("platform", "user_id", "user_name", *fields)}


def log_path(home, platform):
    return home / ".aiwata-app" / f"connector-{platform}.json"


def state_file(home, platform):
    try:
        data = json.loads(log_path(home, platform).read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        data = {}
    if isinstance(data, list):
        return {"logs": data}
    return data if isinstance(data, dict) else {}


def logs(state):
    data = state.get("logs")
    if not isinstance(data, list):
        return []
    return [{
        "state": safe_code(row.get("state")), "authPosture": safe_code(row.get("authPosture")),
        "ok": row.get("ok") is True, "time": row["time"],
    } for row in data[:30] if isinstance(row, dict) and type(row.get("time")) in (int, float)]


def save_state(home, platform, state):
    atomic_json_write(log_path(home, platform), state, mode=0o600)


def relay_url(value, platform=None):
    if not isinstance(value, str) or not value or len(value) > 2048 or re.search(r"[\s\x00-\x1f\x7f]", value):
        return None
    try:
        url = urlsplit(value)
        if url.scheme != "https" or not url.hostname or url.username or url.password:
            return None
        if platform == "telegram" and (url.netloc != "t.me" or not re.fullmatch(r"/[a-zA-Z0-9_]+", url.path)):
            return None
        if platform == "discord" and (url.netloc != "discord.com" or not re.fullmatch(r"/users/[0-9]+", url.path)):
            return None
        if platform and (platform not in {"telegram", "discord"} or url.query or url.fragment):
            return None
        return value
    except ValueError:
        return None


def relay_platform_view(data, platform):
    row = next((row for row in data["platforms"] if row["platform"] == platform), None)
    if row is None:
        raise ValueError("此账号的 Team Gateway 未提供这个平台。")
    accounts = []
    for account in row.get("accounts") or []:
        if not isinstance(account, dict):
            continue
        user_id = account.get("platformUserId")
        if not isinstance(user_id, str) or not user_id or len(user_id) > 255 or re.search(r"[\x00-\x1f\x7f]", user_id):
            continue
        accounts.append({"id": user_id, **{key: value[:160] for key in ("displayName", "handle")
                                           if isinstance(value := account.get(key), str)}})
    managed = data.get("managed_by")
    return {"managedBy": managed if managed in {"portal", "connector"} else "unknown",
            "portalUrl": relay_url(data.get("portal_url")) if managed == "portal" else None,
            "botUrl": relay_url(row.get("bot_url"), platform), "accounts": accounts}


async def relay_setup(request, home):
    action, platform = request["action"], request["platform"]
    channels, _ = messaging._relay_channel_view(home)
    if request["profile"] != "default" or platform not in channels:
        raise ValueError("此账号的 Team Gateway 未提供这个平台。")
    try:
        identity = await asyncio.to_thread(query_identify, home, timeout=2.0)
    except (OSError, RuntimeError, ValueError):
        raise ValueError("当前账号的网关未就绪，无法连接 Team Gateway。") from None
    pid = request.get("expectedPid")
    if identity.get("hermes_home") != str(home) or (pid is not None and identity.get("pid") != pid):
        raise ValueError("无法确认 Team Gateway 由当前账号的网关管理。")
    try:
        if action == "relayStart":
            data = await messaging_relay.request_relay_link(platform)
            code = data.get("code")
            if data.get("platform") != platform or not isinstance(code, str) or not re.fullmatch(r"[a-zA-Z0-9_-]{3,128}", code):
                raise ValueError("Team Gateway 返回了无效的绑定命令。")
            return {"code": code, "command": "/link " + code, "expiresAt": data.get("expires_at"),
                    "botUrl": relay_url(data.get("bot_url"), platform)}
        if action == "relayStatus":
            data = await messaging_relay.get_relay_link_state(request["code"])
            state = data.get("state")
            if state not in {"pending", "inactive", "refused"}:
                raise ValueError("Team Gateway 返回了未知的绑定状态。")
            return {"state": state}
        view = relay_platform_view(await messaging_relay.get_relay_links(), platform)
        if action == "relayRead":
            return view
        if view["managedBy"] != "connector" or not any(row["id"] == request["id"] for row in view["accounts"]):
            raise ValueError("此账号当前无法从工作台解除绑定。请刷新状态后再试。")
        result = await messaging_relay.unlink_relay_account(platform, request["id"])
        return {"unlinked": result.get("unlinked") is True}
    except HTTPException as exc:
        code = exc.detail.get("code") if isinstance(exc.detail, dict) else None
        message = {"managed_by_portal": "请在 Portal 中管理此账号的消息平台绑定。",
                   "relay_not_provisioned": "Team Gateway 尚未完成配置，请稍后重试。",
                   "relay_not_authorized": "Team Gateway 未接受当前网关的授权，请重新连接网关。"}
        raise ValueError(message.get(code, "Team Gateway 暂时无法完成此操作，请稍后重试。")) from None


async def telegram_onboarding(request, home, profile):
    action = request["action"]
    if action in {"telegramStart", "telegramApply"}:
        channels, exclusive = messaging._relay_channel_view(home)
        if exclusive and "telegram" in channels:
            raise ValueError("此 Profile 的 Telegram 由 Team Gateway 管理。")
    if action == "telegramStart":
        setup = await messaging.start_telegram_onboarding(TelegramOnboardingStart())
        native_id = setup["pairing_id"]
        with messaging._telegram_onboarding_lock:
            record = asdict(messaging._telegram_record_or_404(native_id))
        return {"pairing": {"id": native_id, **record}, "deepLink": setup["deep_link"], "expiresAt": setup["expires_at"]}

    device, inode, _ = request["identity"].split(":")
    current = home.stat()
    if (str(current.st_dev), str(current.st_ino)) != (device, inode):
        raise ValueError("当前 Profile 已变化，请重新开始配对。")
    pairing = dict(request["pairing"])
    native_id = pairing.pop("id")
    record = messaging._TelegramOnboardingPairing(**pairing)
    if record.expires_at_ts <= time.time():
        if action == "telegramStatus":
            return {"status": "expired"}
        raise ValueError("Telegram 配对已过期，请重新生成二维码。")
    if action == "telegramStatus":
        with messaging._telegram_onboarding_lock:
            messaging._telegram_onboarding_pairings[native_id] = record
        try:
            status = await messaging.get_telegram_onboarding_status(native_id)
        except HTTPException as exc:
            if exc.status_code in {404, 410}:
                return {"status": "expired"}
            raise
        if status["status"] != "ready":
            return {"status": "waiting"}
        return {"status": "ready", "username": status["bot_username"], "ownerId": status["owner_user_id"],
                "pairing": {"id": native_id, **asdict(record)}}

    if not record.bot_token:
        raise ValueError("请先完成 Telegram 扫码确认。")
    # Use the native platform write so the managed gateway lifecycle stays with the existing Apply action.
    body = MessagingPlatformUpdate(enabled=True, env={
        "TELEGRAM_BOT_TOKEN": record.bot_token,
        "TELEGRAM_ALLOWED_USERS": ",".join(request["allowedUserIds"]),
    })
    result = await messaging.update_messaging_platform("telegram", body, profile)
    save_state(home, "telegram", {**state_file(home, "telegram"), "needsApply": not result.get("hot_served")})
    return result


async def apply_configuration(home, account, profile):
    from gateway.control_socket import pause_gateway_for_update, request_serve_profile_hot, request_unserve_profile
    from hermes_cli.gateway_lifecycle_guards import live_work
    from hermes_cli.gateway_runtime import control_home_for, discover_gateway_endpoint, ensure_gateway_runtime

    verdict = await asyncio.to_thread(discover_gateway_endpoint, home)
    if verdict.state == "ready" and verdict.endpoint:
        owner = control_home_for(home, verdict.endpoint).resolve()
        if owner not in {home, account} or verdict.endpoint.profile_id != str(home):
            raise ValueError("无法确认网关由当前工作区管理。")
        scoped_profile = profile if owner != home else None
        work = await asyncio.to_thread(live_work, owner, scoped_profile)
        if work is None or work.get("active_work") or work.get("active_agents"):
            raise ValueError("网关有任务正在运行或状态无法确认，请稍后再应用配置。")
        if scoped_profile:
            removed = await asyncio.to_thread(request_unserve_profile, owner, profile)
            if not removed or removed.get("unserved") != profile:
                raise ValueError("网关未确认暂停所选 Profile 的连接。")
            started = await asyncio.to_thread(request_serve_profile_hot, owner, profile)
            if not started or started.get("served") != profile:
                raise ValueError("网关暂未恢复此 Profile，请稍后刷新状态。")
            return {"ok": True}
        if verdict.endpoint.supervisor != "none":
            raise ValueError("此网关由宿主管理，请在 AIWATA 中重启后应用配置。")
        ack = await asyncio.to_thread(pause_gateway_for_update, owner)
        if not ack or not ack.get("pausing"):
            raise ValueError("网关未确认重新加载，请稍后重试。")
        instance = verdict.endpoint.instance_id
        for _ in range(65):
            await asyncio.sleep(0.4)
            current = await asyncio.to_thread(discover_gateway_endpoint, home, timeout=0.4)
            if current.state == "absent":
                break
            if current.state == "ready" and current.endpoint and current.endpoint.instance_id != instance:
                return {"ok": True}
        else:
            raise ValueError("网关还在退出。工作台会尝试重新连接，请稍后刷新。")
    elif verdict.state != "absent":
        raise ValueError("当前网关暂不可重载，请稍后重试。")
    current = await asyncio.to_thread(ensure_gateway_runtime, home, timeout=25, idle_exit=True)
    if current.state != "ready" or not current.endpoint or current.endpoint.profile_id != str(home):
        raise ValueError("网关尚未就绪，请稍后刷新。")
    return {"ok": True}


async def handle(request):
    action, profile = request["action"], request["profile"]
    home = Path(request["profileHome"])
    with _profile_scope(profile):
        verify_home(home)
        if profile == "default":
            env = load_env()
            for key in ("GATEWAY_RELAY_URL", "GATEWAY_RELAY_PLATFORMS", "GATEWAY_RELAY_ALLOW_DIRECT_PLATFORMS"):
                if key in env:
                    os.environ[key] = env[key]
    if action.startswith("relay"):
        return await relay_setup(request, home)
    if action in {"telegramStart", "telegramStatus", "telegramApply"}:
        return await telegram_onboarding(request, home, profile)
    platform = request.get("platform")
    if action == "read":
        data, pairing = await asyncio.gather(messaging.get_messaging_platforms(profile), ops.list_pairing(profile))
        by_id = {row["id"]: row for row in data["platforms"]}
        states = {id: state_file(home, id) for id in PLATFORMS}
        return {"platforms": [{
            **project_platform(by_id[id]), "logs": logs(states[id]), "needsApply": states[id].get("needsApply") is True,
            "pending": [project_pairing(row, ("request_id", "age_minutes")) for row in pairing["pending"] if row["platform"] == id],
            "approved": [project_pairing(row, ("approved_at",)) for row in pairing["approved"] if row["platform"] == id],
        } for id in PLATFORMS if id in by_id]}
    if action == "save":
        body = MessagingPlatformUpdate(enabled=request["enabled"], env=request["env"], clear_env=request["clear"])
        result = await messaging.update_messaging_platform(platform, body, profile)
        save_state(home, platform, {**state_file(home, platform), "needsApply": not result.get("hot_served")})
        return result
    if action == "test":
        result = await messaging.test_messaging_platform(platform, profile)
        row = {"ok": result["ok"], "state": safe_code(result.get("state")),
               "authPosture": safe_code(result.get("auth_posture")), "time": int(time.time() * 1000)}
        state = state_file(home, platform)
        save_state(home, platform, {**state, "logs": [row, *logs(state)][:30]})
        return row
    if action in {"approve", "revoke"}:
        # PairingStore scopes the grants by name. Its allowlist mirror resolves
        # the active config/secret scope, which must follow the same Profile.
        with _config_profile_scope(profile):
            if action == "approve":
                await ops.approve_pairing(PairingApprove(profile=profile, platform=platform, request_id=request["id"]))
            else:
                await ops.revoke_pairing(PairingRevoke(profile=profile, platform=platform, user_id=request["id"]))
        hot_served = await asyncio.to_thread(messaging._notify_multiplexer_hot_serve, profile)
        if not hot_served:
            save_state(home, platform, {**state_file(home, platform), "needsApply": True})
        return {"ok": True}
    result = {"ok": True} if request.get("managedApplyComplete") else await apply_configuration(
        home, Path(request["accountHome"]), profile)
    for id in PLATFORMS:
        state = state_file(home, id)
        if state.get("needsApply"):
            save_state(home, id, {**state, "needsApply": False})
    return result


if __name__ == "__main__":
    try:
        with contextlib.redirect_stdout(sys.stderr):
            result = asyncio.run(handle(json.load(sys.stdin)))
        payload = {"result": result}
    except HTTPException as exc:
        payload = {"error": exc.detail if isinstance(exc.detail, str) else "AIWATA 无法完成连接器操作。"}
    except (ValueError, OSError) as exc:
        payload = {"error": str(exc)}
    print(json.dumps(payload, ensure_ascii=False))
