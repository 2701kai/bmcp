---
title: bmi_shopping, the buyer agent
description: Architecture of the BEVMAQ buyer agent built on Anthropic's open-source commerce-agents shopping agent
tags: [project, agent, bmi]
---

# bmi_shopping, the buyer agent

Repository `github.com/2701kai/bmi_shopping`. A conversational buyer agent for
bevmaq.com/buy: from "I need a glass filler for beer, crown cork, about 1,500 bph, under
100k" to a shortlist and a staged quote request. Candidate product for the BMi roadmap.

## Shape

- `vendor/commerce-agents`: Anthropic's `commerce-agents` repository (Apache 2.0) as an
  unmodified git submodule. The shopping agent's loop, skills, provenance gates, memory
  and presentation tools come from there.
- `agent/` (Python 3.11, FastAPI): `backend.py` implements upstream's `StorefrontBackend`
  over the catalogue; `product_api.py` syncs the available listings from
  product.bevmaq.com at start-up and re-reads `/v1/status/` every 15 minutes before a
  search so availability and prices stay current; `listings.py` parses a listing's
  description into specs, capacity, containers and closures; `config.py` sets the voice,
  the domain search rule and which systems exist (orders off, disclosures on, cart is a
  shortlist with one line per machine); `skills/` adds `machinery-buying` and
  `line-planning` to the five upstream skills; `data/policies.json` holds the terms the
  agent may quote.
- `web/` (Next.js 16, Tailwind v4, Bun workspace): the storefront chat in BEVMAQ colours,
  importing upstream's `examples/web-shared` from the submodule. Root bun workspace with
  the hoisted linker so the submodule's files resolve React.
- `scripts/fake_model_server.py` replays a scripted conversation with the real backend
  and gates, for UI work without an API key.

## Flows mapped onto machinery

Search with domain filters (type, container, closure, capacity, year, country,
available-now); compare; line planning station by station; the cart as a shortlist whose
`checkout` stages a quote request linking each listing's quote form; a machine-facts box
(`present_disclosure`) with condition, hours, scope of delivery, availability, ExWorks
price and as-is terms; terms answered only from `policies.json`.

## Running

`./scripts/dev.sh` starts the API on :8000 and the web app on :3000; `pytest` runs 18
offline tests including two scripted end-to-end turns; `BEVMAQ_LIVE=1` adds a sync
against the real product API. Default model `claude-sonnet-5`, override with
`BEVMAQ_AGENT_MODEL`.
