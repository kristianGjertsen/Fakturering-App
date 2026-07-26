import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      "/api/brreg-search": {
        target: "https://data.brreg.no",
        changeOrigin: true,
        rewrite: (path) => path.replace(
          /^\/api\/brreg-search/,
          "/enhetsregisteret/api/enheter",
        ),
      },
    },
  },
});
