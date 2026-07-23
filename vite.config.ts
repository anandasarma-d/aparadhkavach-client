import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

/**
 * Local DEV proxies `/v1` → deployed API Gateway so the browser stays same-origin.
 * Needed because Gateway CORS allowlists `http://localhost:5173` but Vite may be
 * opened as `http://127.0.0.1:5173` (different origin → CORS fail). Slate/prod
 * builds call `VITE_API_GATEWAY_URL` directly (no proxy).
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const gatewayTarget = env.VITE_API_GATEWAY_URL?.trim().replace(/\/$/, "");

  return {
    plugins: [react(), tailwindcss()],
    server: {
      proxy: gatewayTarget
        ? {
            "/v1": {
              target: gatewayTarget,
              changeOrigin: true,
              secure: true,
              // Gateway/ZGS often returns gzip; Node's proxy can leave a mismatched
              // Content-Encoding and browsers fail with ERR_CONTENT_DECODING_FAILED.
              configure: (proxy) => {
                proxy.on("proxyReq", (proxyReq) => {
                  proxyReq.setHeader("Accept-Encoding", "identity");
                });
              },
            },
          }
        : undefined,
    },
  };
});
