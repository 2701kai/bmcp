/**
 * Reading a BEVMAQ listing the way a buyer does. The description HTML is sectioned
 * (Overview, Technical data, Equipment, Condition, Availability, ...); this turns it into
 * plain sections, key: value specs, a rated capacity per hour, and the containers and
 * closures the machine runs, so a tool result carries facts instead of markup.
 */

import type { ApiListing } from "./product-api.ts";

export interface Section {
  heading: string;
  lines: string[];
}

export interface Capacity {
  value: number;
  unit: string;
}

export interface Listing {
  sku: string;
  title: string;
  manufacturer: string;
  model: string;
  category: string;
  categorySlug: string;
  type: string;
  country: string;
  year: number | null;
  price: number | null;
  currency: string;
  priceBasis: "ExWorks, excl. VAT";
  available: boolean;
  availability: string;
  availableOn: string | null;
  capacity: Capacity | null;
  containers: string[];
  closures: string[];
  beverages: string[];
  formats: string | null;
  overview: string;
  specs: Record<string, string>;
  sections: Section[];
  url: string;
  thumbnail: string | null;
  images: { url: string; perspective: string | null }[];
  videos: string[];
  documents: string[];
  created: string | null;
  lastUpdated: string | null;
}

const SITE = "https://www.bevmaq.com";
const SPEC_HEADINGS = new Set(["technical data", "technical details", "technical specifications", "specifications", "specification"]);
const OVERVIEW_HEADINGS = new Set(["overview", "description"]);

const UNITS: Record<string, string> = {
  bph: "bottles/h",
  "b/h": "bottles/h",
  "bottles/h": "bottles/h",
  "bottles/hour": "bottles/h",
  "bottles per hour": "bottles/h",
  "cans/h": "cans/h",
  "cans/hour": "cans/h",
  "cans per hour": "cans/h",
  cph: "cans/h",
  "containers/h": "containers/h",
  "containers/hour": "containers/h",
  "containers per hour": "containers/h",
  "units/h": "units/h",
  "units/hour": "units/h",
  "kegs/h": "kegs/h",
  "kegs/hour": "kegs/h",
  "kegs per hour": "kegs/h",
  "l/h": "l/h",
  "litres/h": "l/h",
  "liters/h": "l/h",
  "hl/h": "hl/h",
  "packs/h": "packs/h",
  "cases/h": "cases/h",
  "layers/h": "layers/h",
  "pallets/h": "pallets/h",
  "pallets/hour": "pallets/h",
  "cycles/h": "cycles/h",
  "cycles/min": "cycles/min",
  "bottles/min": "bottles/min",
  bpm: "bottles/min",
};
const UNIT_PATTERN = Object.keys(UNITS)
  .sort((a, b) => b.length - a.length)
  .map((unit) => unit.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&"))
  .join("|");
const CAPACITY_RE = new RegExp(`(\\d{1,3}(?:[.,]\\d{3})+|\\d+(?:[.,]\\d+)?)\\s*(?:x\\s*\\d+\\s*)?(${UNIT_PATTERN})\\b`, "gi");

const CONTAINER_TERMS: [string, RegExp][] = [
  ["glass", /\bglass\b/],
  ["PET", /\bpet\b/],
  ["can", /\bcans\b|\bcan[- ](?:fill|seam|line|rins|format|size|end|body|packag)|\b(?:slim|sleek|aluminium|aluminum|beverage) cans?\b/],
  ["keg", /\bkegs?\b/],
  ["carton", /\bcartons?\b|\btetra/],
  ["bag-in-box", /bag[- ]in[- ]box/],
  ["pouch", /\bpouch/],
];
const CLOSURE_TERMS: [string, RegExp][] = [
  ["crown cork", /crown[- ](?:cap|cork)/],
  ["screw cap", /screw[- ]cap|\bpco\b|\b1881\b|\b1810\b|\b28\s?mm\b|\b38\s?mm\b/],
  ["ROPP", /\bropp\b|\baluminium cap|\baluminum cap/],
  ["cork", /\bnatural cork|\bstopper/],
  ["swing top", /swing[- ]top|flip[- ]top/],
  ["sports cap", /sports? cap/],
];
const BEVERAGE_TERMS: [string, RegExp][] = [
  ["beer", /\bbeer\b|\bbrewer/],
  ["water", /\bwater\b/],
  ["soft drinks", /soft[- ]drinks?|\bcsd\b|\bcarbonated/],
  ["wine", /\bwine\b|\bsekt\b/],
  ["spirits", /\bspirits?\b|\bliquor|\bwhisk|\bvodka|\bgin\b/],
  ["juice", /\bjuices?\b/],
  ["dairy", /\bdairy\b|\bmilk\b/],
  ["cider", /\bcider\b/],
];

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", auml: "ä", ouml: "ö", uuml: "ü", Auml: "Ä", Ouml: "Ö", Uuml: "Ü", szlig: "ß", deg: "°", rsquo: "’", lsquo: "‘", ndash: "–", mdash: "—", eacute: "é", egrave: "è" };

export function decodeEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, code: string) => {
    if (code.startsWith("#x") || code.startsWith("#X")) return String.fromCodePoint(Number.parseInt(code.slice(2), 16));
    if (code.startsWith("#")) return String.fromCodePoint(Number.parseInt(code.slice(1), 10));
    return ENTITIES[code] ?? match;
  });
}

/** The description HTML as `(heading, lines)` sections; a `<strong>` paragraph or an `<h*>` is a heading. */
export function parseSections(html: string): Section[] {
  const sections: Section[] = [];
  let current: Section = { heading: "", lines: [] };
  const push = (text: string, heading: boolean) => {
    const clean = decodeEntities(text.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
    if (!clean) return;
    if (heading && clean.length <= 60) {
      if (current.heading || current.lines.length) sections.push(current);
      current = { heading: clean.replace(/:$/, ""), lines: [] };
    } else {
      current.lines.push(clean);
    }
  };
  const blocks = html.split(/(?=<(?:p|li|h[1-4]|div|tr)\b)|(?<=<\/(?:p|li|h[1-4]|div|tr)>)|<br\s*\/?>/i);
  for (const block of blocks) {
    const tag = /^<(p|li|h[1-4]|div|tr)\b/i.exec(block)?.[1]?.toLowerCase();
    const inner = block.replace(/^<[^>]+>/, "").replace(/<\/[^>]+>\s*$/, "");
    const strongOnly = /^\s*<(?:strong|b)>[\s\S]*<\/(?:strong|b)>\s*$/i.test(inner);
    push(inner, Boolean(tag && (tag.startsWith("h") || strongOnly)));
  }
  if (current.heading || current.lines.length) sections.push(current);
  return sections;
}

export function keyValue(line: string): [string, string] | null {
  const match = /^([A-Za-z][A-Za-z0-9 ()/.,&+'-]{1,48}?)\s*:\s+(.+)$/.exec(line);
  if (!match || !match[1] || !match[2]) return null;
  const key = match[1].trim();
  if (/^notes?$/i.test(key)) return null;
  return [key, match[2].trim()];
}

/** The largest rated output named in the text; thousands separators handled, typos skipped. */
export function parseCapacity(text: string): Capacity | null {
  let best: Capacity | null = null;
  for (const match of text.matchAll(CAPACITY_RE)) {
    const raw = match[1] ?? "";
    const unitKey = (match[2] ?? "").toLowerCase();
    let number: string;
    if (/^\d{1,3}(?:[.,]\d{3})+$/.test(raw)) number = raw.replace(/[.,]/g, "");
    else if (/[.,]\d{4,}/.test(raw)) continue;
    else number = raw.replace(",", ".");
    let value = Math.trunc(Number(number));
    let unit = UNITS[unitKey] ?? unitKey;
    if (!Number.isFinite(value)) continue;
    if (unit.endsWith("/min")) {
      value *= 60;
      unit = unit.replace("/min", "/h");
    }
    if (value < 10) continue;
    if (!best || value > best.value) best = { value, unit };
  }
  return best;
}

function termsIn(text: string, table: [string, RegExp][]): string[] {
  const lowered = text.toLowerCase();
  return table.filter(([, pattern]) => pattern.test(lowered)).map(([label]) => label);
}

function availabilityOf(raw: string | null | undefined): { line: string; on: string | null } {
  if (!raw) return { line: "immediately", on: null };
  const dmy = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(raw);
  const iso = dmy ? `${dmy[3]}-${dmy[2]}-${dmy[1]}` : /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
  if (!iso) return { line: `from ${raw}`, on: null };
  const date = new Date(`${iso}T00:00:00Z`);
  const pretty = date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  return { line: `from ${pretty}`, on: iso };
}

export function toListing(record: ApiListing): Listing {
  const sections = parseSections(record.description ?? "");
  const fullText = sections.flatMap((section) => [section.heading, ...section.lines]).join(" ");
  const specs: Record<string, string> = {};
  const overview: string[] = [];
  for (const section of sections) {
    const heading = section.heading.toLowerCase();
    if (SPEC_HEADINGS.has(heading)) {
      for (const line of section.lines) {
        const pair = keyValue(line);
        if (pair && !(pair[0] in specs)) specs[pair[0]] = pair[1];
      }
    } else if (OVERVIEW_HEADINGS.has(heading) || !section.heading) {
      overview.push(...section.lines);
    }
  }
  const ratedLines = Object.entries(specs)
    .filter(([key]) => /capacity|output|performance|speed|rated/i.test(key))
    .map(([, value]) => value)
    .join(" ");
  const capacity = parseCapacity(ratedLines) ?? parseCapacity(overview.join(" ")) ?? parseCapacity(fullText);
  const type = record.type?.name ?? "";
  const availability = availabilityOf(record.available_from);
  const formatsKey = ["Bottle formats", "Formats", "Container sizes", "Bottle sizes", "Volume"].find((key) => key in specs);
  return {
    sku: record.sku,
    title: record.title,
    manufacturer: record.model?.manufacturer?.name ?? "",
    model: record.model?.name ?? "",
    category: record.category?.name ?? "",
    categorySlug: record.category?.slug ?? "",
    type,
    country: record.country?.name ?? "",
    year: record.year ?? null,
    price: record.price?.amount ?? null,
    currency: record.price?.currency ?? "EUR",
    priceBasis: "ExWorks, excl. VAT",
    available: record.available ?? true,
    availability: availability.line,
    availableOn: availability.on,
    capacity,
    containers: termsIn(`${type} ${fullText}`, CONTAINER_TERMS),
    closures: termsIn(fullText, CLOSURE_TERMS),
    beverages: termsIn(fullText, BEVERAGE_TERMS),
    formats: formatsKey ? (specs[formatsKey] ?? null) : null,
    overview: overview.join(" "),
    specs,
    sections,
    url: `${SITE}/buy/${record.slug}/`,
    thumbnail: record.thumbnail_image ?? null,
    images: (record.images ?? []).map((image) => ({ url: image.url, perspective: image.perspective ?? null })),
    videos: (record.videos ?? []).map((video) => video.url),
    documents: (record.documents ?? []).map((document) => document.url),
    created: record.created ?? null,
    lastUpdated: record.last_updated ?? null,
  };
}

/** The one-line form search results use. */
export function summarize(listing: Listing): Record<string, unknown> {
  return {
    sku: listing.sku,
    title: listing.title,
    manufacturer: listing.manufacturer,
    type: listing.type,
    category: listing.category,
    year: listing.year,
    country: listing.country,
    price: listing.price === null ? "on request" : `${listing.currency} ${listing.price.toLocaleString("en-US")} (${listing.priceBasis})`,
    capacity: listing.capacity ? `${listing.capacity.value.toLocaleString("en-US")} ${listing.capacity.unit}` : null,
    containers: listing.containers.length ? listing.containers.join(", ") : null,
    availability: listing.availability,
    url: listing.url,
  };
}
