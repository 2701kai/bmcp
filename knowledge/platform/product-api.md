---
title: product.bevmaq.com, the product API
description: Endpoints, record shape, and quirks of the public BEVMAQ product API that every listing on bevmaq.com is served from
tags: [platform, api, catalogue]
---

# product.bevmaq.com, the product API

The public REST API behind the bevmaq.com listings. No authentication, JSON only,
paginated with `limit` and `offset`. Base URL `https://product.bevmaq.com/v1/`.
Observed 2026-09-06.

## Endpoints

- `GET /v1/?limit=&offset=&search=` lists every listing the API knows, sold ones
  included, without photos. `limit=2000` returns the whole catalogue in one page (1,040
  records, about 2.5 MB, roughly 3.5 s). `search=` is a free-text filter over the record.
- `GET /v1/{sku}/` returns one listing with `images` (URL plus a `perspective` label such
  as Front view, Side view, Control unit, Detail), `videos` and `documents`. Unknown SKUs
  return 404; a malformed path returns 400 `"Malformed sku"`.
- `GET /v1/status/` returns every SKU with `available` (boolean), `slug` and the current
  `price` (`{amount, currency}` or null). About 130 KB, half a second. This is the
  authority on availability and price.

## Quirks to design around

- The list endpoint ignores an `available` query parameter; filter with `/v1/status/`.
- 1,040 listings were known on 2026-09-06, 385 of them available; the rest are sold or
  withdrawn but still readable, which is useful for price history and dangerous for
  anything customer-facing.
- Eleven available listings had `price: null` on 2026-09-06 and show as "Price on
  request" on the site, despite the site's promise that every listing shows its price.
- `available_from` is a `DD/MM/YYYY` string when the machine stays in production until a
  date, empty when it can ship immediately.
- Photos live on `https://storage.googleapis.com/bevmaq-product-api/images/`.

## Record shape

`id`, `sku`, `slug`, `title`, `model {name, manufacturer {name}}`, `category {name, slug}`,
`type {name, slug}` (the machine type within the category, e.g. Isobarometric Filler),
`country {name, alpha2}`, `description` (HTML), `seo_title`, `seo_description`,
`price {amount, currency}`, `year`, `thumbnail_image`, `available`, `available_from`,
`last_updated`, `created`; the detail endpoint adds `images`, `videos`, `documents`.

## SKU and category codes

SKUs read `CC-CAT-MFR-YYYY-NNNNN`: country of the machine (ISO alpha-2), a three-letter
category code, three letters of the manufacturer, year of manufacture, a counter. Category
codes seen: FIL filling, COM complete lines, PAC packaging, LAB labelling, PAL palletizing,
PRO process technology, BRE brewing and fermenting, OTH other, BLO blowmoulding, WAS
washing, CAP capping, INS inspection, KEG keg technology, CAR carton packing, TUN tunnel
pasteurizer, RIN rinsing. Category slugs on the site: filling, labelling, packaging,
palletizing, blowmoulding-machines, capping-decapping, rinsing, washing, inspection,
tunnel-pasteurizer, keg-technology, brewing-fermenting, process-technology,
complete-filling-lines, carton-packing, other-machinery.

## How descriptions are written

The editors section every description with bold or `<h2>` headings: Overview, Technical
data (a `<ul>` of `Key: value` bullets), Equipment or Scope of delivery, Not included,
Condition, Availability. Consumers (the buyer agent, this MCP server) parse these
headings into specs and facts, so keep the headings stable when editing listings.
Capacity is best stated as a `Capacity:` bullet with a unit (bph, cans/h, hl/h).
