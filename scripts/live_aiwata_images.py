"""Use AIWATA's configured image provider from the account's sandbox."""

import contextlib
import json
from pathlib import Path
import sys

from hermes_constants import get_hermes_home
from tools.image_generation_tool import (
    _active_image_capabilities, _handle_image_generate, check_image_generation_requirements,
)
from tui_gateway.methods_images import _image_to_data_url


def handle(request):
    available = bool(check_image_generation_requirements())
    caps = _active_image_capabilities() if available else {}
    editable = "image" in caps.get("modalities", ()) and caps.get("source_image_role") != "style"
    status = {"available": available, "editable": editable}
    if request["action"] == "edit-status" or not editable:
        return status
    result = json.loads(_handle_image_generate({
        "prompt": request["prompt"],
        "aspect_ratio": request["aspect_ratio"],
        "image_url": request["source"],
    }))
    if not result.get("success"):
        return {**status, "success": False}
    image = result.get("image")
    if not isinstance(image, str) or not image:
        return {**status, "success": True}
    if not image.startswith(("http://", "https://")):
        path = Path(image).resolve()
        if not path.is_relative_to(get_hermes_home().resolve()):
            return {**status, "success": True}
        image = str(path)
    return {**status, "success": True, "image_data": _image_to_data_url(image, request["max_bytes"])}


if __name__ == "__main__":
    try:
        with contextlib.redirect_stdout(sys.stderr):
            payload = {"result": handle(json.load(sys.stdin))}
    except Exception:
        payload = {"error": "无法调用当前 AIWATA 工作区的图像编辑服务。"}
    print(json.dumps(payload, ensure_ascii=False))
