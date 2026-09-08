/**
 * The HTTP face of the server: a Hono app with the MCP endpoint at /mcp, /health for
 * monitors, and a bearer check in front of /mcp. Not named app.ts: Vercel's builder treats
 * app/index/server files that import Hono as entry candidates, and the entry is src/server.ts.
 *
 * /mcp is served by the SDK's createMcpHandler: a fresh McpServer per request, the
 * 2026-07-28 protocol for current clients and stateless Streamable HTTP for 2025-era ones,
 * so it runs on serverless as well as on a box.
 */

import { createMcpHandler } from "@modelcontextprotocol/server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { allowedTokens, authorized } from "./auth.ts";
import { createMcpServer, type Services } from "./mcp.ts";

/** Request headers a browser-based client (an artifact, the inspector) must be allowed to send. */
const MCP_HEADERS = ["Content-Type", "Authorization", "Accept", "MCP-Protocol-Version", "Mcp-Method", "Mcp-Name", "Mcp-Session-Id"];

export function createApp(services: Services, tokens = allowedTokens()): Hono {
  const app = new Hono();
  const mcp = createMcpHandler(() => createMcpServer(services), {
    onerror: (error) => console.error(`mcp: ${error.message}`),
  });

  app.use("/mcp", cors({ origin: "*", allowHeaders: MCP_HEADERS, exposeHeaders: ["Mcp-Session-Id"] }));

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
    return mcp.fetch(c.req.raw);
  });

  return app;
}
