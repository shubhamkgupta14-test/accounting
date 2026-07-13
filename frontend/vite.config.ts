/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const configuredApiUrl = env.VITE_API_BASE_URL?.trim();
  const proxyTarget = env.VITE_API_PROXY_TARGET?.trim()
    || (configuredApiUrl?.startsWith("http") ? new URL(configuredApiUrl).origin : "http://127.0.0.1:8000");

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    server: {
      host: "0.0.0.0",
      port: parseInt(env.PORT || process.env.PORT || "5173", 10),
      proxy: {
        "/api": {
          target: proxyTarget,
          changeOrigin: true,
          secure: false,
          configure(proxy) {
            // Keep cookie authentication same-origin in the browser while the
            // development proxy forwards requests to any configured API port.
            proxy.on("proxyReq", proxyRequest => {
              proxyRequest.setHeader("origin", new URL(proxyTarget).origin);
            });
          },
        },
      },
    },
    test: {
      environment: "jsdom",
      setupFiles: "./src/test/setup.ts",
      clearMocks: true,
    },
  };
});
