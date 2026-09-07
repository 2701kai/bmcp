/**
 * The repo map: `repos.yaml` at the repo root, one entry per BEVMAQ repository with what
 * it is, where it lives, how it runs, and what it talks to. Claude Code reads it once per
 * session to know which repo does what before it opens any of them.
 */

import { readFile } from "node:fs/promises";
import { parse } from "yaml";

export interface RepoEntry {
  name: string;
  purpose: string;
  url?: string;
  host?: string;
  stack?: string[];
  runs?: string;
  entry?: string;
  talks_to?: string[];
  deploy?: string;
  vercel_project?: string;
  status?: string;
  notes?: string;
}

export interface RepoMap {
  organisation?: string;
  updated?: string;
  repos: RepoEntry[];
}

export async function loadRepoMap(path: string): Promise<RepoMap> {
  const raw = await readFile(path, "utf8").catch(() => "");
  const parsed = raw ? (parse(raw) as Partial<RepoMap> | null) : null;
  return { organisation: parsed?.organisation, updated: parsed?.updated, repos: parsed?.repos ?? [] };
}

export function renderRepoMap(map: RepoMap): string {
  const lines: string[] = [];
  if (map.organisation) lines.push(`# ${map.organisation}: repositories`);
  if (map.updated) lines.push(`Updated ${map.updated}`);
  for (const repo of map.repos) {
    lines.push("", `## ${repo.name}${repo.status ? ` (${repo.status})` : ""}`, repo.purpose);
    if (repo.url) lines.push(`- Source: ${repo.url}`);
    if (repo.host) lines.push(`- Runs at: ${repo.host}`);
    if (repo.stack?.length) lines.push(`- Stack: ${repo.stack.join(", ")}`);
    if (repo.runs) lines.push(`- Run locally: ${repo.runs}`);
    if (repo.entry) lines.push(`- Entry point: ${repo.entry}`);
    if (repo.talks_to?.length) lines.push(`- Talks to: ${repo.talks_to.join(", ")}`);
    if (repo.deploy) lines.push(`- Deploy: ${repo.deploy}`);
    if (repo.notes) lines.push(`- Notes: ${repo.notes}`);
  }
  return lines.join("\n").trim();
}
