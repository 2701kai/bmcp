---
title: How this knowledge folder works
description: Conventions for the markdown documents the bevmaq MCP server indexes and serves
tags: [meta]
---

# How this knowledge folder works

Every `.md` file under `knowledge/` is indexed at server start and served two ways: as
passages through the `search_knowledge` tool (split at headings, ranked by relevance) and
whole through `read_doc` and the `bevmaq://docs/<path>` resources.

## Writing a document

- Start with YAML front matter: `title`, one-line `description`, optional `tags`.
- One subject per file; use `#`, `##`, `###` headings, since each heading starts a new
  searchable passage. A passage should make sense on its own.
- State facts with their date when they can change ("385 available listings on
  2026-09-06"), so a reader knows how old a number is.
- Put commands, URLs and paths in backticks; they are matched literally by search.
- Prefer describing how something works over listing what exists; the repo map
  (`repos.yaml`) is the place for the inventory.

## Folders

- `platform/` how BEVMAQ's own systems work (site, product API, data conventions)
- `projects/` one document per repository or initiative, kept in step with `repos.yaml`
- `terms/` commercial and process facts that agents quote to customers (ExWorks, inspection,
  logistics), written from bevmaq.com so the wording matches the site

Restart the server (or run `bun run reindex` to check the index) after adding documents.
