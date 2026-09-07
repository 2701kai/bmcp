/** A product API stand-in: the fixture listing plus two small invented siblings, served through a fetch stub. */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ApiListing, StatusRow } from "../src/product-api.ts";

const fixtures = join(import.meta.dir, "fixtures");
export const GAI = "HR-FIL-GAI-2016-00001";
export const gai = JSON.parse(readFileSync(join(fixtures, "gai-mle-661.json"), "utf8")) as ApiListing;
export const status = JSON.parse(readFileSync(join(fixtures, "status.json"), "utf8")) as StatusRow[];

const labeller: ApiListing = {
  id: "l1",
  sku: "DE-LAB-GER-2020-00001",
  slug: "gernep-labetta_DE-LAB-GER-2020-00001",
  title: "Gernep Labetta 4/3/10 Cold Glue Labeler (2020)",
  model: { name: "Labetta 4/3/10", manufacturer: { name: "Gernep" } },
  category: { name: "Labelling", slug: "labelling" },
  type: { name: "Cold Glue Labeler", slug: "cold-glue-labeler" },
  country: { name: "Germany", alpha2: "DE" },
  description: "<p><strong>Overview</strong></p><p>Cold glue labeller for glass bottles, up to 10,000 bph, body and neck labels.</p><p><strong>Technical data</strong></p><ul><li>Capacity: up to 10,000 bph</li><li>Bottle formats: 0.33 l and 0.5 l glass</li></ul><p><strong>Availability</strong></p><p>Immediately. Location: Germany.</p>",
  price: { amount: 45000, currency: "EUR" },
  year: 2020,
  thumbnail_image: "https://example.invalid/labetta.jpg",
  available: true,
  available_from: "",
  last_updated: "2026-08-01T00:00:00Z",
  created: "2026-08-01T00:00:00Z",
};

const blower: ApiListing = {
  id: "b1",
  sku: "FR-BLO-SID-2006-00001",
  slug: "sidel-sbo-2-xl-compact_FR-BLO-SID-2006-00001",
  title: "SIDEL SBO 2 XL Compact Blow Moulder (2006)",
  model: { name: "SBO 2 XL Compact", manufacturer: { name: "SIDEL" } },
  category: { name: "Blowmoulding Machines", slug: "blowmoulding-machines" },
  type: { name: "Blow Moulder", slug: "blow-moulder" },
  country: { name: "France", alpha2: "FR" },
  description: "<p><strong>Overview</strong></p><p>Two-cavity stretch blow moulder for PET bottles up to 5 l, output 2,400 bottles/h.</p>",
  price: null,
  year: 2006,
  thumbnail_image: null,
  available: true,
  available_from: "",
  last_updated: "2026-07-01T00:00:00Z",
  created: "2026-07-01T00:00:00Z",
};

const sold: ApiListing = {
  ...blower,
  id: "s1",
  sku: "NL-OTH-CER-2016-00001",
  slug: "certuss-junior-400-eg_NL-OTH-CER-2016-00001",
  title: "Certuss Junior 400 EG Steam Generator (2016)",
  category: { name: "Other Machinery", slug: "other-machinery" },
  type: { name: "Steam Generator", slug: "steam-generator" },
  description: "<p><strong>Overview</strong></p><p>Steam generator, sold.</p>",
  available: false,
};

/** The list endpoint's records: no photos, like the real one. */
const listRecords = [gai, labeller, blower, sold].map(({ images: _i, videos: _v, documents: _d, ...rest }) => rest);
const detailRecords = new Map([gai, labeller, blower, sold].map((record) => [record.sku, record]));

export const calls: string[] = [];

export const fakeFetch: typeof fetch = (async (input: RequestInfo | URL) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  calls.push(url.pathname + url.search);
  const body = (value: unknown, init: ResponseInit = {}) => new Response(JSON.stringify(value), { ...init, headers: { "content-type": "application/json", ...(init.headers ?? {}) } });
  if (url.pathname === "/v1/status/") return body(status);
  if (url.pathname === "/v1/") return body({ count: listRecords.length, next: null, previous: null, results: listRecords });
  const sku = /^\/v1\/([A-Z0-9-]+)\/$/.exec(url.pathname)?.[1];
  if (sku) {
    const record = detailRecords.get(sku);
    return record ? body(record) : body("Not found", { status: 404 });
  }
  return body({ error: "unexpected" }, { status: 500 });
}) as typeof fetch;
