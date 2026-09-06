import { describe, expect, test } from "bun:test";
import { allowedTokens, authorized } from "../src/auth.ts";

describe("bearer auth", () => {
  const request = (auth?: string) => new Request("http://x/mcp", { headers: auth ? { authorization: auth } : {} });

  test("open when no token is configured", () => {
    expect(authorized(request(), [])).toBe(true);
  });

  test("checks the bearer token, several allowed", () => {
    const tokens = allowedTokens(" alpha, beta ");
    expect(tokens).toEqual(["alpha", "beta"]);
    expect(authorized(request("Bearer beta"), tokens)).toBe(true);
    expect(authorized(request("bearer alpha"), tokens)).toBe(true);
    expect(authorized(request("Bearer gamma"), tokens)).toBe(false);
    expect(authorized(request(), tokens)).toBe(false);
  });
});
