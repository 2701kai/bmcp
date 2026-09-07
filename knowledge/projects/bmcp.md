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

Streamable HTTP at `/mcp`, stateless (a fresh server per request), so it runs on
serverless and on a box alike; `bun src/stdio.ts` serves the same tools over stdio for a
local Claude Code. `BMCP_TOKEN` (comma-separated tokens allowed) turns on bearer auth;
claude.ai custom connectors take a fixed `Authorization` header, Claude Code takes
`--header`. Unset, the server is open, which is acceptable only while it exposes public
data.

## Deploy

`vercel.json` pins the Bun framework preset (`framework: "bun"`) and the Bun 1.4 runtime;
the preset picks up `src/server.ts` because it calls `Bun.serve()` once. The pin is needed
because Vercel otherwise detects Hono first and builds for Node. `package.json` `main` also
names `src/server.ts` (the builder would otherwise take the first module importing Hono),
and `typescript` stays on 5.x (the builder type-checks through the classic compiler API,
which 7.x lacks). Anywhere else: the Dockerfile, or
`bun src/server.ts` under a process manager. `/health` reports available listings, doc
count and whether Vercel is configured.

## Extending

Add a markdown document under `knowledge/` (front matter: title, description, tags) and
restart. Add a repository to `repos.yaml`. Add a tool in `src/mcp.ts` with a Zod input
schema and a one-paragraph description that says when to use it; keep the tool count
small, every description costs context in every client.
