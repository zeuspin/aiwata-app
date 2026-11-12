"""Edit a public video through the account's configured AIWATA xAI tool."""

import base64
import contextlib
from ipaddress import ip_address
import json
import socket
import sys
from urllib.parse import urlsplit

from agent.provider_media import save_url
from tools.xai_video_tools import _check_xai_video_requirements, _handle_xai_video_edit


class VideoEditError(ValueError):
    pass


def is_public_https(value):
    url = urlsplit(value)
    if url.scheme != "https" or not url.hostname or url.username is not None or url.password is not None:
        return False
    try:
        addresses = [ip_address(address[4][0]) for address in
                     socket.getaddrinfo(url.hostname, url.port or 443, type=socket.SOCK_STREAM)]
        return bool(addresses) and all(address.is_global and not address.is_multicast for address in addresses)
    except (OSError, ValueError):
        return False


def handle(request):
    available = _check_xai_video_requirements()
    if request["action"] == "status" or not available:
        return {"available": available}
    if not is_public_https(request["source"]):
        raise VideoEditError("源视频地址无法解析为公开的 HTTPS 地址。")
    result = json.loads(_handle_xai_video_edit({"prompt": request["prompt"], "video_url": request["source"]}))
    if not result.get("success"):
        raise VideoEditError("AIWATA 视频编辑失败，请检查源视频和供应商状态。")
    url = result.get("video")
    if not isinstance(url, str) or not is_public_https(url):
        raise VideoEditError("AIWATA 未返回可下载的视频。")
    path = save_url("generated/workbench-video", url, prefix="edit", timeout=30, max_bytes=request["max_bytes"],
                    chunk_size=65536, content_types={"video/mp4": "mp4", "application/octet-stream": "mp4"},
                    url_extensions=("mp4",), default_extension="mp4", label="Video",
                    empty_error="Empty edited video", require_known_content_type=True)
    try:
        return {"available": True, "video": base64.b64encode(path.read_bytes()).decode("ascii")}
    finally:
        path.unlink(missing_ok=True)


if __name__ == "__main__":
    try:
        with contextlib.redirect_stdout(sys.stderr):
            payload = {"result": handle(json.load(sys.stdin))}
    except VideoEditError as error:
        payload = {"error": str(error)}
    except Exception:
        payload = {"error": "无法编辑或读取视频。请检查公开源视频、xAI 配置和 16 MiB 结果上限。"}
    print(json.dumps(payload, ensure_ascii=False))
