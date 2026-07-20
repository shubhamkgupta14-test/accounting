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
  const securityHeaders = {
    "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  };
  const developmentSecurityHeaders = {
    ...securityHeaders,
    // Vite injects the React Refresh bootstrap as an inline module in
    // development. Production/preview keeps the strict script policy above.
    "Content-Security-Policy": securityHeaders["Content-Security-Policy"]
      .replace("script-src 'self'", "script-src 'self' 'unsafe-inline'"),
  };

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
      headers: developmentSecurityHeaders,
      proxy: {
        "/api": {
          target: proxyTarget,
          changeOrigin: true,
          secure: false,
        },
      },
    },
    preview: {
      headers: securityHeaders,
    },
    test: {
      environment: "jsdom",
      setupFiles: "./src/test/setup.ts",
      clearMocks: true,
    },
  };
});
