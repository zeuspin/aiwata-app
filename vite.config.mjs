import { verifyDesignTokens } from './scripts/check-design-tokens.mjs';
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { liveAiwata } from "./scripts/live-aiwata-gateway.mjs";

verifyDesignTokens({ core: resolve(process.env.AIWATA_APP_SOURCE || '../aiwata') });

const native = process.env.AIWATA_APP_NATIVE === "1";
const nativeSource = resolve(process.env.AIWATA_APP_SOURCE || "../aiwata");
const auxiliary = native
  ? await (await import("./scripts/native-auxiliary-build.mjs")).nativeAuxiliaryBuild(nativeSource, resolve("."))
  : { alias: { '#native-auxiliary': resolve('src/native-desktop-unavailable.mjs') }, plugins: [] };
const live = !native && process.env.AIWATA_APP_LIVE === "1";
const isolated = live && process.env.AIWATA_APP_ISOLATED === "1";

export default defineConfig({
  cacheDir: native ? "node_modules/.vite-native" : isolated ? "node_modules/.vite-isolated" : "node_modules/.vite",
  resolve: { alias: {
    ...auxiliary.alias,
    '#native-preferences': resolve(native ? nativeSource+'/apps/desktop/src/lib/ui-preferences/boot.ts' : 'src/native-desktop-unavailable.mjs'),
    '#native-desktop': resolve(native ? 'src/native-desktop-entry.mjs' : 'src/native-desktop-unavailable.mjs'),
    ...(native ? {
      '@': resolve(nativeSource, 'apps/desktop/src'),
      '@aiwata/native-client': resolve(nativeSource, 'apps/desktop/src/api/client.ts'),
      '@aiwata/native-preview-scope': resolve(nativeSource, 'apps/desktop/electron/preview-guest-throttle.ts'),
      '@aiwata/native-protocol': resolve(nativeSource, 'apps/desktop/src/api/canonical-protocol.ts'),
      '@aiwata/native-titlebar': resolve(nativeSource, 'apps/desktop/src/app/shell/titlebar.ts'),
      '@aiwata/native-overlay': resolve(nativeSource, 'apps/desktop/electron/titlebar-overlay-width.ts'),
      '@hermes/shared': resolve(nativeSource, 'apps/shared/src'),
      nanostores: resolve(nativeSource, 'apps/desktop/node_modules/nanostores/index.js'),
    } : {}),
  }, ...(native ? { dedupe: ['react', 'react-dom', 'react-router', '@tanstack/react-query'] } : {}) },
  css: { postcss: { plugins: [] } },
  base: './',
  build: {
    outDir: native ? "dist/native" : "dist/client",
    ...(native ? { target: 'es2022', rollupOptions: { output: auxiliary.output } } : {}),
  },
  optimizeDeps: {
    ...(native ? { esbuildOptions: { target: 'es2022' } } : {}),
    include: ["react", "react-dom/client"],
    ...(native ? { exclude: ['driver.js', 'driver.js/dist/driver.js.iife.js', 'driver.js/dist/driver.js.iife.js?raw', 'driver.js/dist/driver.css?raw'] } : {}),
  },
  server: {
    watch: { ignored: [resolve("dist") + "/**"] },
    fs: { allow: [resolve("."), ...(native ? [nativeSource, ...auxiliary.fsAllow] : [])] },
    host: live ? "127.0.0.1" : "0.0.0.0",
    allowedHosts: ["terminal.local"],
    warmup: {
      clientFiles: ["./src/main.jsx"],
    },
  },
  define: { __AIWATA_NATIVE__: JSON.stringify(native), __AIWATA_LIVE__: JSON.stringify(live), __AIWATA_ISOLATED__: JSON.stringify(isolated) },
  plugins: [react(), ...auxiliary.plugins, ...(live ? [liveAiwata({
    source: resolve(process.env.AIWATA_APP_SOURCE || "../aiwata"),
    dataRoot: resolve(process.env.AIWATA_APP_DATA || resolve(homedir(), isolated ? ".aiwata-app-isolated" : ".aiwata-app-dev")),
    installHome: process.env.AIWATA_APP_INSTALL_HOME,
    isolated,
  })] : [])],
});
