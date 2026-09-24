import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { viteSingleFile } from "vite-plugin-singlefile";

// `npm run build:demo` makes one self-contained HTML file with the backend
// running inside the page — used for the demo shown inside Claude.
export default defineConfig(({ mode }) => ({
  define: mode === "demo" ? { "import.meta.env.VITE_DEMO": JSON.stringify("1") } : undefined,
  resolve: mode === "demo" ? undefined : {
    // Real builds swap the in-page demo backend for an empty stub.
    alias: [{ find: /^(\.\.?\/)+demo\/server$/, replacement: "/src/demo/stub.ts" }],
  },
  build: mode === "demo" ? { outDir: "dist-demo", assetsInlineLimit: 100_000_000, cssCodeSplit: false } : undefined,
  plugins: [
    react(),
    ...(mode === "demo" ? [viteSingleFile()] : []),
    VitePWA({
      disable: mode === "demo",
      registerType: "autoUpdate",
      includeAssets: ["icon.svg"],
      manifest: {
        name: "RESQ.AI — report a hazard",
        short_name: "RESQ.AI",
        description: "Report floods, landslides and other hazards to the control room — even without network.",
        theme_color: "#F4F1EA",
        background_color: "#F4F1EA",
        display: "standalone",
        start_url: "/",
        icons: [
          { src: "icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" }
        ]
      },
      workbox: {
        navigateFallback: "/index.html",
        // config.js is edited after deployment, so never serve a stale copy.
        globIgnores: ["**/config.js"],
        globPatterns: [
          "**/*.{js,css,html,svg,png}",
          // Only the scripts we actually use: Latin, Devanagari (Hindi), Bengali (Assamese + Bengali).
          "**/*-{latin,devanagari,bengali}-{400,500,600,700}-normal-*.woff2",
        ],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname === "/config.js",
            handler: "NetworkFirst",
            options: { cacheName: "config", networkTimeoutSeconds: 4 }
          },
          {
            urlPattern: /^https:\/\/[abc]?\.?tile\.openstreetmap\.org\/.*/,
            handler: "CacheFirst",
            options: { cacheName: "tiles", expiration: { maxEntries: 800, maxAgeSeconds: 60 * 60 * 24 * 30 } }
          }
        ]
      }
    })
  ],
  server: { port: 5173, host: true },
  preview: { port: 4173, host: true }
}));
