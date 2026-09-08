/**
 * Deploy state from the Vercel REST API. Optional: without `VERCEL_TOKEN` the tool says
 * so instead of failing. `VERCEL_TEAM_ID` scopes every call to the BEVMAQ team.
 */

import { z } from "zod";

/** One deployment as deploy_status returns it; also its outputSchema row. */
export const DeploymentSchema = z.object({
  project: z.string(),
  state: z.string(),
  target: z.string(),
  url: z.string(),
  branch: z.string().nullable(),
  commit: z.string().nullable(),
  created: z.string(),
  ready: z.string().nullable(),
  durationSeconds: z.number().nullable(),
});
export type Deployment = z.infer<typeof DeploymentSchema>;

export const ProjectSchema = z.object({ name: z.string(), framework: z.string().nullable(), updated: z.string().nullable() });
export type Project = z.infer<typeof ProjectSchema>;

interface VercelDeployment {
  uid: string;
  name: string;
  url: string;
  state?: string;
  readyState?: string;
  target?: string | null;
  created: number;
  ready?: number;
  buildingAt?: number;
  meta?: Record<string, string>;
}

interface VercelProject {
  id: string;
  name: string;
  framework?: string | null;
  updatedAt?: number;
  latestDeployments?: VercelDeployment[];
}

const API = "https://api.vercel.com";

export class Vercel {
  private readonly token: string;
  private readonly teamId: string;
  private readonly fetchImpl: typeof fetch;

  constructor(token = process.env.VERCEL_TOKEN ?? "", teamId = process.env.VERCEL_TEAM_ID ?? "", fetchImpl: typeof fetch = fetch) {
    this.token = token;
    this.teamId = teamId;
    this.fetchImpl = fetchImpl;
  }

  get configured(): boolean {
    return Boolean(this.token);
  }

  private async get<T>(path: string, params: Record<string, string | number> = {}): Promise<T> {
    const url = new URL(path, API);
    if (this.teamId) url.searchParams.set("teamId", this.teamId);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
    const response = await this.fetchImpl(url, { headers: { Authorization: `Bearer ${this.token}` } });
    if (!response.ok) throw new Error(`Vercel API ${response.status} for ${url.pathname}`);
    return (await response.json()) as T;
  }

  async projects(): Promise<Project[]> {
    const data = await this.get<{ projects: VercelProject[] }>("/v9/projects", { limit: 100 });
    return data.projects.map((project) => ({
      name: project.name,
      framework: project.framework ?? null,
      updated: project.updatedAt ? new Date(project.updatedAt).toISOString() : null,
    }));
  }

  async deployments(project?: string, limit = 5): Promise<Deployment[]> {
    const params: Record<string, string | number> = { limit };
    if (project) params.app = project;
    const data = await this.get<{ deployments: VercelDeployment[] }>("/v6/deployments", params);
    return data.deployments.map((deployment) => ({
      project: deployment.name,
      state: (deployment.readyState ?? deployment.state ?? "UNKNOWN").toUpperCase(),
      target: deployment.target ?? "preview",
      url: `https://${deployment.url}`,
      branch: deployment.meta?.githubCommitRef ?? deployment.meta?.gitlabCommitRef ?? deployment.meta?.bitbucketCommitRef ?? null,
      commit: deployment.meta?.githubCommitMessage ?? deployment.meta?.gitlabCommitMessage ?? deployment.meta?.bitbucketCommitMessage ?? null,
      created: new Date(deployment.created).toISOString(),
      ready: deployment.ready ? new Date(deployment.ready).toISOString() : null,
      durationSeconds: deployment.ready && deployment.buildingAt ? Math.round((deployment.ready - deployment.buildingAt) / 1000) : null,
    }));
  }
}
