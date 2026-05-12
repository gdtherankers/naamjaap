import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

const rawPort = process.env.PORT;

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH;

if (!basePath) {
  throw new Error(
    "BASE_PATH environment variable is required but was not provided.",
  );
}

// Inline Vite plugin that suppresses AbortError unhandledrejection overlays.
// Must run with order:'pre' so the injected script fires BEFORE the
// runtimeErrorOverlay plugin registers its own listener.
const suppressAbortErrors = () => ({
  name: "suppress-abort-errors",
  transformIndexHtml: {
    order: "pre" as const,
    handler: () => [
      {
        tag: "script",
        injectTo: "head-prepend" as const,
        children: `
          window.addEventListener('unhandledrejection', function(e) {
            var r = e.reason;
            if (r && typeof r === 'object' && (r.name === 'AbortError' || (typeof r.message === 'string' && r.message.indexOf('aborted') !== -1))) {
              e.preventDefault();
              e.stopImmediatePropagation();
            }
          }, true);
        `,
      },
    ],
  },
});

export default defineConfig({
  base: basePath,
  plugins: [
    suppressAbortErrors(),
    react(),
    tailwindcss(),
    runtimeErrorOverlay(),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, ".."),
            }),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    port,
    strictPort: true,
    host: "0.0.0.0",
    allowedHosts: true,
    fs: {
      strict: true,
    },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
