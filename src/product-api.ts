/**
 * product.bevmaq.com, the public BEVMAQ product API.
 *
 *   GET /v1/?limit=&offset=&search=   every listing, sold ones included (no photos)
 *   GET /v1/{sku}/                    one listing with images, videos, documents
 *   GET /v1/status/                   every SKU with `available` and the current price
 *
 * The list endpoint ignores an `available` query parameter, so `/v1/status/` is the
 * authority on availability and price. Results are cached in memory for a short while so
 * a burst of tool calls from one conversation does not hammer the API.
 */

export interface Named {
  id?: string;
  name: string;
  slug?: string;
}

export interface ApiPrice {
  amount: number;
  currency: string;
}

export interface ApiListing {
  id: string;
  sku: string;
  slug: string;
  title: string;
  model?: { name?: string; manufacturer?: Named } | null;
  category?: Named | null;
  type?: Named | null;
  country?: (Named & { alpha2?: string }) | null;
  description?: string | null;
  price?: ApiPrice | null;
  year?: number | null;
  thumbnail_image?: string | null;
  available?: boolean;
  available_from?: string | null;
  last_updated?: string | null;
  created?: string | null;
  images?: { url: string; perspective?: string | null }[];
  videos?: { url: string }[];
  documents?: { url: string; name?: string | null }[];
}

export interface StatusRow {
  sku: string;
  available: boolean;
  slug: string;
  price: ApiPrice | null;
}

const DEFAULT_BASE = "https://product.bevmaq.com/v1/";
const USER_AGENT = "bmcp/0.1 (+https://github.com/2701kai/bmcp)";
const LIST_PAGE = 2000;

export interface ProductApiOptions {
  baseUrl?: string;
  /** How long list and status responses are reused, in milliseconds. */
  ttlMs?: number;
  fetch?: typeof fetch;
}

interface Cached<T> {
  at: number;
  value: T;
}

export class ProductApi {
  readonly baseUrl: string;
  private readonly ttlMs: number;
  private readonly fetchImpl: typeof fetch;
  private status?: Cached<StatusRow[]>;
  private listings?: Cached<ApiListing[]>;
  private readonly details = new Map<string, Cached<ApiListing | null>>();

  constructor(options: ProductApiOptions = {}) {
    this.baseUrl = (options.baseUrl ?? process.env.BEVMAQ_PRODUCT_API ?? DEFAULT_BASE).replace(/\/?$/, "/");
    this.ttlMs = options.ttlMs ?? 5 * 60 * 1000;
    this.fetchImpl = options.fetch ?? fetch;
  }

  private async get<T>(path: string, params: Record<string, string | number> = {}): Promise<T> {
    const url = new URL(path, this.baseUrl);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
    const response = await this.fetchImpl(url, { headers: { "User-Agent": USER_AGENT, Accept: "application/json" } });
    if (!response.ok) throw new Error(`product API ${response.status} for ${url.pathname}`);
    return (await response.json()) as T;
  }

  private fresh<T>(entry: Cached<T> | undefined): T | undefined {
    return entry && Date.now() - entry.at < this.ttlMs ? entry.value : undefined;
  }

  /** Every SKU with its availability flag and current price. */
  async statusRows(): Promise<StatusRow[]> {
    const cached = this.fresh(this.status);
    if (cached) return cached;
    const rows = await this.get<StatusRow[]>("status/");
    this.status = { at: Date.now(), value: rows };
    return rows;
  }

  /** Every listing the API knows, sold ones included, without photos. */
  async allListings(): Promise<ApiListing[]> {
    const cached = this.fresh(this.listings);
    if (cached) return cached;
    const records: ApiListing[] = [];
    let offset = 0;
    for (;;) {
      const page = await this.get<{ results: ApiListing[]; next: string | null }>("", { limit: LIST_PAGE, offset });
      records.push(...page.results);
      if (!page.next || page.results.length === 0) break;
      offset += page.results.length;
    }
    this.listings = { at: Date.now(), value: records };
    return records;
  }

  /** The available listings, with the price the storefront shows right now. */
  async availableListings(): Promise<ApiListing[]> {
    const [rows, listings] = await Promise.all([this.statusRows(), this.allListings()]);
    const status = new Map(rows.map((row) => [row.sku, row]));
    return listings
      .filter((listing) => status.get(listing.sku)?.available)
      .map((listing) => ({ ...listing, available: true, price: status.get(listing.sku)?.price ?? listing.price ?? null }));
  }

  /** One listing with photos, or null for an unknown SKU. */
  async listing(sku: string): Promise<ApiListing | null> {
    const key = sku.trim().toUpperCase();
    const cached = this.details.get(key);
    if (cached && Date.now() - cached.at < this.ttlMs) return cached.value;
    let value: ApiListing | null;
    try {
      value = await this.get<ApiListing>(`${key}/`);
    } catch (error) {
      if (error instanceof Error && /\b404\b/.test(error.message)) value = null;
      else throw error;
    }
    if (value) {
      const status = (await this.statusRows()).find((row) => row.sku === key);
      if (status) value = { ...value, available: status.available, price: status.price ?? value.price ?? null };
    }
    this.details.set(key, { at: Date.now(), value });
    return value;
  }
}
