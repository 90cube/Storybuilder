import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// 개발 중 /api 는 FastAPI(8000)로 프록시 → 프론트는 동일 출처처럼 호출.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": { target: "http://127.0.0.1:8000", changeOrigin: true },
    },
  },
});
