import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const investigationTarget =
    env.VITE_INVESTIGATION_SERVICE_URL?.replace(/\/$/, "") || "http://localhost:8080";

  return {
    plugins: [react(), tailwindcss()],
    server: {
      // Investigation Service has no CorsConfig (gateway owns CORS). Dev proxy lets the
      // browser call same-origin /__ak_investigation → local Investigation.
      proxy: {
        "/__ak_investigation": {
          target: investigationTarget,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/__ak_investigation/, ""),
        },
      },
    },
  };
});
