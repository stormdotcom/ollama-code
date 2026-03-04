import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [svelte()],
  // Expose dev server on all network interfaces (equivalent to `vite --host`)
  // so you can test from a phone on the same WiFi during development.
  server: {
    host: '0.0.0.0',
  },
  build: {
    outDir: '../public',
    emptyOutDir: true
  }
});
