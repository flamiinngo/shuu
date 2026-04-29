import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { nodePolyfills } from "vite-plugin-node-polyfills";

export default defineConfig({
  plugins: [
    react(),
    nodePolyfills({
      include:  ["crypto", "buffer", "stream", "util", "events"],
      globals:  { Buffer: true, global: true, process: true },
    }),
  ],
  define: {
    "process.env":      JSON.stringify({}),
    "process.browser":  JSON.stringify(true),
    "process.version":  JSON.stringify(""),
    "process.versions": JSON.stringify({}),
    "process.platform": JSON.stringify("browser"),
    global:             "globalThis",
  },
  resolve: {
    alias: {
      buffer: "buffer",
    },
  },
  optimizeDeps: {
    include: ["buffer"],
    esbuildOptions: {
      target: "esnext",
      define: {
        global:              "globalThis",
        "process.env":       JSON.stringify({}),
        "process.browser":   "true",
        "process.version":   JSON.stringify(""),
        "process.versions":  JSON.stringify({}),
        "process.platform":  JSON.stringify("browser"),
      },
    },
  },
});
