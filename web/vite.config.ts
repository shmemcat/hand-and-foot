/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { privateBoundary, localAccountHost } from "./dev/private-boundary";

export default defineConfig(({ mode }) => ({
  plugins: [react(), privateBoundary(), localAccountHost()],
  base:
    process.env.VITE_BASE_PATH ||
    (mode === "production" ? "/hand-and-foot/" : "/"),
  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
    include: ["src/**/*.test.{ts,tsx}"],
  },
  server: {
    host: "127.0.0.1",
    port: 3004,
    strictPort: true,
    fs: {
      strict: true,
      allow: [
        fileURLToPath(new URL(".", import.meta.url)),
        fileURLToPath(new URL("../node_modules", import.meta.url)),
      ],
      deny: [
        "**/.env",
        "**/.env.*",
        "**/*.{crt,pem,key}",
        "**/.git/**",
        "**/.local/**",
        "**/api/**",
      ],
    },
    proxy: {
      "/api/account": {
        target: process.env.ACCOUNT_PROXY_TARGET || "http://127.0.0.1:5100",
        changeOrigin: true,
        rewrite: (path: string) => path.replace(/^\/api/, ""),
      },
      "/api/hand-and-foot": {
        target: process.env.HANDANDFOOT_API_TARGET || "http://127.0.0.1:5104",
      },
      "/hand-and-foot/socket.io": {
        target: process.env.HANDANDFOOT_API_TARGET || "http://127.0.0.1:5104",
        ws: true,
      },
    },
  },
}));
