"""Run with the installed AIWATA Python runtime. Uses synthetic credentials only."""

import os
from pathlib import Path
import runpy
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

from agent.secret_scope import build_profile_secret_scope, reset_secret_scope, set_secret_scope
from agent.secret_sources.registry import _reset_registry_for_tests
from hermes_cli.config_backend import read_config_doc_readonly, write_config_key
from hermes_cli.env_loader import (
    _apply_external_secret_sources, get_secret_source_values,
    hydrate_profile_secret_sources, reset_secret_source_cache,
)
from tools.environments.local import _sanitize_subprocess_env

model_scope = runpy.run_path(str(Path(__file__).resolve().parents[1] / "scripts/live_aiwata_model_scope.py"))


class WorkbenchModelScopeTests(unittest.TestCase):
    def setUp(self):
        _reset_registry_for_tests()
        self.directory = TemporaryDirectory(prefix="aiwata-model-scope-")
        self.root = Path(self.directory.name).resolve()
        self.account = self.root / "lin/runtime"
        self.writer = self.account / "profiles/writer"
        self.writer.mkdir(parents=True)
        for home in (self.account, self.writer):
            (home / "config.yaml").write_text("_config_version: 12\n")
            model_scope["prepare_profile"](self.account, home)
        model_scope["register_models"](self.account, {
            "GLM_API_KEY": "workspace-model-fixture",
            "TELEGRAM_BOT_TOKEN": "channel-fixture-must-not-propagate",
        })

    def tearDown(self):
        for home in (self.account, self.writer):
            reset_secret_source_cache(home)
        _reset_registry_for_tests()
        self.directory.cleanup()

    def scope(self, home):
        hydrate_profile_secret_sources(home)
        return build_profile_secret_scope(home)

    def test_default_and_named_profiles_receive_model_without_persisting_it(self):
        for home in (self.account, self.writer):
            self.assertEqual(self.scope(home).get("GLM_API_KEY"), "workspace-model-fixture")
            self.assertNotIn("TELEGRAM_BOT_TOKEN", self.scope(home))
            self.assertFalse((home / ".env").exists())
            self.assertNotIn("workspace-model-fixture", (home / "config.yaml").read_text())

    def test_profile_provider_alias_takes_priority_as_one_credential_family(self):
        (self.writer / ".env").write_text("ZAI_API_KEY=own-model-fixture\n")
        scope = self.scope(self.writer)
        self.assertEqual(scope.get("ZAI_API_KEY"), "own-model-fixture")
        self.assertNotIn("GLM_API_KEY", scope)

    def test_model_preparation_preserves_native_tool_loading_and_desktop_hints(self):
        config = self.writer / "config.yaml"
        write_config_key(config, "tools.tool_search.defer", ["custom_tool", "drive_preview", "desktop_preview", "computer_use"])
        write_config_key(config, "platform_hints.desktop", {"replace": "My desktop", "append": "My instruction"})
        before = read_config_doc_readonly(config)
        model_scope["prepare_profile"](self.account, self.writer)
        after = read_config_doc_readonly(config)
        self.assertEqual(after["tools"], before["tools"])
        self.assertEqual(after["platform_hints"], before["platform_hints"])

    def test_model_preparation_never_changes_computer_provider_or_placement(self):
        config = self.writer / "config.yaml"
        write_config_key(config, "computer_use.backend", "cua")
        write_config_key(config, "bot_desktop.placement", "gateway")
        before = read_config_doc_readonly(config)
        model_scope["prepare_profile"](self.account, self.writer)
        after = read_config_doc_readonly(config)
        self.assertEqual(after["computer_use"], before["computer_use"])
        self.assertEqual(after["bot_desktop"], before["bot_desktop"])
        self.assertNotIn("workbench_socket", after["computer_use"])

    def test_gateway_plugin_refresh_retains_the_launch_profiles_model_snapshot(self):
        with patch.dict(os.environ):
            _apply_external_secret_sources(self.account)
            self.assertEqual(get_secret_source_values(self.account).get("GLM_API_KEY"), "workspace-model-fixture")
            reset_secret_source_cache(self.account)
            _apply_external_secret_sources(self.account)
            self.assertEqual(self.scope(self.account).get("GLM_API_KEY"), "workspace-model-fixture")

    def test_reporting_an_existing_alias_does_not_add_a_second_alias(self):
        source = model_scope["WorkbenchModels"](self.account, {
            "GLM_API_KEY": "workspace-model-fixture", "ZAI_API_KEY": "same-as-profile",
        })
        with patch.dict(os.environ, {"ZAI_API_KEY": "same-as-profile"}):
            self.assertEqual(source.fetch({}, self.account).secrets, {"ZAI_API_KEY": "same-as-profile"})

    def test_foreign_and_symlinked_homes_receive_no_model_authorization(self):
        other = self.root / "qiao/runtime"
        other.mkdir(parents=True)
        link = self.account / "profiles/linked"
        link.symlink_to(other, target_is_directory=True)
        source = model_scope["WorkbenchModels"](self.account, {"GLM_API_KEY": "workspace-model-fixture"})
        for home in (other, link):
            self.assertEqual(source.fetch({}, home).secrets, {})
            with self.assertRaises(ValueError):
                model_scope["prepare_profile"](self.account, home)

    def test_preparing_profile_preserves_explicit_model_source_opt_out(self):
        config = self.writer / "config.yaml"
        write_config_key(config, "secrets.aiwata_workbench.enabled", False)
        model_scope["prepare_profile"](self.account, self.writer)
        self.assertIs(read_config_doc_readonly(config)["secrets"]["aiwata_workbench"]["enabled"], False)
        self.assertNotIn("GLM_API_KEY", self.scope(self.writer))

    def test_native_terminal_environment_drops_profile_model_keys(self):
        token = set_secret_scope(self.scope(self.writer), profile_home=str(self.writer))
        try:
            env = _sanitize_subprocess_env(base_env={"GLM_API_KEY": "workspace-model-fixture", "PATH": "/usr/bin:/bin"})
            self.assertTrue(all(key not in env for key in model_scope["MODEL_KEYS"]))
        finally:
            reset_secret_scope(token)


if __name__ == "__main__":
    unittest.main(argv=[__file__])
