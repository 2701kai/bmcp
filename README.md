# bmcp

The BEVMAQ MCP server. One server that every Claude surface can use: Claude Code in
any BEVMAQ repository, claude.ai chat and the desktop and mobile apps (as a custom
connector), published artifacts (through the viewer's connector), and the buyer agent's
managed-agents path. TypeScript 7, Bun 1.4, MCP SDK 1.30, Hono.

## What it serves

| Tool | Reads | For |
| --- | --- | --- |
| `search_listings` | product.bevmaq.com, live | machines for sale: free text plus category, manufacturer, country, container, price, year, capacity, available-now, include-sold |
| `get_listing` | product.bevmaq.com, live | one SKU in full: specs, capacity, containers and closures, description by section, photos, videos, price and availability |
| `catalog_status` | product.bevmaq.com, live | counts, per category, newest listings, machines with a future date, listings without a price |
| `search_knowledge` | `knowledge/` | passages from BEVMAQ's internal documents, ranked |
| `read_doc` | `knowledge/` | one whole document, or the list of all of them |
| `repo_map` | `repos.yaml` | which repository does what, how it runs, what it talks to |
| `deploy_status` | Vercel API | recent deployments for the BEVMAQ team (needs `VERCEL_TOKEN`) |

Every document is also an MCP resource (`bevmaq://docs/<path>`, plus `bevmaq://repos`),
and two prompts package recurring jobs: `machine_brief` (a buyer's summary of one machine)
and `ad_brief` (the designer's creative brief for one machine, in BEVMAQ's voice).

## Run it

```bash
git clone https://github.com/2701kai/bmcp.git && cd bmcp
bun install
cp .env.example .env            # set BMCP_TOKEN (openssl rand -hex 32)
bun run dev                     # http://localhost:8787/mcp, /health, /
bun test                        # 12 tests, offline: transform, knowledge, auth, MCP round trip
bun run typecheck
```

`bun run stdio` serves the same tools over stdio for a local client.

## Connect it

**Claude Code** (any repo, or `--scope user` for all of them):

```bash
claude mcp add --transport http bevmaq https://mcp.bevmaq.com/mcp \
  --header "Authorization: Bearer $BMCP_TOKEN"
```

or commit `.mcp.json` (see `.mcp.json.example`; the `${BMCP_TOKEN}` reference is expanded
from the environment) so every checkout of a BEVMAQ repository has it. Locally without the
network: `claude mcp add bevmaq -- bun /path/to/bmcp/src/stdio.ts`.

**claude.ai, desktop, mobile:** Settings, Connectors, Add custom connector, URL
`https://mcp.bevmaq.com/mcp`. Auth is a fixed request header: enter
`Authorization: Bearer <BMCP_TOKEN>` (the "static headers" option, entered once by the
organisation admin and sent on every request). Once connected, the tools are available in
every chat and in the apps, and an artifact can call them with the viewer's connector
access (`capabilities: {mcp: {servers: [{server: "bevmaq", tools: [...]}]}}`).

**Auth model.** `BMCP_TOKEN` accepts several comma-separated tokens, so Claude Code and
the connector can hold different ones and one can be rotated without the other. Unset,
the server is open; acceptable only while every tool exposes public data (the catalogue
is public; the knowledge folder is not, once you fill it). Per-user data would call for
OAuth, which Claude also supports (DCR or CIMD); this server does not need it yet.

## Deploy

**Vercel, Bun runtime.** `vercel.json` pins `framework: "bun"` and `bunVersion: "1.4.x"`;
the Bun framework preset picks up `src/server.ts` because it calls `Bun.serve()` once at
start. The pin matters: without it Vercel detects Hono from `package.json` first and builds
for Node, where `Bun.serve()` does not exist. Two more things keep that build green:
`package.json` `main` names `src/server.ts` (the builder would otherwise take the first
module that imports Hono as the entry), and `typescript` stays on 5.x (the builder
type-checks with the project's copy through the classic compiler API, which 7.x does not
ship). Push the repo,
import it in Vercel, set `BMCP_TOKEN` (and `VERCEL_TOKEN`, `VERCEL_TEAM_ID` for
`deploy_status`) as environment variables, attach `mcp.bevmaq.com`. The MCP endpoint is
stateless (a fresh server per request), which is what serverless wants.

**Anywhere else.** `docker build -t bmcp . && docker run -p 8787:8787 --env-file .env bmcp`,
or `bun src/server.ts` under a process manager. `/health` reports available listings,
document count and whether Vercel is configured; `/` reports name, version and auth mode.

## Extend it

- **Knowledge:** add a markdown file under `knowledge/` with front matter (`title`,
  `description`, `tags`) and restart. `knowledge/index.md` has the conventions. Ship what
  an agent needs to know and would otherwise have to ask you: how systems fit together,
  conventions, processes, the facts behind customer answers.
- **Repos:** add an entry to `repos.yaml`. Several entries ship with "fill in" notes where
  only the purpose was known.
- **Tools:** add one in `src/mcp.ts` with a Zod input schema and a description that says
  when to use it. Keep the count small; every description costs context in every client.
- **Personal notes** (a second brain, an Obsidian vault) belong on a separate server with
  the same shape, not on the company one.

## Layout

```
src/
  server.ts       Bun.serve entry (local and Vercel)
  stdio.ts        stdio entry for a local client
  http.ts         Hono app: /mcp (Streamable HTTP, stateless), /health, bearer auth
  mcp.ts          the tools, resources and prompts
  product-api.ts  product.bevmaq.com client with a short cache
  listings.ts     one API record into buyer facts (sections, specs, capacity, containers)
  knowledge.ts    markdown index and search (MiniSearch)
  repos.ts        repos.yaml
  vercel.ts       Vercel deployments
  services.ts     wiring from the environment
knowledge/        the documents (platform, projects, terms)
repos.yaml        the repository map
test/             bun test: transform, knowledge, auth, and an MCP client over HTTP with the product API stubbed
```
