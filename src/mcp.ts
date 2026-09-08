/**
 * The BEVMAQ MCP server: what every Claude surface (Claude Code, claude.ai, the apps,
 * artifacts, the buyer agent's managed-agents path) can ask about BEVMAQ.
 *
 * Tools are grouped by what they read:
 *   catalogue   search_listings, get_listing, catalog_status   (product.bevmaq.com, live)
 *   knowledge   search_knowledge, read_doc                     (the knowledge/ folder)
 *   repos       repo_map                                       (repos.yaml)
 *   deploys     deploy_status                                  (Vercel, when a token is set)
 *
 * Every doc is also an MCP resource (`bevmaq://docs/<path>`), and two prompts package the
 * recurring jobs: a machine brief for a buyer, and the Instagram ad brief for the designer.
 *
 * Tools that return data declare an outputSchema and return the same value as
 * structuredContent; the schemas live next to the types they describe (listings.ts,
 * knowledge.ts, vercel.ts), so the wire contract and the code cannot drift apart.
 */

import { McpServer, ResourceTemplate } from "@modelcontextprotocol/server";
import { z } from "zod";
import { HitSchema, type Knowledge } from "./knowledge.ts";
import { ListingSchema, ListingSummarySchema, summarize, toListing, type Listing } from "./listings.ts";
import type { ProductApi } from "./product-api.ts";
import { loadRepoMap, renderRepoMap } from "./repos.ts";
import { DeploymentSchema, ProjectSchema, type Vercel } from "./vercel.ts";

export interface Services {
  products: ProductApi;
  knowledge: Knowledge;
  vercel: Vercel;
  repoMapPath: string;
  version: string;
}

const CATEGORIES = [
  "filling",
  "labelling",
  "packaging",
  "palletizing",
  "blowmoulding-machines",
  "capping-decapping",
  "rinsing",
  "washing",
  "inspection",
  "tunnel-pasteurizer",
  "keg-technology",
  "brewing-fermenting",
  "process-technology",
  "complete-filling-lines",
  "carton-packing",
  "other-machinery",
] as const;

// -- result shapes (outputSchema) ---------------------------------------------------------

const SearchListingsOutput = z.object({
  total_matches: z.number(),
  showing: z.number(),
  results: z.array(ListingSummarySchema.extend({ available: z.boolean() })),
});

const CatalogStatusOutput = z.object({
  available: z.number(),
  sold_or_withdrawn: z.number(),
  per_category: z.record(z.string(), z.number()),
  newest: z.array(ListingSummarySchema),
  available_later: z.array(z.object({ sku: z.string(), title: z.string(), available: z.string() })),
  price_on_request: z.array(z.string()),
});

const SearchKnowledgeOutput = z.object({ hits: z.array(HitSchema) });

const DeployStatusOutput = z.object({
  project: z.string().nullable(),
  projects: z.array(ProjectSchema),
  deployments: z.array(DeploymentSchema),
});

// -- result helpers -----------------------------------------------------------------------

/** A data result: the value as structuredContent, plus a text block (the JSON unless given). */
function structured<T extends Record<string, unknown>>(value: T, text = JSON.stringify(value, null, 2)) {
  return { content: [{ type: "text" as const, text }], structuredContent: value };
}

function text(value: string) {
  return { content: [{ type: "text" as const, text: value }] };
}

function failure(message: string) {
  return { isError: true as const, content: [{ type: "text" as const, text: message }] };
}

/** Relevance for a free-text query: title, manufacturer, model, type and category matches weigh most; the description counts too. */
function score(listing: Listing, terms: string[]): number {
  if (!terms.length) return 1;
  const head = `${listing.title} ${listing.manufacturer} ${listing.model} ${listing.type} ${listing.category}`.toLowerCase();
  const body = `${listing.overview} ${Object.values(listing.specs).join(" ")} ${listing.containers.join(" ")} ${listing.beverages.join(" ")}`.toLowerCase();
  let points = 0;
  for (const term of terms) {
    if (head.includes(term)) points += 3;
    else if (body.includes(term)) points += 1;
  }
  return points;
}

const STOP = new Set(["the", "a", "an", "for", "with", "and", "or", "of", "to", "in", "machine", "machines", "used"]);

function terms(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[^a-z0-9äöüß.]+/)
    .map((term) => term.replace(/^(labeler|labeller|labelling|labeling)$/, "label").replace(/^(palletiser|palletizer|palletizing)$/, "pallet").replace(/^(pasteuriser|pasteurizer)$/, "pasteur").replace(/^(fillers?|filling)$/, "fill").replace(/s$/, ""))
    .filter((term) => term.length > 1 && !STOP.has(term));
}

/** Cache hints for the 2026-07-28 protocol: lists change only with a deploy, so clients may keep them a while. */
const LIST_CACHE = { ttlMs: 300_000, cacheScope: "private" as const };
const DOC_CACHE = { ttlMs: 60_000, cacheScope: "private" as const };

export function createMcpServer(services: Services): McpServer {
  const server = new McpServer(
    {
      name: "bevmaq",
      title: "BEVMAQ",
      version: services.version,
      description: "BEVMAQ's catalogue of used beverage machinery, internal knowledge, repository map and deploy state.",
      websiteUrl: "https://bevmaq.com",
    },
    {
      instructions:
        "BEVMAQ is a B2B marketplace for used beverage machinery (bevmaq.com). Prices are ExWorks in EUR excluding VAT; every machine can be inspected at its location. Use search_listings and get_listing for machines, search_knowledge and read_doc for how BEVMAQ's systems and processes work, repo_map before opening any BEVMAQ repository, and deploy_status for what is live on Vercel. Cite SKUs (like HR-FIL-GAI-2016-00001) whenever you name a machine.",
      cacheHints: {
        "tools/list": LIST_CACHE,
        "prompts/list": LIST_CACHE,
        "resources/list": LIST_CACHE,
        "resources/templates/list": LIST_CACHE,
        "server/discover": LIST_CACHE,
      },
    },
  );

  // -- catalogue ---------------------------------------------------------------------------

  server.registerTool(
    "search_listings",
    {
      title: "Search BEVMAQ listings",
      description:
        "Search the machines currently for sale on bevmaq.com. Free text matches title, manufacturer, model, type, category and the listing text; filters narrow by category slug, manufacturer, country, price (EUR, ExWorks), year, rated capacity per hour, and container (glass, PET, can, keg). Returns compact rows; call get_listing for a machine's full record.",
      inputSchema: z.object({
        query: z.string().default("").describe("Free text, e.g. 'isobarometric glass filler crown cork beer' or 'Krones labeller'"),
        category: z.enum(CATEGORIES).optional(),
        manufacturer: z.string().optional().describe("Manufacturer name, matched case-insensitively (KHS, Krones, GAI, Sidel)"),
        country: z.string().optional().describe("Where the machine stands, e.g. Germany"),
        container: z.string().optional().describe("glass, PET, can, keg, carton"),
        max_price: z.number().optional().describe("EUR, ExWorks"),
        min_price: z.number().optional(),
        min_year: z.number().int().optional(),
        min_capacity: z.number().optional().describe("Per hour, unit follows the machine (bottles/h, cans/h, hl/h); machines without a rated capacity are kept"),
        max_capacity: z.number().optional(),
        available_now: z.boolean().default(false).describe("Only machines that can ship immediately (no 'available from' date)"),
        include_sold: z.boolean().default(false).describe("Also return machines already sold (for history and price references)"),
        limit: z.number().int().min(1).max(50).default(10),
      }),
      outputSchema: SearchListingsOutput,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (input) => {
      const source = input.include_sold ? await services.products.allListings() : await services.products.availableListings();
      const wanted = terms(input.query);
      const rows = source
        .map(toListing)
        .filter((listing) => !input.category || listing.categorySlug === input.category)
        .filter((listing) => !input.manufacturer || listing.manufacturer.toLowerCase().includes(input.manufacturer.toLowerCase()))
        .filter((listing) => !input.country || listing.country.toLowerCase().includes(input.country.toLowerCase()))
        .filter((listing) => !input.container || listing.containers.some((item) => item.toLowerCase() === input.container?.toLowerCase()))
        .filter((listing) => input.max_price === undefined || (listing.price !== null && listing.price <= input.max_price))
        .filter((listing) => input.min_price === undefined || (listing.price !== null && listing.price >= input.min_price))
        .filter((listing) => input.min_year === undefined || (listing.year !== null && listing.year >= input.min_year))
        .filter((listing) => input.min_capacity === undefined || !listing.capacity || listing.capacity.value >= input.min_capacity)
        .filter((listing) => input.max_capacity === undefined || !listing.capacity || listing.capacity.value <= input.max_capacity)
        .filter((listing) => !input.available_now || listing.availableOn === null)
        .map((listing) => ({ listing, points: score(listing, wanted) }))
        .filter(({ points }) => points > 0)
        .sort((a, b) => b.points - a.points || (b.listing.year ?? 0) - (a.listing.year ?? 0));
      const results = rows.slice(0, input.limit).map(({ listing }) => ({ ...summarize(listing), available: listing.available }));
      return structured({ total_matches: rows.length, showing: results.length, results });
    },
  );

  server.registerTool(
    "get_listing",
    {
      title: "Get one BEVMAQ listing",
      description:
        "The full record for one machine by SKU (like HR-FIL-GAI-2016-00001): specs, rated capacity, containers and closures, the description by section (overview, technical data, equipment, condition, availability), photos, videos, documents, current price and availability, and the bevmaq.com URL.",
      inputSchema: z.object({ sku: z.string().describe("The SKU, case-insensitive") }),
      outputSchema: ListingSchema,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ sku }) => {
      const record = await services.products.listing(sku);
      if (!record) return failure(`No listing with SKU ${sku.toUpperCase()}.`);
      return structured(toListing(record));
    },
  );

  server.registerTool(
    "catalog_status",
    {
      title: "Catalogue status",
      description:
        "What is on bevmaq.com right now: available and sold counts, available machines per category, the newest listings, machines with a future availability date, and listings without a price. Cheap; call it before searching when you need the lay of the land.",
      inputSchema: z.object({ newest: z.number().int().min(0).max(30).default(8).describe("How many of the newest listings to include") }),
      outputSchema: CatalogStatusOutput,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ newest }) => {
      const [rows, available] = await Promise.all([services.products.statusRows(), services.products.availableListings()]);
      const listings = available.map(toListing);
      const perCategory: Record<string, number> = {};
      for (const listing of listings) perCategory[listing.category || "other"] = (perCategory[listing.category || "other"] ?? 0) + 1;
      const sorted = [...listings].sort((a, b) => (b.created ?? "").localeCompare(a.created ?? ""));
      return structured({
        available: listings.length,
        sold_or_withdrawn: rows.length - listings.length,
        per_category: Object.fromEntries(Object.entries(perCategory).sort((a, b) => b[1] - a[1])),
        newest: sorted.slice(0, newest).map(summarize),
        available_later: listings.filter((listing) => listing.availableOn).map((listing) => ({ sku: listing.sku, title: listing.title, available: listing.availability })),
        price_on_request: listings.filter((listing) => listing.price === null).map((listing) => listing.sku),
      });
    },
  );

  // -- knowledge -----------------------------------------------------------------------------

  server.registerTool(
    "search_knowledge",
    {
      title: "Search BEVMAQ knowledge",
      description:
        "Full-text search over BEVMAQ's internal knowledge: architecture, systems, processes, conventions, the product API, how the repositories fit together. Returns the best-matching passages with their document path; call read_doc for the whole document.",
      inputSchema: z.object({
        query: z.string().min(1),
        limit: z.number().int().min(1).max(20).default(6),
      }),
      outputSchema: SearchKnowledgeOutput,
      annotations: { readOnlyHint: true },
    },
    async ({ query, limit }) => {
      const hits = services.knowledge.search(query, limit);
      if (!hits.length) {
        return structured({ hits }, `Nothing in the knowledge folder matches "${query}". Documents available: ${services.knowledge.list().map((doc) => doc.path).join(", ") || "none yet"}.`);
      }
      return structured({ hits });
    },
  );

  server.registerTool(
    "read_doc",
    {
      title: "Read a knowledge document",
      description: "The full text of one knowledge document by path (as returned by search_knowledge or listed under the bevmaq://docs resources). Pass no path to list every document with its title and description.",
      inputSchema: z.object({ path: z.string().optional() }),
      annotations: { readOnlyHint: true },
    },
    async ({ path }) => {
      if (!path) return structured({ documents: services.knowledge.list() });
      const doc = services.knowledge.get(path);
      if (!doc) return failure(`No document at ${path}. Known: ${services.knowledge.list().map((item) => item.path).join(", ")}`);
      return text(`# ${doc.title}\n\n${doc.description ? `${doc.description}\n\n` : ""}${doc.body.trim()}`);
    },
  );

  // -- repos ----------------------------------------------------------------------------------

  server.registerTool(
    "repo_map",
    {
      title: "BEVMAQ repository map",
      description: "Which BEVMAQ repository does what: purpose, stack, where it runs, how to start it, what it talks to, how it deploys. Read this before opening a repository or wiring two systems together.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true },
    },
    async () => text(renderRepoMap(await loadRepoMap(services.repoMapPath)) || "repos.yaml is empty."),
  );

  // -- deploys --------------------------------------------------------------------------------

  server.registerTool(
    "deploy_status",
    {
      title: "Vercel deploy status",
      description: "Recent Vercel deployments for the BEVMAQ team: state, target, branch, commit message, timing. Pass a project name to narrow; leave it empty to list the projects and the latest deployments across the team.",
      inputSchema: z.object({
        project: z.string().optional().describe("Vercel project name"),
        limit: z.number().int().min(1).max(20).default(5),
      }),
      outputSchema: DeployStatusOutput,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ project, limit }) => {
      if (!services.vercel.configured) return failure("Vercel is not configured on this server: set VERCEL_TOKEN (and VERCEL_TEAM_ID) to enable deploy_status.");
      const deployments = await services.vercel.deployments(project, limit);
      const projects = project ? [] : await services.vercel.projects();
      return structured({ project: project ?? null, projects, deployments });
    },
  );

  // -- resources -------------------------------------------------------------------------------

  server.registerResource(
    "knowledge-doc",
    new ResourceTemplate("bevmaq://docs/{+path}", {
      list: () => ({
        resources: services.knowledge.list().map((doc) => ({
          uri: `bevmaq://docs/${doc.path}`,
          name: doc.title,
          description: doc.description || undefined,
          mimeType: "text/markdown",
        })),
      }),
    }),
    { title: "BEVMAQ knowledge documents", description: "One markdown document from the knowledge folder", mimeType: "text/markdown", cacheHint: DOC_CACHE },
    (uri, { path }) => {
      const doc = services.knowledge.get(String(path));
      if (!doc) throw new Error(`No document at ${String(path)}`);
      return { contents: [{ uri: uri.href, mimeType: "text/markdown", text: doc.body }] };
    },
  );

  server.registerResource(
    "repo-map",
    "bevmaq://repos",
    { title: "BEVMAQ repository map", description: "repos.yaml rendered as markdown", mimeType: "text/markdown", cacheHint: DOC_CACHE },
    async (uri) => ({ contents: [{ uri: uri.href, mimeType: "text/markdown", text: renderRepoMap(await loadRepoMap(services.repoMapPath)) }] }),
  );

  // -- prompts ----------------------------------------------------------------------------------

  server.registerPrompt(
    "machine_brief",
    {
      title: "Brief a machine for a buyer",
      description: "A plain, complete summary of one listed machine for a buyer: what it is, what it runs, capacity, condition, what is included, availability, price basis, and what to check at an inspection.",
      argsSchema: z.object({ sku: z.string().describe("The machine's SKU") }),
    },
    ({ sku }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Call get_listing for SKU ${sku.toUpperCase()} and write a buyer's brief from the listing only: what the machine is and what it runs (product, container, closure, formats), rated capacity as listed, year, condition and hours, what is included and not included, availability and location, and the price with its basis (ExWorks, excl. VAT; transport and customs quoted separately). Close with five things to check at an on-site inspection for this machine type. Cite the SKU. Do not add specs the listing does not state.`,
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    "ad_brief",
    {
      title: "Instagram ad brief for a machine",
      description: "The creative brief the designer works from for one machine: hooks, DE and EN copy, the facts that must appear, which photos to use, hashtags and a CTA. BEVMAQ's voice, no AI vendor mentioned.",
      argsSchema: z.object({
        sku: z.string().describe("The machine's SKU"),
        channel: z.enum(["instagram_feed", "instagram_story", "linkedin"]).optional().describe("Defaults to instagram_feed"),
      }),
    },
    ({ sku, channel }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: [
              `Call get_listing for SKU ${sku.toUpperCase()}. Then write a creative brief for a ${channel ?? "instagram_feed"} ad for this machine, for BEVMAQ's designer.`,
              "",
              "Include: (1) three hook lines, each under 60 characters; (2) primary copy in German and in English, in the register bevmaq.com itself uses, each under 120 words, built on the listed facts only: manufacturer and model, year, rated capacity, containers and formats, condition, availability, ExWorks price; (3) the three facts that must be visible in the visual; (4) which listing photos to use, by perspective, and a crop suggestion per placement; (5) a CTA that points at the listing URL; (6) ten hashtags for the beverage-machinery trade; (7) a one-line note on what not to claim.",
              "",
              "Voice: BEVMAQ, an expert trader of used beverage machinery: precise, plain, confident, no hype. Never mention any AI tool or vendor. Cite the SKU in the brief.",
            ].join("\n"),
          },
        },
      ],
    }),
  );

  return server;
}
