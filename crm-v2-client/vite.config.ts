import path from "path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

const configDir = path.dirname(fileURLToPath(import.meta.url));

const getBaseUrl = (fullUrl: string | undefined) => {
  if (!fullUrl) return "http://localhost:3001";
  try {
    const url = new URL(fullUrl);
    return `${url.protocol}//${url.host}`;
  } catch {
    return fullUrl;
  }
};

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Vite does NOT auto-populate `process.env.VITE_*` in this config file —
  // only inside the client bundle. We have to call `loadEnv` explicitly or
  // the proxy target ends up `undefined` and every /api/v2 request fails
  // with "Must set target or forward".
  const env = loadEnv(mode, process.cwd(), "");
  const apiTarget = getBaseUrl(
    env.VITE_PUBLIC_API_URL || process.env.VITE_PUBLIC_API_URL,
  );

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      preserveSymlinks: true,
      alias: {
        "~": path.resolve(configDir, "./src"),
      },
    },
    server: {
      // Bind to every interface so http://localhost:5173 resolves whether the
      // browser picks IPv4 (127.0.0.1) or IPv6 (::1). Without this, Vite binds
      // to ::1 only on some Windows setups and browsers fail to connect silently
      // when they resolve localhost to 127.0.0.1.
      host: true,
      proxy: {
        "/api/v2": {
          target: apiTarget,
          changeOrigin: true,
          secure: false,
          cookieDomainRewrite: "localhost",
        },
      },
    },
  };
});
