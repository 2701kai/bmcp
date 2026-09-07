/**
 * Bearer-token auth for the HTTP transport. `BMCP_TOKEN` unset means an open server
 * (fine for local development and for a server that only exposes public data); set, every
 * request to /mcp must carry `Authorization: Bearer <token>`. Several tokens can be
 * comma-separated, so Claude Code and the claude.ai connector can hold different ones.
 *
 * claude.ai custom connectors accept a fixed request header (their "static headers"
 * option) and Claude Code takes `--header "Authorization: Bearer ..."`, so this covers both
 * without an OAuth server. Switch to OAuth when the server holds per-user data.
 */

import { timingSafeEqual } from "node:crypto";

export function allowedTokens(raw = process.env.BMCP_TOKEN ?? ""): string[] {
  return raw
    .split(",")
    .map((token) => token.trim())
    .filter(Boolean);
}

function equal(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/** True when the request may proceed: no tokens configured, or a matching bearer token. */
export function authorized(request: Request, tokens: string[]): boolean {
  if (!tokens.length) return true;
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match || !match[1]) return false;
  const presented = match[1].trim();
  return tokens.some((token) => equal(token, presented));
}
