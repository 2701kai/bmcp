/**
 * HTTP entry point. Locally: `bun src/server.ts` (PORT, default 8787). On Vercel the Bun
 * framework preset picks this file up because it calls Bun.serve() once at module start.
 */

import { createApp } from "./app.ts";
import { buildServices } from "./services.ts";

const services = await buildServices();
const app = createApp(services);

Bun.serve({
  port: Number(process.env.PORT ?? 8787),
  fetch: app.fetch,
  idleTimeout: 120,
});

console.error(`bevmaq-mcp ${services.version}: ${services.knowledge.list().length} docs indexed, MCP at /mcp, auth ${process.env.BMCP_TOKEN ? "bearer" : "none"}`);
