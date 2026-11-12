"""Reuse native path completion for a draft without creating a gateway session."""
import contextlib
import json
from pathlib import Path
import sys

try:
    request = json.load(sys.stdin)
    with contextlib.redirect_stdout(sys.stderr):
        from hermes_cli.web_server_profiles import _profile_scope
        from hermes_constants import get_hermes_home
        with _profile_scope(request['profile'] or 'default'):
            if Path(get_hermes_home()).resolve() != Path(request['profileHome']):
                raise ValueError('profile mismatch')
            from tui_gateway import server
            if request['method'] == 'complete.slash':
                from tui_gateway.command_discovery import slash_completions
                result = slash_completions(request['text'], scope=server._session_home_scope(None, cwd=request['cwd']))
            else:
                result = {'items': server._path_completion_items(request['word'], request['cwd'], None, True)}
    payload = {'result': result}
except Exception:
    payload = {'error': '无法读取当前草稿的目录补全。'}
print(json.dumps(payload, ensure_ascii=False))
