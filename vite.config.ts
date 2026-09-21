// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { fileURLToPath } from "node:url";
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { loadEnv } from "vite";

// Loads ALL env vars into process.env for server routes / server functions
// only (e.g. LOVABLE_API_KEY). Never add these to client envDefine.
Object.assign(process.env, loadEnv(process.env["NODE_ENV"] ?? "development", process.cwd(), ""));

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    server: {
      port: 3005,
    },
    resolve: {
      alias: {
        // Pin entities to the hoisted v4.5.0 copy; nested v7 breaks SSR.
        "entities/lib/decode.js": fileURLToPath(
          new URL("./node_modules/entities/lib/decode.js", import.meta.url),
        ),
        "entities/lib/encode.js": fileURLToPath(
          new URL("./node_modules/entities/lib/encode.js", import.meta.url),
        ),
        entities: fileURLToPath(new URL("./node_modules/entities", import.meta.url)),
      },
    },
  },
});
