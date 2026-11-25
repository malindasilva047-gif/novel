import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiTarget = (
    env.VITE_API_PROXY_TARGET || env.VITE_API_BASE_URL || "http://127.0.0.1:8000"
  ).replace(/\/+$/, "");
  const apiProxy = {
    "/api": { target: apiTarget, changeOrigin: true },
    "/uploads": { target: apiTarget, changeOrigin: true },
  };
  const browserHeaders = {
    "Cross-Origin-Opener-Policy": "same-origin-allow-popups",
  };

  return {
    plugins: [react()],
    server: {
      port: 5173,
      host: true,
      allowedHosts: [".trycloudflare.com"],
      headers: browserHeaders,
      proxy: apiProxy,
    },
    preview: {
      headers: browserHeaders,
      proxy: apiProxy,
    },
    build: {
      target: "es2018",
      cssCodeSplit: true,
      sourcemap: false,
      minify: "esbuild",
      chunkSizeWarningLimit: 900,
      rollupOptions: {
        output: {
          manualChunks: {
            react: ["react", "react-dom", "react-router-dom"],
          },
        },
      },
    },
  };
});
