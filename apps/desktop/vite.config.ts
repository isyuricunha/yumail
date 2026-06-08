import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";

const host = process.env.TAURI_DEV_HOST ?? "127.0.0.1";

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  resolve: {
    alias: {
      "@yumail/ai": fileURLToPath(new URL("../../packages/ai/src/index.ts", import.meta.url)),
      "@yumail/core": fileURLToPath(new URL("../../packages/core/src/index.ts", import.meta.url)),
      "@yumail/db": fileURLToPath(new URL("../../packages/db/src/index.ts", import.meta.url)),
      "@yumail/mail": fileURLToPath(new URL("../../packages/mail/src/index.ts", import.meta.url)),
      "@yumail/platform-tauri": fileURLToPath(new URL("../../packages/platform-tauri/src/index.ts", import.meta.url)),
      "@yumail/renderer": fileURLToPath(new URL("../../packages/renderer/src/index.ts", import.meta.url)),
      "@yumail/search": fileURLToPath(new URL("../../packages/search/src/index.ts", import.meta.url)),
      "@yumail/shared": fileURLToPath(new URL("../../packages/shared/src/index.ts", import.meta.url)),
      "@yumail/ui/styles.css": fileURLToPath(new URL("../../packages/ui/src/styles.css", import.meta.url)),
      "@yumail/ui": fileURLToPath(new URL("../../packages/ui/src/index.tsx", import.meta.url))
    }
  },
  server: {
    host,
    port: 5173,
    strictPort: true,
    watch: {
      ignored: ["**/src-tauri/**"]
    }
  }
});
