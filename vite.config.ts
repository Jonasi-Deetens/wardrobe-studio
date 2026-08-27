import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vitest/config";

/**
 * One config for both targets.
 *
 * The browser build and the Tauri build come out of the same source; only the platform
 * shim in src/app/lib/platform.ts differs at runtime. The Tauri-specific settings below are
 * inert in a plain `vite build`, because the TAURI_ENV_* variables only exist when the
 * Tauri CLI is the one driving the build.
 */

const host = process.env.TAURI_DEV_HOST;
const platform = process.env.TAURI_ENV_PLATFORM;
const debugBuild = !!process.env.TAURI_ENV_DEBUG;

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  /* Vite clearing the screen would wipe the Rust compiler errors printed above it. */
  clearScreen: false,
  server: {
    /* Tauri points its webview at a fixed port, so a silent fallback to 5174 would leave
       the desktop window looking at nothing. */
    port: 5173,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: "ws", host, port: 1421 } : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
  envPrefix: ["VITE_", "TAURI_ENV_*"],
  worker: {
    format: "es",
  },
  build: {
    /* Windows uses Chromium via WebView2; macOS and Linux use the system WebKit, which
       lags well behind. Targeting the older engine keeps the syntax it can parse. */
    target: platform === "windows" ? "chrome105" : "safari13",
    /* Left at the default minifier; a debug desktop build keeps the source readable in the
       webview inspector instead. */
    minify: !debugBuild,
    sourcemap: debugBuild,
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
