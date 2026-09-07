import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { chunkMarkdown, Knowledge, parseFrontMatter } from "../src/knowledge.ts";

describe("knowledge folder", () => {
  test("front matter and heading chunks", () => {
    const { meta, body } = parseFrontMatter("---\ntitle: T\ntags: [a, b]\n---\n# H1\nintro\n## H2\nmore");
    expect(meta.title).toBe("T");
    expect(meta.tags).toEqual(["a", "b"]);
    const chunks = chunkMarkdown({ path: "x.md", title: "T", body });
    expect(chunks.map((chunk) => [chunk.heading, chunk.text])).toEqual([
      ["H1", "intro"],
      ["H2", "more"],
    ]);
  });

  test("indexes the shipped documents and finds the product API quirks", async () => {
    const knowledge = new Knowledge(join(import.meta.dir, "..", "knowledge"));
    expect(await knowledge.load()).toBeGreaterThanOrEqual(6);
    const hits = knowledge.search("available parameter ignored status endpoint");
    expect(hits[0]?.path).toBe("platform/product-api.md");
    expect(hits[0]?.snippet.toLowerCase()).toContain("status");
    expect(knowledge.get("terms/buying-terms.md")?.title).toBe("Buying terms and process");
    expect(knowledge.get("/terms/buying-terms.md")).toBeDefined();
    expect(knowledge.search("qwxzptlv")).toEqual([]);
  });
});
