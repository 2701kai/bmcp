/**
 * stdio entry point for a local client such as Claude Code:
 *   claude mcp add bevmaq -- bun /path/to/bmcp/src/stdio.ts
 * Same tools as the HTTP server; no auth, since only this machine can reach it.
 */

import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { createMcpServer } from "./mcp.ts";
import { buildServices } from "./services.ts";

const services = await buildServices();
serveStdio(() => createMcpServer(services));
