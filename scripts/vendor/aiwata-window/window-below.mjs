// Generated from AIWATA 6631a6af2c58fc498ef01fa5cc4b222fc8682683:apps/desktop/electron/window-below.ts; run node scripts/sync-desktop-window.mjs to update.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { app } from "electron";
import { readHyprlandWindows } from "./hyprland.mjs";
function enumerationFailureNote(platform, env, detail) {
  if (platform !== "linux") {
    return detail ? `Could not enumerate windows: ${detail}` : "Could not enumerate windows on this system.";
  }
  if (env.HYPRLAND_INSTANCE_SIGNATURE) {
    return "Could not enumerate windows: Hyprland did not answer on its IPC socket. Check that `hyprctl clients` works from the same session AIWATA is running in.";
  }
  const wayland = env.XDG_SESSION_TYPE === "wayland" || Boolean(env.WAYLAND_DISPLAY) && !env.DISPLAY;
  if (wayland) {
    return "Could not enumerate windows: this is a Wayland session, and Wayland does not let an application see other applications\u2019 windows. Log in to an X11/Xorg session, or run AIWATA under XWayland with DISPLAY set.";
  }
  return "Could not enumerate windows: this needs the xprop and xwininfo commands (the x11-utils package on Debian/Ubuntu, xorg-x11-utils on Fedora).";
}
const overlaps = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
function pickWindowBelow(windows, selfPid, selfBounds) {
  const others = windows.filter((w) => w.pid !== selfPid);
  const frontmost = others[0] ?? null;
  const selfIndex = windows.findIndex((w) => w.pid === selfPid);
  const behind = selfIndex === -1 ? others : windows.slice(selfIndex + 1);
  const below = behind.find((w) => w.pid !== selfPid && overlaps(w.bounds, selfBounds)) ?? null;
  return { below, frontmost };
}
const enumerationFailed = (result) => typeof result === "object" && result !== null && "reason" in result;
function getWindowsFailureReason(detail, platform, arch) {
  if (platform === "win32" && arch === "arm64") {
    return `${detail}. On Windows ARM64, check that the installed get-windows package includes a working win32-arm64 native binding. If that binding is unavailable, use the x64 desktop build under Windows emulation, or a build with a matching native binding. This affects both read_window_below and HUD window context.`;
  }
  return detail;
}
const describeError = (error) => error instanceof Error ? error.message : String(error ?? "unknown error");
const resolveOutsideAsar = (specifier) => specifier.replace(/app\.asar(?=$|[\\/])/, "app.asar.unpacked");
let getWindowsModule = null;
const loadGetWindows = () => {
  getWindowsModule ??= (async () => {
    const staged = resolveOutsideAsar(path.join(app.getAppPath(), "dist", "node_modules", "get-windows", "index.js"));
    let stagedError = "not staged in this build";
    if (fs.existsSync(staged)) {
      try {
        return await import(pathToFileURL(staged).href);
      } catch (error) {
        stagedError = describeError(error);
      }
    }
    try {
      return await import(resolveOutsideAsar(import.meta.resolve("get-windows")));
    } catch (error) {
      return {
        reason: `the get-windows module could not be loaded (staged copy: ${stagedError}; node_modules copy: ${describeError(error)})`
      };
    }
  })();
  return getWindowsModule;
};
async function enumerateViaGetWindows(titlesAvailable) {
  const getWindows = await loadGetWindows();
  if (enumerationFailed(getWindows)) {
    return getWindows;
  }
  let raw;
  try {
    raw = await getWindows.openWindows(
      process.platform === "darwin" ? { accessibilityPermission: false, screenRecordingPermission: titlesAvailable } : void 0
    );
  } catch (error) {
    return { reason: `the window enumerator failed: ${describeError(error)}` };
  }
  if (!Array.isArray(raw)) {
    return { reason: "the window enumerator returned no window list" };
  }
  const ordered = process.platform === "linux" ? [...raw].reverse() : raw;
  return ordered.map((w) => ({
    app: w.owner?.name ?? "",
    bounds: {
      x: w.bounds?.x ?? 0,
      y: w.bounds?.y ?? 0,
      width: w.bounds?.width ?? 0,
      height: w.bounds?.height ?? 0
    },
    id: w.id ?? 0,
    pid: w.owner?.processId ?? 0,
    title: w.title ?? ""
  }));
}
async function enumerateWindowsFrontToBack(selfPid, titlesAvailable) {
  const result = await readHyprlandWindows(selfPid) ?? await enumerateViaGetWindows(titlesAvailable);
  return enumerationFailed(result) ? { reason: getWindowsFailureReason(result.reason, process.platform, process.arch) } : result;
}
async function readWindowBelow(selfPid, selfBounds, titlesAvailable) {
  const windows = await enumerateWindowsFrontToBack(selfPid, titlesAvailable);
  if (enumerationFailed(windows)) {
    return {
      error: enumerationFailureNote(process.platform, process.env, windows.reason),
      platform: process.platform
    };
  }
  const { below, frontmost } = pickWindowBelow(windows, selfPid, selfBounds);
  const result = {
    frontmost: frontmost ? { app: frontmost.app, title: frontmost.title } : null,
    platform: process.platform,
    window: below ? { app: below.app, bounds: below.bounds, id: below.id, title: below.title } : null
  };
  if (process.platform === "darwin" && !titlesAvailable) {
    result.note = "Window titles are hidden: macOS reveals other apps\u2019 titles only with the Screen Recording permission, which AIWATA does not request for this.";
  }
  return result;
}
export {
  enumerateWindowsFrontToBack,
  enumerationFailed,
  enumerationFailureNote,
  getWindowsFailureReason,
  pickWindowBelow,
  readWindowBelow,
  resolveOutsideAsar
};
