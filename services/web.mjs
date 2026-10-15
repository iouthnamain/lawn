import { resolve, sep } from "node:path";
import { stat } from "node:fs/promises";
import server from "../dist/server/server.js";

const root = resolve(import.meta.dir, "../dist/client");
Bun.serve({
  hostname: "127.0.0.1",
  port: Number(process.env.LAWN_WEB_PORT || 5296),
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/media/")) {
      url.protocol = "http:";
      url.hostname = process.env.LAWN_MEDIA_HOST || "127.0.0.1";
      url.port = process.env.LAWN_MEDIA_PORT || "5297";
      return fetch(new Request(url, request));
    }
    if (request.method === "GET" || request.method === "HEAD") {
      let path;
      try {
        path = resolve(root, "." + decodeURIComponent(url.pathname));
      } catch {
        return new Response("Invalid path", { status: 400 });
      }
      if (path !== root && !path.startsWith(root + sep))
        return new Response("Forbidden", { status: 403 });
      for (const candidate of [path, resolve(path, "index.html")]) {
        const file = Bun.file(candidate);
        if ((await stat(candidate).catch(() => null))?.isFile()) {
          const headers = new Headers();
          if (url.pathname.startsWith("/assets/"))
            headers.set("cache-control", "public, max-age=31536000, immutable");
          return new Response(request.method === "HEAD" ? null : file, { headers });
        }
      }
      if (url.pathname.startsWith("/assets/")) return new Response("Not found", { status: 404 });
    }
    return server.fetch(request);
  },
});
