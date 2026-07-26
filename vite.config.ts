import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { findExactLogoDomain } from "./server/logoSearch";

export default defineConfig(({ mode }) => {
  const environment = loadEnv(mode, process.cwd(), "");

  return {
    plugins: [
      react(),
      tailwindcss(),
      logoSearchDevPlugin(environment.LOGO_DEV_SECRET_KEY ?? ""),
    ],
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
  };
});

function logoSearchDevPlugin(secretKey: string): Plugin {
  return {
    name: "logo-search-dev-api",
    configureServer(server) {
      server.middlewares.use("/api/logo-search", async (request, response) => {
        const requestUrl = new URL(request.url ?? "/", "http://localhost");
        const companyName = requestUrl.searchParams.get("q")?.trim() ?? "";

        response.setHeader("Content-Type", "application/json");

        if (!secretKey) {
          response.statusCode = 503;
          response.end(JSON.stringify({ error: "Logo-søk er ikke konfigurert." }));
          return;
        }

        try {
          const domain = await findExactLogoDomain(companyName, secretKey);
          response.statusCode = 200;
          response.end(JSON.stringify({ domain }));
        } catch {
          response.statusCode = 502;
          response.end(JSON.stringify({ error: "Kunne ikke søke etter logo." }));
        }
      });
    },
  };
}
