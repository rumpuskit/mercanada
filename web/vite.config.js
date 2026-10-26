import { defineConfig } from "vite";

export default defineConfig({
  base: "/",
  server: { fs: { allow: [".."] } },
  build: { target: "es2020", chunkSizeWarningLimit: 900 },
});
