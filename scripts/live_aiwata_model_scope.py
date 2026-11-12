"""Prepare account-scoped workbench models and the embedded browser tool surface."""

import contextlib
import io
import json
import os
from pathlib import Path
import runpy
import sys

from agent.secret_sources.base import FetchResult, SecretSource, get_source_environment
from agent.secret_sources.registry import list_sources, register_source
from hermes_constants import get_hermes_home

SOURCE = "aiwata_workbench"
MODEL_KEYS = ("GLM_API_KEY", "ZAI_API_KEY", "Z_AI_API_KEY")


def owned_profile(account, home):
    home = Path(home)
    return home.resolve() == home and (
        home == account or (home.parent == account / "profiles" and home.is_dir())
    )


class WorkbenchModels(SecretSource):
    name = SOURCE
    label = "AIWATA 工作区模型"
    shape = "bulk"

    def __init__(self, account, credentials):
        self.account = account
        self.credentials = {
            key: value for key, value in credentials.items()
            if key in MODEL_KEYS and isinstance(value, str) and value.strip()
        }

    def fetch(self, cfg, home_path):
        if not owned_profile(self.account, home_path):
            return FetchResult()
        environ = get_source_environment()
        existing = {key: environ[key] for key in MODEL_KEYS if environ.get(key)}
        if not existing:
            return FetchResult(secrets=dict(self.credentials))
        # Profile-specific aliases take priority together. During native plugin refresh,
        # report the workbench aliases already present so the profile snapshot retains them.
        if any(self.credentials.get(key) != value for key, value in existing.items()):
            return FetchResult()
        return FetchResult(secrets=existing)


def prepare_profile(account, home):
    from hermes_cli.config_backend import read_config_doc_readonly, write_config_key

    if not owned_profile(account, home):
        raise ValueError("模型授权只能用于当前账号的 Profile。")
    config = home / "config.yaml"
    if config.resolve() != config or (config.exists() and (
        not config.is_file() or config.stat().st_nlink != 1
    )):
        raise ValueError("Profile 的模型配置必须是独立文件。")
    document = read_config_doc_readonly(config) or {}
    if not isinstance(document, dict):
        raise ValueError("Profile 的配置格式无效。")
    sources = document.get("secrets") or {}
    if not isinstance(sources, dict):
        raise ValueError("Profile 的凭据来源配置格式无效。")
    if SOURCE not in sources:
        write_config_key(config, f"secrets.{SOURCE}.enabled", True)


def register_models(account, credentials):
    # Bundled and existing sources retain their earlier fallback priority.
    list_sources()
    if not register_source(WorkbenchModels(account, credentials)):
        raise RuntimeError("无法注册工作区模型授权。")


def main():
    account = get_hermes_home().resolve()
    if "--gateway" in sys.argv or "--companion" in sys.argv:
        payload = json.load(sys.stdin)
        sys.stdin.close()
        register_models(account, payload.pop("credentials"))
        if "--gateway" in sys.argv:
            prepare_profile(account, account)
            profiles = account / "profiles"
            if profiles.is_dir():
                for home in profiles.iterdir():
                    if home.is_dir() and not home.is_symlink():
                        prepare_profile(account, home)
            sys.stdin = open(os.devnull)
            sys.argv = ["aiwata", "--profile", "default", "gateway", "run", "--quiet", "--idle-exit"]
            runpy.run_module("hermes_cli.main", run_name="__main__", alter_sys=True)
        else:
            companion = sys.argv[sys.argv.index("--companion") + 1]
            sys.stdin = io.StringIO(json.dumps(payload["request"]))
            sys.argv = [companion]
            runpy.run_path(companion, run_name="__main__")
        return
    try:
        with contextlib.redirect_stdout(sys.stderr):
            request = json.load(sys.stdin)
            prepare_profile(account, Path(request["profileHome"]))
        result = {"result": {"ok": True}}
    except (OSError, ValueError, RuntimeError):
        result = {"error": "无法准备当前 Bot 的工作区模型授权。"}
    print(json.dumps(result))


if __name__ == "__main__":
    main()
