import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    // PWA (8-sep-2026): que al abrir desde el ícono de la pantalla de
    // inicio se vea como app real, sin barra de Safari — mismo criterio
    // que la otra app de Diego (Vida). display:"standalone" + los meta
    // tags de Apple en index.html son las 2 piezas que lo logran.
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["apple-touch-icon.png"],
      manifest: {
        name: "Chula ERP",
        short_name: "Chula ERP",
        description: "Chula Brand Farms — ERP",
        start_url: "/",
        display: "standalone",
        background_color: "#f6f6fa",
        theme_color: "#e6127a",
        icons: [
          { src: "/pwa-192.png", sizes: "192x192", type: "image/png" },
          { src: "/pwa-512.png", sizes: "512x512", type: "image/png" },
          { src: "/pwa-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
    }),
  ],
  server: { port: 5173, proxy: { "/api": "http://localhost:4000" } },
});
