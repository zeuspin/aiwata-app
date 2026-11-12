"""Relay bounded terminal frames to AIWATA's native PTY."""

import asyncio
import base64
import contextlib
import json
import os
import signal
import sys

from hermes_cli.pty_bridge import PtyBridge
from tools.environments.local import _sanitize_subprocess_env

wire = sys.stdout


def send(frame):
    print(json.dumps(frame), file=wire, flush=True)


async def read_output(bridge):
    while (data := await asyncio.to_thread(bridge.read)) is not None:
        if data:
            send({"type": "output", "data": base64.b64encode(data).decode("ascii")})


async def receive_input(bridge, reader):
    while line := await reader.readline():
        frame = json.loads(line)
        if frame["action"] == "resize":
            bridge.resize(frame["cols"], frame["rows"])
        elif not await bridge.write(frame["data"].encode(), timeout=3):
            raise RuntimeError("终端输入已断开。")


async def main():
    cwd, cols, rows, *shell = sys.argv[3:]
    env = _sanitize_subprocess_env(dict(os.environ))
    env.update(TERM="xterm-256color", COLORTERM="truecolor", PS1="%~ %# ")
    bridge = PtyBridge.spawn(shell, cwd=cwd, env=env, cols=int(cols), rows=int(rows))
    loop = asyncio.get_running_loop()
    stopped = asyncio.Event()
    if sys.platform != "win32":
        loop.add_signal_handler(signal.SIGTERM, stopped.set)
    reader = asyncio.StreamReader(limit=400_000)
    transport = None
    try:
        transport, _ = await loop.connect_read_pipe(lambda: asyncio.StreamReaderProtocol(reader), sys.stdin.buffer)
        send({"type": "ready"})
        jobs = [asyncio.create_task(job) for job in (read_output(bridge), receive_input(bridge, reader), stopped.wait())]
        done, pending = await asyncio.wait(jobs, return_when=asyncio.FIRST_COMPLETED)
        for job in pending:
            job.cancel()
        await asyncio.gather(*pending, return_exceptions=True)
        for job in done:
            job.result()
    finally:
        if transport is not None:
            transport.close()
        await asyncio.to_thread(bridge.close)


if __name__ == "__main__":
    try:
        with contextlib.redirect_stdout(sys.stderr):
            asyncio.run(main())
    except (OSError, RuntimeError, ValueError):
        send({"type": "error", "message": "无法运行 AIWATA 交互终端。"})
