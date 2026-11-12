// Generated from AIWATA 6631a6af2c58fc498ef01fa5cc4b222fc8682683:apps/desktop/electron/hyprland.ts; run node scripts/sync-desktop-window.mjs to update.
import net from "node:net";
const REQUEST_TIMEOUT_MS = 1e3;
function hyprlandSocketPath(env, uid) {
  const signature = env.HYPRLAND_INSTANCE_SIGNATURE;
  if (!signature) {
    return null;
  }
  const runtime = env.XDG_RUNTIME_DIR ? `${env.XDG_RUNTIME_DIR}/hypr` : `/run/user/${uid}/hypr`;
  return `${runtime}/${signature}/.socket.sock`;
}
function parseHyprlandClients(payload, selfPid) {
  let raw;
  try {
    raw = JSON.parse(payload);
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) {
    return [];
  }
  const clients = raw;
  const ours = clients.find((c) => c.pid === selfPid);
  const workspace = ours?.workspace?.id;
  const visible = workspace === void 0 ? clients : clients.filter((c) => c.workspace?.id === workspace);
  return visible.filter((c) => c.pid !== selfPid && (c.size?.[0] ?? 0) > 0 && (c.size?.[1] ?? 0) > 0).sort((a, b) => (a.focusHistoryID ?? Number.MAX_SAFE_INTEGER) - (b.focusHistoryID ?? Number.MAX_SAFE_INTEGER)).map((c) => ({
    app: c.class ?? "",
    bounds: {
      x: c.at?.[0] ?? 0,
      y: c.at?.[1] ?? 0,
      width: c.size?.[0] ?? 0,
      height: c.size?.[1] ?? 0
    },
    // Addresses are pointers rendered as hex; they only travel back to the
    // model as an opaque handle, so a failed parse costs nothing.
    id: Number.parseInt(c.address ?? "", 16) || 0,
    pid: c.pid ?? 0,
    title: c.title ?? ""
  }));
}
function hyprlandRequest(socketPath, command) {
  return new Promise((resolve) => {
    let body = "";
    let settled = false;
    const socket = net.createConnection(socketPath);
    const finish = (result) => {
      if (settled) {
        return;
      }
      settled = true;
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(REQUEST_TIMEOUT_MS, () => finish(null));
    socket.on("error", () => finish(null));
    socket.on("connect", () => socket.write(command));
    socket.on("data", (chunk) => {
      body += chunk.toString("utf8");
    });
    socket.on("end", () => finish(body));
  });
}
async function readHyprlandWindows(selfPid, env = process.env, uid = process.getuid?.() ?? 0) {
  const socketPath = hyprlandSocketPath(env, uid);
  if (!socketPath) {
    return null;
  }
  const payload = await hyprlandRequest(socketPath, "j/clients");
  if (!payload) {
    return null;
  }
  const windows = parseHyprlandClients(payload, selfPid);
  return windows.length > 0 ? windows : null;
}
export {
  hyprlandRequest,
  hyprlandSocketPath,
  parseHyprlandClients,
  readHyprlandWindows
};
