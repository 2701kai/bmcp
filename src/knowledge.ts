/**
 * The knowledge folder: markdown files under `knowledge/`, split at headings into chunks
 * and indexed with MiniSearch (BM25-style ranking, prefix and fuzzy matching). Small on
 * purpose: a few hundred documents index in milliseconds at start-up, no database.
 *
 * A file may start with YAML front matter (`title`, `description`, `tags`); otherwise the
 * first `# heading` is the title and the path is the fallback.
 */

import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import MiniSearch from "minisearch";
import { z } from "zod";

export interface Doc {
  /** Path relative to the knowledge root, forward slashes, e.g. `platform/product-api.md`. */
  path: string;
  title: string;
  description: string;
  tags: string[];
  body: string;
  updated: string;
}

export interface Chunk {
  id: string;
  path: string;
  title: string;
  heading: string;
  text: string;
}

/** One search hit; also the outputSchema row of search_knowledge. */
export const HitSchema = z.object({
  path: z.string(),
  title: z.string(),
  heading: z.string(),
  score: z.number(),
  snippet: z.string(),
});
export type Hit = z.infer<typeof HitSchema>;

const FRONT_MATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

export function parseFrontMatter(raw: string): { meta: Record<string, string | string[]>; body: string } {
  const match = FRONT_MATTER.exec(raw);
  if (!match) return { meta: {}, body: raw };
  const meta: Record<string, string | string[]> = {};
  for (const line of (match[1] ?? "").split(/\r?\n/)) {
    const pair = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line);
    if (!pair || !pair[1]) continue;
    const value = (pair[2] ?? "").trim();
    if (value.startsWith("[") && value.endsWith("]")) {
      meta[pair[1]] = value
        .slice(1, -1)
        .split(",")
        .map((item) => item.trim().replace(/^["']|["']$/g, ""))
        .filter(Boolean);
    } else {
      meta[pair[1]] = value.replace(/^["']|["']$/g, "");
    }
  }
  return { meta, body: raw.slice(match[0].length) };
}

/** Split a markdown body at `#`..`###` headings; the text before the first heading is its own chunk. */
export function chunkMarkdown(doc: Pick<Doc, "path" | "title" | "body">): Chunk[] {
  const chunks: Chunk[] = [];
  let heading = "";
  let buffer: string[] = [];
  const flush = () => {
    const text = buffer.join("\n").trim();
    if (text) chunks.push({ id: `${doc.path}#${chunks.length}`, path: doc.path, title: doc.title, heading, text });
    buffer = [];
  };
  for (const line of doc.body.split(/\r?\n/)) {
    const match = /^(#{1,3})\s+(.*)$/.exec(line);
    if (match) {
      flush();
      heading = (match[2] ?? "").trim();
    } else {
      buffer.push(line);
    }
  }
  flush();
  return chunks;
}

async function walk(root: string): Promise<string[]> {
  const files: string[] = [];
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    const full = join(root, entry.name);
    if (entry.name.startsWith(".")) continue;
    if (entry.isDirectory()) files.push(...(await walk(full)));
    else if (/\.(md|markdown)$/i.test(entry.name)) files.push(full);
  }
  return files.sort();
}

export class Knowledge {
  readonly root: string;
  private docs = new Map<string, Doc>();
  private index = this.newIndex();

  constructor(root: string) {
    this.root = root;
  }

  private newIndex(): MiniSearch<Chunk> {
    return new MiniSearch<Chunk>({
      fields: ["title", "heading", "text"],
      storeFields: ["path", "title", "heading", "text"],
      searchOptions: { boost: { title: 3, heading: 2 }, prefix: true, fuzzy: 0.15, combineWith: "AND" },
    });
  }

  /** Read every markdown file under the root and rebuild the index. */
  async load(): Promise<number> {
    const docs = new Map<string, Doc>();
    for (const file of await walk(this.root)) {
      const raw = await readFile(file, "utf8");
      const { meta, body } = parseFrontMatter(raw);
      const path = relative(this.root, file).split(sep).join("/");
      const firstHeading = /^#\s+(.*)$/m.exec(body)?.[1]?.trim();
      const title = (typeof meta.title === "string" && meta.title) || firstHeading || path;
      const tags = Array.isArray(meta.tags) ? meta.tags : typeof meta.tags === "string" && meta.tags ? [meta.tags] : [];
      docs.set(path, {
        path,
        title,
        description: typeof meta.description === "string" ? meta.description : "",
        tags,
        body,
        updated: (await stat(file)).mtime.toISOString(),
      });
    }
    const index = this.newIndex();
    for (const doc of docs.values()) index.addAll(chunkMarkdown(doc));
    this.docs = docs;
    this.index = index;
    return docs.size;
  }

  list(): Omit<Doc, "body">[] {
    return [...this.docs.values()].map(({ body: _body, ...rest }) => rest);
  }

  get(path: string): Doc | undefined {
    return this.docs.get(path.replace(/^\/+/, "").replace(/\\/g, "/"));
  }

  search(query: string, limit = 6): Hit[] {
    const results = this.index.search(query);
    // Fall back to OR when the AND query finds nothing, so a long question still returns something.
    const ranked = results.length ? results : this.index.search(query, { combineWith: "OR" });
    return ranked.slice(0, limit).map((result) => {
      const text = String(result.text ?? "");
      return {
        path: String(result.path),
        title: String(result.title),
        heading: String(result.heading ?? ""),
        score: Math.round(result.score * 100) / 100,
        snippet: snippetFor(text, query),
      };
    });
  }
}

/** About 400 characters around the first query term found, else the chunk start. */
export function snippetFor(text: string, query: string, width = 400): string {
  const flat = text.replace(/\s+/g, " ").trim();
  const terms = query.toLowerCase().split(/\W+/).filter((term) => term.length > 2);
  let at = -1;
  for (const term of terms) {
    at = flat.toLowerCase().indexOf(term);
    if (at >= 0) break;
  }
  const start = Math.max(0, at < 0 ? 0 : at - Math.floor(width / 3));
  const piece = flat.slice(start, start + width);
  return `${start > 0 ? "…" : ""}${piece}${start + width < flat.length ? "…" : ""}`;
}

if (import.meta.main) {
  const root = process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : join(import.meta.dirname, "..", "knowledge");
  const knowledge = new Knowledge(root);
  const count = await knowledge.load();
  console.log(`${count} documents under ${root}`);
  for (const doc of knowledge.list()) console.log(`  ${doc.path}  (${doc.title})`);
}
