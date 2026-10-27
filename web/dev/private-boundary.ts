import type { Plugin, ViteDevServer, PreviewServer } from "vite";

/** Never expose a private service API through a public development proxy. */
export function privateBoundary(): Plugin {
  const install = (server: ViteDevServer | PreviewServer) => {
    server.middlewares.use((request, response, next) => {
      try {
        let path = new URL(request.url || "/", "http://localhost").pathname;
        for (let pass = 0; pass < 4; pass++) {
          if (/(^|\/)_internal(\/|$)/.test(path)) {
            response.statusCode = 404;
            response.end("Not found");
            return;
          }
          const decoded = decodeURIComponent(path);
          if (decoded === path) break;
          path = decoded;
        }
      } catch {
        response.statusCode = 404;
        response.end("Not found");
        return;
      }
      next();
    });
  };
  return {
    name: "private-service-boundary",
    configureServer: install,
    configurePreviewServer: install,
  };
}

/** The Cards local hub uses localhost; cookie sharing requires the same host. */
export function localAccountHost(): Plugin {
  return {
    name: "shared-account-local-host",
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (
          request.method === "GET" &&
          request.headers.accept?.includes("text/html") &&
          request.headers.host?.startsWith("127.0.0.1:")
        ) {
          response.statusCode = 302;
          response.setHeader(
            "Location",
            `http://localhost:${server.config.server.port}${request.url || "/"}`,
          );
          response.end();
          return;
        }
        next();
      });
    },
  };
}
