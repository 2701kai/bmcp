/** A real MCP client against the Hono app over HTTP, with the product API stubbed. */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { join } from "node:path";
import { createApp } from "../src/http.ts";
import { Knowledge } from "../src/knowledge.ts";
import { ProductApi } from "../src/product-api.ts";
import { Vercel } from "../src/vercel.ts";
import { calls, fakeFetch, GAI } from "./helpers.ts";

let server: ReturnType<typeof Bun.serve>;
let url: string;

/** The first text block of a tool result. */
function firstText(result: unknown): string {
  const content = (result as { content?: { type: string; text?: string }[] }).content ?? [];
  return content.find((block) => block.type === "text")?.text ?? "";
}

async function connect(token?: string): Promise<Client> {
  const client = new Client({ name: "test", version: "0" });
  const transport = new StreamableHTTPClientTransport(new URL(url), token ? { requestInit: { headers: { Authorization: `Bearer ${token}` } } } : undefined);
  await client.connect(transport);
  return client;
}

beforeAll(async () => {
  const knowledge = new Knowledge(join(import.meta.dir, "..", "knowledge"));
  await knowledge.load();
  const app = createApp(
    {
      products: new ProductApi({ fetch: fakeFetch, baseUrl: "https://product.bevmaq.com/v1/" }),
      knowledge,
      vercel: new Vercel("", ""),
      repoMapPath: join(import.meta.dir, "..", "repos.yaml"),
      version: "test",
    },
    ["secret-token"],
  );
  server = Bun.serve({ port: 0, fetch: app.fetch });
  url = `http://localhost:${server.port}/mcp`;
});

afterAll(() => server.stop(true));

describe("bevmaq MCP over HTTP", () => {
  test("refuses without the bearer token", async () => {
    const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    expect(response.status).toBe(401);
    await expect(connect()).rejects.toThrow();
  });

  test("lists tools, resources and prompts", async () => {
    const client = await connect("secret-token");
    const tools = (await client.listTools()).tools;
    expect(tools.map((tool) => tool.name).sort()).toEqual(["catalog_status", "deploy_status", "get_listing", "read_doc", "repo_map", "search_knowledge", "search_listings"]);
    expect(tools.find((tool) => tool.name === "get_listing")?.outputSchema).toBeDefined();
    expect(tools.find((tool) => tool.name === "search_listings")?.annotations?.readOnlyHint).toBe(true);
    const prompts = (await client.listPrompts()).prompts.map((prompt) => prompt.name).sort();
    expect(prompts).toEqual(["ad_brief", "machine_brief"]);
    const resources = await client.listResources();
    expect(resources.resources.some((resource) => resource.uri === "bevmaq://repos")).toBe(true);
    expect(resources.resources.some((resource) => resource.uri === "bevmaq://docs/platform/product-api.md")).toBe(true);
    await client.close();
  });

  test("searches listings with filters and reads one in full", async () => {
    const client = await connect("secret-token");
    const search = await client.callTool({ name: "search_listings", arguments: { query: "glass filler crown cork beer", max_price: 100000, container: "glass" } });
    const payload = search.structuredContent as { total_matches: number; results: { sku: string; price: string }[] };
    expect(payload.results[0]?.sku).toBe(GAI);
    expect(payload.results[0]?.price).toContain("89,000");
    expect(payload.results.some((row) => row.sku === "NL-OTH-CER-2016-00001")).toBe(false); // sold

    const sold = await client.callTool({ name: "search_listings", arguments: { query: "steam generator", include_sold: true } });
    expect((sold.structuredContent as { results: { sku: string }[] }).results[0]?.sku).toBe("NL-OTH-CER-2016-00001");

    const empty = await client.callTool({ name: "search_listings", arguments: { query: "labeller", available_now: true, category: "labelling" } });
    expect((empty.structuredContent as { results: { sku: string }[] }).results.map((row) => row.sku)).toEqual(["DE-LAB-GER-2020-00001"]);

    const one = await client.callTool({ name: "get_listing", arguments: { sku: GAI.toLowerCase() } });
    const listing = one.structuredContent as { sku: string; capacity: { value: number }; images: unknown[]; specs: Record<string, string> };
    expect(listing.sku).toBe(GAI);
    expect(listing.capacity.value).toBe(1300);
    expect(listing.images.length).toBe(13);
    expect(listing.specs["Crown caps"]).toBe("26 mm and 29 mm");

    const missing = await client.callTool({ name: "get_listing", arguments: { sku: "XX-NOP-EEE-2000-00001" } });
    expect(missing.isError).toBe(true);

    const status = await client.callTool({ name: "catalog_status", arguments: { newest: 2 } });
    const summary = status.structuredContent as { available: number; sold_or_withdrawn: number; price_on_request: string[] };
    expect(summary.available).toBe(3);
    expect(summary.sold_or_withdrawn).toBe(1);
    expect(summary.price_on_request).toEqual(["FR-BLO-SID-2006-00001"]);
    await client.close();
  });

  test("knowledge, repo map, deploy status and prompts", async () => {
    const client = await connect("secret-token");
    const hits = await client.callTool({ name: "search_knowledge", arguments: { query: "ExWorks VAT customs" } });
    expect((hits.structuredContent as { hits: { path: string }[] }).hits[0]?.path).toBe("terms/buying-terms.md");
    const doc = await client.callTool({ name: "read_doc", arguments: { path: "projects/bmcp.md" } });
    expect(firstText(doc)).toContain("search_listings");
    const map = await client.callTool({ name: "repo_map", arguments: {} });
    expect(firstText(map)).toContain("## bmi_shopping");
    const deploys = await client.callTool({ name: "deploy_status", arguments: {} });
    expect(deploys.isError).toBe(true);
    expect(firstText(deploys)).toContain("VERCEL_TOKEN");
    const brief = await client.getPrompt({ name: "ad_brief", arguments: { sku: GAI, channel: "instagram_story" } });
    expect((brief.messages[0]?.content as { text: string }).text).toContain(GAI);
    const resource = await client.readResource({ uri: "bevmaq://docs/platform/product-api.md" });
    expect((resource.contents[0] as { text: string }).text).toContain("/v1/status/");
    await client.close();
  });

  test("serves 2025-era clients statelessly", async () => {
    const post = (body: unknown) =>
      fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json, text/event-stream", authorization: "Bearer secret-token" },
        body: JSON.stringify(body),
      });
    const init = await post({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "legacy", version: "0" } } });
    expect(init.status).toBe(200);
    expect(init.headers.get("mcp-session-id")).toBeNull();
    expect(await init.text()).toContain('"protocolVersion":"2025-11-25"');
    const list = await post({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
    expect(list.status).toBe(200);
    expect(await list.text()).toContain("search_listings");
  });

  test("caches the product API between calls", async () => {
    const statusCalls = calls.filter((call) => call.startsWith("/v1/status/")).length;
    expect(statusCalls).toBeLessThanOrEqual(2);
  });
});
