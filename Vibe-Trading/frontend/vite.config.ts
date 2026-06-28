import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

const PROXY_PATHS = [
  "/sessions",
  "/swarm/presets",
  "/swarm/runs",
  "/settings/llm",
  "/settings/data-sources",
  "/mandate",
  "/live",
  "/upload",
  "/shadow-reports",
  "/market-data",
  "/industry-reports",
  "/stock-search",
  "/stock-kline",
  "/stock-fundamentals",
  "/stock-mcap-history",
  "/stock-quote",
  "/stock-consensus",
  "/stock-reports",
];

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiTarget = env.VITE_API_URL || "http://127.0.0.1:8898";
  const apiProxy = { target: apiTarget, changeOrigin: true };
  const apiProxyWithHtmlFallback = {
    ...apiProxy,
    bypass(req: { headers: { accept?: string } }) {
      if (req.headers.accept?.includes("text/html")) {
        return "/index.html";
      }
    },
  };

  return {
    appType: "spa",
    plugins: [react()],
    resolve: {
      alias: { "@": path.resolve(__dirname, "./src") },
    },
    server: {
      port: 5899,
      proxy: {
        ...Object.fromEntries(PROXY_PATHS.map((p) => [p, apiProxy])),
        "^/runs/[^/]+/?$": apiProxyWithHtmlFallback,
        "/runs": apiProxy,
        "/correlation": apiProxyWithHtmlFallback,
        // alpha 因子库代理（字符串匹配，兼容性最好）
        "/alpha": apiProxy,
        // astock-peg proxy → Next.js server on port 3000
        // rewrite: /peg-api/* → /api/* (astock-peg 的 API 路由在 /api/ 下)
        "^/peg-api/": {
          target: "http://127.0.0.1:3000",
          changeOrigin: true,
          rewrite: (p: string) => p.replace(/^\/peg-api/, "/api"),
        },
        // Tencent quote API proxy (a-stock-data skill §1.2)
        "/tencent-quote": {
          target: "https://qt.gtimg.cn",
          changeOrigin: true,
          rewrite: (p: string) => p.replace(/^\/tencent-quote/, ""),
        },
      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            "vendor-react": ["react", "react-dom", "react-router-dom"],
            "vendor-charts": ["echarts"],
          },
        },
      },
    },
  };
});
