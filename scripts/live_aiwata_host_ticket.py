"""Mint a native ticket only after identifying the managed account gateway."""

import contextlib
import importlib
import json
from pathlib import Path
import sys

from gateway.control_socket import (
    pause_gateway_for_update,
    query_gateway_control,
    request_serve_profile_hot,
    rescan_gateway_profiles,
)
from hermes_constants import get_hermes_home, reset_hermes_home_override, set_hermes_home_override
from hermes_cli.gateway_runtime import control_home_for, discover_gateway_endpoint
from hermes_cli.gateway_runtime_discovery import query_identify


def identify(home):
    discovery = discover_gateway_endpoint(home, timeout=1.5)
    if discovery.state != "ready":
        return {"state": discovery.state}
    endpoint = discovery.endpoint
    owner = Path(control_home_for(home, endpoint)).resolve()
    identity = query_identify(owner, timeout=1.5)
    return {"state": "ready", "ownerHome": str(owner), "ownerPid": identity.get("pid"),
            "instance": endpoint.instance_id, "origin": endpoint.api_origin}


def reload_gateway(account, profile, owned):
    name = profile.name if profile != account else None
    if name:
        selected = identify(profile)
        if selected["state"] != "absent" and (
            selected.get("ownerHome") != str(account) or selected.get("ownerPid") != owned["ownerPid"]
        ):
            raise ValueError("无法确认所选 Bot 由当前账号的原生网关管理。")
    work = query_gateway_control(account, "active-work", params={"profile": name} if name else None, timeout=6)
    if (not work or work.get("pid") != owned["ownerPid"] or work.get("active_agents") != 0
            or work.get("active_work") != [] or (name and work.get("profile") != name)):
        raise ValueError("网关有任务正在运行或状态无法确认，请稍后再应用配置。")
    if name:
        result = rescan_gateway_profiles(account)
        if result and result.get("pending"):
            raise ValueError("Bot 网关正在加载配置，请稍后再试。")
        if not result or name not in result.get("served_profiles", []):
            raise ValueError("网关未确认加载此 Bot 的配置。")
        selected = identify(profile)
        if selected.get("ownerHome") != str(account) or selected.get("ownerPid") != owned["ownerPid"]:
            raise ValueError("无法确认所选 Bot 的网关已就绪。")
    else:
        ack = pause_gateway_for_update(account, timeout=6)
        if not ack or ack.get("pid") != owned["ownerPid"] or ack.get("pausing") is not True:
            raise ValueError("网关未确认重新加载，请稍后重试。")
    return {**owned, "reloaded": True}


def handle(request):
    account = get_hermes_home().resolve()
    profile = Path(request["profileHome"]).resolve()
    if profile != account and profile.parent != account / "profiles":
        return {"state": "foreign"}
    owned = identify(account)
    if owned["state"] != "ready" or ("expectedPid" not in request and not request.get("nativeHttp")):
        return owned
    if owned.get("ownerHome") != str(account) or ("expectedPid" in request and owned.get("ownerPid") != request["expectedPid"]):
        return {"state": "foreign"}
    if request.get("reload"):
        return reload_gateway(account, profile, owned)
    if not request.get("ticket") and not request.get("serve") and not request.get("nativeHttp"):
        return owned
    selected = identify(profile) if profile != account else owned
    if selected["state"] == "absent" and profile != account:
        rescan_gateway_profiles(account)
        selected = identify(profile)
    if selected["state"] == "absent" and profile != account:
        request_serve_profile_hot(account, profile.name)
        selected = identify(profile)
    if selected.get("ownerHome") != str(account) or selected.get("ownerPid") != owned["ownerPid"]:
        return {"state": "foreign"}
    if request.get("serve"):
        return {**owned, "served": True}
    if request.get("nativeHttp"):
        grant = query_gateway_control(account, "session-ticket", params={
            "profile_id": str(profile), "instance_id": selected["instance"], "purpose": "native-http"}, timeout=5)
        if (not grant or grant.get("profile_id") != str(profile)
                or grant.get("instance_id") != selected["instance"] or not isinstance(grant.get("ticket"), str)):
            raise ValueError("原生接口授权未确认当前账号与 Profile。")
        return {**owned, "target": {"origin": selected["origin"], "ticket": grant["ticket"]}}
    # AIWATA's own bootstrap mints the WebSocket ticket without starting anything.
    token = set_hermes_home_override(profile)
    try:
        bootstrap = importlib.import_module("ui-tui.scripts.gateway_bootstrap")
        target = bootstrap.bootstrap(False)
    finally:
        reset_hermes_home_override(token)
    if target.get("instance_id") != selected["instance"]:
        return {"state": "foreign"}
    return {**owned, "target": target}


if __name__ == "__main__":
    try:
        with contextlib.redirect_stdout(sys.stderr):
            payload = {"result": handle(json.load(sys.stdin))}
    except ValueError as exc:
        payload = {"error": str(exc)}
    except (OSError, RuntimeError):
        payload = {"error": "无法确认当前账号的原生网关身份。"}
    print(json.dumps(payload))
