/** One place that builds the services the server runs on, from the environment. */

import { join } from "node:path";
import { Knowledge } from "./knowledge.ts";
import type { Services } from "./mcp.ts";
import { ProductApi } from "./product-api.ts";
import { Vercel } from "./vercel.ts";

export const ROOT = join(import.meta.dirname, "..");
export const VERSION = "0.2.0";

export async function buildServices(overrides: Partial<Services> = {}): Promise<Services> {
  const knowledge = overrides.knowledge ?? new Knowledge(process.env.BMCP_KNOWLEDGE_DIR ?? join(ROOT, "knowledge"));
  if (!overrides.knowledge) await knowledge.load();
  return {
    products: overrides.products ?? new ProductApi(),
    knowledge,
    vercel: overrides.vercel ?? new Vercel(),
    repoMapPath: overrides.repoMapPath ?? process.env.BMCP_REPOS_FILE ?? join(ROOT, "repos.yaml"),
    version: overrides.version ?? VERSION,
  };
}
