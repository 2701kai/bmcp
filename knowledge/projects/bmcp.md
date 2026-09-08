---
title: bmcp, the BEVMAQ MCP server
description: What the bevmaq MCP server exposes, how it is run, secured and extended
tags: [project, mcp, bmcp]
---

# bmcp, the BEVMAQ MCP server

Repository `github.com/2701kai/bmcp`. One MCP server that every Claude surface can use:
Claude Code in any repo, claude.ai chat and the apps (as a custom connector), published
artifacts (through the viewer's connector), and the buyer agent's managed-agents path.

## Tools

- Catalogue, live from product.bevmaq.com: `search_listings` (free text plus category,
  manufacturer, country, container, price, year, capacity, available-now, include-sold),
  `get_listing` (one SKU in full, description parsed into sections and specs),
  `catalog_status` (counts, per-category, newest, available-later, price-on-request).
- Knowledge: `search_knowledge` over this folder, `read_doc` for a whole document; every
  document is also a `bevmaq://docs/<path>` resource.
- Repos: `repo_map` renders `repos.yaml`; also the `bevmaq://repos` resource.
- Deploys: `deploy_status` from the Vercel API when `VERCEL_TOKEN` is set.
- Prompts: `machine_brief` (a buyer's summary of one machine) and `ad_brief` (the
  designer's creative brief for one machine, BEVMAQ voice, no AI vendor named).

## Transport and auth

Streamable HTTP at `/mcp`, served by MCP SDK 2.0's `createMcpHandler`: a fresh server per
request, the 2026-07-28 protocol for current clients (no sessions, no initialize handshake,
`server/discover`, cache hints on the list results) and stateless serving for 2025-era
clients (2025-06-18, 2025-11-25) on the same endpoint. Tools that return data declare an
output schema and return structured content. `bun src/stdio.ts` serves the same tools over
stdio for a local Claude Code. `BMCP_TOKEN` (comma-separated tokens allowed) turns on bearer
auth; claude.ai custom connectors take a fixed `Authorization` header, Claude Code takes
`--header`, the Claude API's MCP connector takes `authorization_token` on the
`mcp_servers` entry (paired with an `mcp_toolset` tool, beta `mcp-client-2025-11-20`).
Unset, the server is open, which is acceptable only while it exposes public data.

## Deploy

`vercel.json` pins the Bun framework preset (`framework: "bun"`) and the Bun 1.4 runtime;
the preset picks up `src/server.ts` because it calls `Bun.serve()` once. The pin is needed
because Vercel otherwise detects Hono first and builds for Node. `package.json` `main` also
names `src/server.ts` (the builder would otherwise take the first module importing Hono).
`buildCommand` is `tsc --noEmit`: TypeScript 7 is the native compiler and ships no
JavaScript compiler API, which the builder's own type-check would need, so the build runs
the native `tsc` and the builder skips its check. `vercel.json` ships the knowledge folder
and `repos.yaml` with the function through `functions` / `includeFiles`, since they are read
at run time, not imported. Anywhere else: the Dockerfile, or `bun src/server.ts` under a
process manager. `/health` reports available listings, doc count and whether Vercel is
configured.

## Extending

Add a markdown document under `knowledge/` (front matter: title, description, tags) and
restart. Add a repository to `repos.yaml`. Add a tool in `src/mcp.ts` with a Zod input
schema and a one-paragraph description that says when to use it; keep the tool count
small, every description costs context in every client.
