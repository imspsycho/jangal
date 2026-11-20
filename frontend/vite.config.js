import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Dev: `cd backend && LND_MODE=mock node src/index.js` on :3000,
//      `cd frontend && npm run dev` on :5173 (proxied).
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": "http://localhost:3000",
      "/nostr": { target: "ws://localhost:3000", ws: true },
    },
  },
  build: { target: "es2019", cssCodeSplit: false, assetsInlineLimit: 8192 },
});
