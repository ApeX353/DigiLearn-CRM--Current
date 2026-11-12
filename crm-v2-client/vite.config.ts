import { execSync } from "node:child_process";
import fs from "node:fs";
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


/**
 * The commit this bundle was built from, stamped into index.html.
 * Ported from ghclient 0eb4982 (31 Aug). Lets a deploy be verified with:
 *   curl -s https://staging.digilearncrm.work/ | grep app-commit
 */
function resolveBuildCommit(env: Record<string, string>): {
  commit: string;
  branch: string;
} {
  const envFirst = (keys: string[]) => {
    for (const k of keys) {
      const v = env[k] || process.env[k];
      if (v && v.trim()) return v.trim();
    }
    return undefined;
  };
  const git = (cmd: string) => {
    try {
      return execSync(cmd, {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
        cwd: configDir,
      }).trim();
    } catch {
      return undefined;
    }
  };
  // A container build has neither the env vars nor .git, so fall back to
  // build-info.json — written on the workstation by the server's
  // scripts/write-build-info.js and carried in the deploy archive.
  const fromFile = (() => {
    try {
      const p = path.join(configDir, 'build-info.json');
      if (!fs.existsSync(p)) return undefined;
      const j = JSON.parse(fs.readFileSync(p, 'utf8'));
      if (j && j.commit && j.commit !== 'unknown') return j;
    } catch {
      // no readable stamp; carry on to "unknown"
    }
    return undefined;
  })();

  return {
    commit:
      envFirst([
        "GIT_COMMIT",
        "SOURCE_COMMIT",
        "SOURCE_VERSION",
        "COMMIT_SHA",
        "RENDER_GIT_COMMIT",
        "GITHUB_SHA",
      ]) ||
      git("git rev-parse HEAD") ||
      fromFile?.commit ||
      "unknown",
    branch:
      envFirst([
        "GIT_BRANCH",
        "SOURCE_BRANCH",
        "RENDER_GIT_BRANCH",
        "GITHUB_REF_NAME",
      ]) ||
      git("git rev-parse --abbrev-ref HEAD") ||
      fromFile?.branch ||
      "unknown",
  };
}

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
    plugins: [
      react(),
      tailwindcss(),
      {
        // Stamp the build into the HTML itself so a deploy can be
        // verified with curl — no JavaScript, no bundle archaeology.
        name: "stamp-build-commit",
        transformIndexHtml() {
          const { commit, branch } = resolveBuildCommit(env);
          return [
            {
              tag: "meta",
              attrs: { name: "app-commit", content: commit },
              injectTo: "head" as const,
            },
            {
              tag: "meta",
              attrs: { name: "app-branch", content: branch },
              injectTo: "head" as const,
            },
            {
              tag: "meta",
              attrs: { name: "app-built-at", content: new Date().toISOString() },
              injectTo: "head" as const,
            },
          ];
        },
      },
    ],
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
