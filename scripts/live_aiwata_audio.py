"""Bridge workbench dictation to the native AIWATA audio router."""

import asyncio
import contextlib
import json
from pathlib import Path
import sys
import tempfile

from fastapi import HTTPException
from hermes_cli.web_models import AudioTranscriptionRequest
from hermes_cli.web_routers.audio import transcribe_audio_upload
from hermes_cli.web_server_profiles import _config_profile_scope
from hermes_constants import get_hermes_home
from tools.transcription_tools import _get_provider, _load_stt_config, is_stt_enabled


class VoiceUnavailable(ValueError):
    pass


def voice_status(profile, home):
    if any(not (home / name).resolve().is_relative_to(home) for name in ("config.yaml", ".env")):
        raise VoiceUnavailable("无法验证当前语音 Profile 的配置位置。")
    with _config_profile_scope(profile):
        if Path(get_hermes_home()).resolve() != home:
            raise VoiceUnavailable("无法验证当前语音 Profile。")
        config = _load_stt_config()
        if not is_stt_enabled(config):
            return {"available": False, "message": "当前 AIWATA Profile 已关闭语音转写。"}
        provider = _get_provider(config)
        if provider == "none":
            return {"available": False, "message": "当前 AIWATA Profile 没有可用的语音转写提供方。"}
        return {"available": True}


async def handle(request):
    profile = request["profile"]
    status = voice_status(profile, Path(request["profileHome"]))
    if request["action"] == "status":
        return status
    if not status["available"]:
        raise VoiceUnavailable(status["message"])
    tempfile.tempdir = request["temporary"]
    mime = request["mimeType"]
    audio = AudioTranscriptionRequest(
        data_url=f"data:{mime};base64,{request['dataBase64']}", mime_type=mime)
    try:
        result = await transcribe_audio_upload(audio, profile)
    except HTTPException as error:
        raise VoiceUnavailable("AIWATA 未能转写这段录音，请检查语音配置或重试。") from error
    return {"transcript": result["transcript"]}


if __name__ == "__main__":
    try:
        with contextlib.redirect_stdout(sys.stderr):
            result = {"result": asyncio.run(handle(json.load(sys.stdin)))}
    except VoiceUnavailable as error:
        result = {"error": str(error)}
    except (ValueError, OSError, HTTPException, RuntimeError):
        result = {"error": "无法读取当前 AIWATA Profile 的语音转写服务。"}
    print(json.dumps(result, ensure_ascii=False))
