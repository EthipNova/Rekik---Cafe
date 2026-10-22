// TanStack Start Vite preset config includes:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// Additional config can be passed via defineConfig({ vite: { ... }, etc... }) if needed.
import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import type { Plugin } from "vite";

/**
 * Reads .env (and .env.local) files and injects every variable into process.env so
 * that server-side SSR modules loaded via ssrLoadModule() — in particular
 * src/server/supabase.ts — can access SUPABASE_SERVICE_ROLE_KEY and other
 * server-only secrets.
 *
 * SECURITY: this runs only inside the Vite dev-server Node process.
 * It does NOT inject anything into import.meta.env or client bundles.
 * SUPABASE_SERVICE_ROLE_KEY is intentionally absent from envPrefix so it
 * is never shipped to the browser.
 */
function loadEnvIntoProcess(root: string): void {
  const envFiles = [".env", ".env.local"];
  for (const file of envFiles) {
    const filePath = path.resolve(root, file);
    if (!fs.existsSync(filePath)) continue;
    const raw = fs.readFileSync(filePath, "utf-8");
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      // Skip comments and blank lines
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      // Strip optional surrounding quotes from value
      const rawVal = trimmed.slice(eqIdx + 1).trim();
      const value = rawVal.replace(/^(['"])(.*)\1$/, "$2");
      // Never overwrite variables that are already set in the environment
      // (allows CI/production to override .env)
      if (key && !(key in process.env)) {
        process.env[key] = value;
      }
    }
  }
}

/**
 * Vite development middleware that routes /api/* requests directly to src/server/api.ts
 * during `npm run dev` / `vite dev`, ensuring development and production SSR share
 * the exact same backend endpoints without returning 404.
 */
function apiDevMiddleware(): Plugin {
  return {
    name: "neba-api-dev-middleware",
    configureServer(server) {
      // Inject .env variables into process.env before any SSR module is loaded.
      // This makes SUPABASE_SERVICE_ROLE_KEY available to src/server/supabase.ts.
      const root = server.config?.root ?? process.cwd();
      loadEnvIntoProcess(root);

      // Watch src/server directory for immediate HMR/reloads
      server.watcher.add(path.resolve(root, "src/server"));

      const middleware: import("vite").Connect.NextHandleFunction = async (req, res, next) => {
        const url = req.url ?? "";
        if (!url.startsWith("/api/") && url !== "/api") {
          return next();
        }

        try {
          const apiFilePath = path.resolve(root, "src/server/api.ts");
          // Invalidate module graph entries for server modules so changes take effect immediately
          if (server.moduleGraph) {
            for (const [, mod] of server.moduleGraph.idToModuleMap) {
              if (mod.id && (mod.id.includes("src/server") || mod.id.includes("src\\server") || mod.id.includes("server/api") || mod.id.includes("server/staff"))) {
                server.moduleGraph.invalidateModule(mod);
              }
            }
          }

          const apiModule = await server.ssrLoadModule(apiFilePath);
          const { handleApiRequest } = apiModule;
          if (typeof handleApiRequest !== "function") {
            return next();
          }

          const protocol = req.headers["x-forwarded-proto"] || "http";
          const host = req.headers.host || "localhost:3000";
          const fullUrl = `${protocol}://${host}${url}`;

          // Read body chunks for non-GET/HEAD/OPTIONS
          let bodyBuffer: Buffer | undefined = undefined;
          if (req.method !== "GET" && req.method !== "HEAD" && req.method !== "OPTIONS") {
            const chunks: Buffer[] = [];
            for await (const chunk of req) {
              chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
            }
            if (chunks.length > 0) {
              bodyBuffer = Buffer.concat(chunks);
            }
          }

          const headers = new Headers();
          for (const [key, val] of Object.entries(req.headers)) {
            if (val !== undefined) {
              if (Array.isArray(val)) {
                for (const v of val) headers.append(key, v);
              } else {
                headers.set(key, val as string);
              }
            }
          }

          const reqInit: RequestInit = {
            method: req.method || "GET",
            headers,
          };
          if (bodyBuffer && bodyBuffer.length > 0) {
            reqInit.body = new Uint8Array(bodyBuffer);
            // @ts-expect-error duplex is a valid RequestInit extension in Node 18+ fetch
            reqInit.duplex = "half";
          }

          const webRequest = new Request(fullUrl, reqInit);

          const webResponse: Response = await handleApiRequest(webRequest);

          res.statusCode = webResponse.status;
          webResponse.headers.forEach((val: string, key: string) => {
            res.setHeader(key, val);
          });

          const arrayBuf = await webResponse.arrayBuffer();
          res.end(Buffer.from(arrayBuf));
        } catch (err) {
          console.error("[api-dev-middleware] Error handling request:", err);
          res.statusCode = 500;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: "Internal Server Error", message: String(err) }));
        }
      };

      // Unshift to the front of the middleware stack so it intercepts /api/* before TanStack Start router
      server.middlewares.stack.unshift({ route: "", handle: middleware });
    },
  };
}

const nitroPreset = process.env["NITRO_PRESET"] || (process.env["VERCEL"] ? "vercel" : undefined);

export default defineConfig({
  vite: {
    plugins: [apiDevMiddleware()],
    // Restrict client-side exposed env vars so SUPABASE_SERVICE_ROLE_KEY is never leaked to client bundles
    envPrefix: ["VITE_"],
  },
  ...(nitroPreset ? { nitro: { preset: nitroPreset } } : {}),
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});
