/**
 * The HTTP face of the server: a Hono app with the MCP endpoint at /mcp (Streamable HTTP,
 * stateless, one transport per request so it runs on serverless as well as on a box),
 * /health for monitors, and a bearer check in front of /mcp. Not named app.ts: Vercel's
 * builder treats app/index/server files that import Hono as entry candidates, and the
 * entry is src/server.ts.
 */

import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { allowedTokens, authorized } from "./auth.ts";
import { createMcpServer, type Services } from "./mcp.ts";

export function createApp(services: Services, tokens = allowedTokens()): Hono {
  const app = new Hono();

  app.use("/mcp", cors({ origin: "*", allowHeaders: ["Content-Type", "Authorization", "Mcp-Session-Id", "Mcp-Protocol-Version"], exposeHeaders: ["Mcp-Session-Id"] }));

  app.get("/", (c) =>
    c.json({
      name: "bevmaq-mcp",
      version: services.version,
      mcp: "/mcp",
      auth: tokens.length ? "bearer" : "none",
      docs: services.knowledge.list().length,
    }),
  );

  app.get("/health", async (c) => {
    let products: number | null = null;
    try {
      products = (await services.products.statusRows()).filter((row) => row.available).length;
    } catch {
      products = null;
    }
    return c.json({ ok: true, version: services.version, available_listings: products, docs: services.knowledge.list().length, vercel: services.vercel.configured });
  });

  app.all("/mcp", async (c) => {
    if (!authorized(c.req.raw, tokens)) {
      return c.json({ error: "unauthorized", hint: "send Authorization: Bearer <BMCP_TOKEN>" }, 401, { "WWW-Authenticate": 'Bearer realm="bevmaq-mcp"' });
    }
    // Stateless: a fresh server and transport per request, closed when the response ends.
    const server = createMcpServer(services);
    const transport = new WebStandardStreamableHTTPServerTransport({ enableJsonResponse: true });
    await server.connect(transport);
    try {
      return await transport.handleRequest(c.req.raw);
    } finally {
      queueMicrotask(() => void server.close());
    }
  });

  return app;
}
